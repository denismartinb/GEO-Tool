import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * `supabase.auth.getUser()` is a network round trip to the Supabase Auth
 * server, not a local JWT check. `React.cache()` memoizes this per request,
 * so the many call sites that each need the current user (layouts, pages,
 * `requireActiveProject`, `getPlanForUser`, ...) collapse to a single auth
 * round trip instead of one each (docs/architecture-audit-2026-07.md,
 * finding 1.2).
 */
export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
});
