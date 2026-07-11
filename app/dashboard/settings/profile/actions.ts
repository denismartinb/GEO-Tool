"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";
import { sendAccountDeletedEmail } from "@/lib/email/transactional";

const nameSchema = z.string().trim().min(1).max(80);
const optionalNameSchema = z.string().trim().max(80);
const newPasswordSchema = z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres.");

export type UpdateProfileNameResult = { success: true } | { success: false; error: string };

export async function updateProfileName(firstName: string, lastName: string): Promise<UpdateProfileNameResult> {
  const parsedFirst = nameSchema.safeParse(firstName);
  const parsedLast = optionalNameSchema.safeParse(lastName);

  if (!parsedFirst.success) {
    return { success: false, error: "Introduce un nombre válido." };
  }
  if (!parsedLast.success) {
    return { success: false, error: "Los apellidos son demasiado largos." };
  }

  const { supabase } = await requireUser();

  const { error } = await supabase.auth.updateUser({
    data: { first_name: parsedFirst.data, last_name: parsedLast.data }
  });

  if (error) {
    return { success: false, error: "No se pudo guardar el nombre. Inténtalo de nuevo." };
  }

  return { success: true };
}

export type ChangePasswordResult = { success: true } | { success: false; error: string };

export async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const parsedCurrent = z.string().min(1).safeParse(currentPassword);
  if (!parsedCurrent.success) {
    return { success: false, error: "Introduce tu contraseña actual." };
  }

  const parsedNew = newPasswordSchema.safeParse(newPassword);
  if (!parsedNew.success) {
    return { success: false, error: parsedNew.error.issues[0]?.message ?? "Contraseña no válida." };
  }

  const { supabase, user } = await requireUser();
  const email = user.email;
  if (!email) {
    return { success: false, error: "No se pudo verificar tu cuenta." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: parsedCurrent.data
  });

  if (verifyError) {
    return { success: false, error: "La contraseña actual no es correcta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsedNew.data });

  if (updateError) {
    return { success: false, error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." };
  }

  return { success: true };
}

const confirmationEmailSchema = z.string().trim().min(1);

export type DeleteAccountResult = { success: true } | { success: false; error: string };

/**
 * Permanently deletes the caller's account and every project they own
 * (ACCOUNT-DELETE-1). Irreversible — there is no soft-delete or archive
 * fallback here, mirroring `deleteProject`.
 *
 * Order matters: cancel Stripe first (a real billing side effect that must
 * either succeed or block the whole operation), then delete owned projects
 * (cascades to all project-scoped data per the FK graph), then delete the
 * auth user last (profiles.id -> auth.users cascades, so the profile row
 * disappears with it). If any step after Stripe fails, the caller can just
 * retry deleteAccount — re-deleting zero projects or a subscription that's
 * already gone are both treated as success, not failure, so a retry always
 * converges instead of getting stuck re-failing on work already done.
 */
export async function deleteAccount(confirmationEmail: string): Promise<DeleteAccountResult> {
  const parsedEmail = confirmationEmailSchema.safeParse(confirmationEmail);
  if (!parsedEmail.success) {
    return { success: false, error: "Introduce tu email para confirmar." };
  }

  const { supabase, user } = await requireUser();

  // Case-insensitive: email addresses are effectively case-insensitive in
  // practice (and Supabase Auth itself normalizes to lowercase on signup),
  // so requiring an exact-case match would only add friction without adding
  // real confirmation strength.
  const accountEmail = (user.email ?? "").trim().toLowerCase();
  if (!accountEmail || parsedEmail.data.toLowerCase() !== accountEmail) {
    return { success: false, error: "El email no coincide." };
  }

  // Step A: cancel any real Stripe subscription first. A real (non
  // resource_missing) Stripe failure aborts before anything is deleted.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const subscriptionId = profileRow?.stripe_subscription_id as string | null | undefined;
  if (subscriptionId) {
    const stripe = getStripeClient();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (stripeError) {
        const code = (stripeError as { code?: string } | null)?.code;
        const alreadyGone = code === "resource_missing";
        if (!alreadyGone) {
          console.error("[geo:profile] failed to cancel Stripe subscription on account deletion", {
            userId: user.id,
            subscriptionId,
            message: stripeError instanceof Error ? stripeError.message : String(stripeError)
          });
          return { success: false, error: "No se pudo cancelar tu suscripción activa. Inténtalo de nuevo." };
        }
      }
    }
  }

  // Step B: delete every project owned by this account. Cascades (migration
  // 0006) remove scan_runs, scan_prompt_results, run_scores, recommendations,
  // generated_solutions, project_competitors, project_prompts, jobs,
  // job_logs and web_audit_snapshots. `count === 0` (no projects, or a retry
  // after a previous attempt already deleted them) is not a failure.
  const { error: deleteProjectsError } = await supabase
    .from("projects")
    .delete({ count: "exact" })
    .eq("owner_user_id", user.id);

  if (deleteProjectsError) {
    return { success: false, error: "No se pudieron eliminar tus dominios. Inténtalo de nuevo." };
  }

  // Step C: delete the auth user itself (privileged — requires the service
  // role). `profiles.id -> auth.users on delete cascade` removes the profile
  // row as a side effect.
  let serviceClient: ReturnType<typeof createServiceClient>;
  try {
    serviceClient = createServiceClient();
  } catch (configError) {
    console.error("[geo:profile] service client unavailable for deleteAccount", {
      userId: user.id,
      message: configError instanceof Error ? configError.message : String(configError)
    });
    return { success: false, error: "No se pudo eliminar la cuenta. Inténtalo de nuevo." };
  }

  const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error("[geo:profile] failed to delete auth user", {
      userId: user.id,
      message: deleteUserError.message
    });
    return { success: false, error: "No se pudo eliminar la cuenta. Inténtalo de nuevo." };
  }

  // Step D: notify, sign out and redirect. The confirmation email is
  // fire-and-forget (see lib/email/transactional.ts) and must never block
  // this response — the account is already gone at this point regardless.
  // No revalidatePath needed — the redirect takes the browser to a route
  // outside this now-deleted session entirely.
  await sendAccountDeletedEmail(accountEmail);
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
