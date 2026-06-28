import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountRole } from "@/lib/account-role";
import { BillingContent } from "@/components/billing/billing-content";

export default async function BillingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getAccountRole();
  if (role !== "admin") redirect("/dashboard/settings/profile");

  return <BillingContent embedded />;
}
