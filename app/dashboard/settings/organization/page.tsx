import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountRole } from "@/lib/account-role";
import { OrganizationTab } from "@/components/settings/organization-tab";

export default async function OrganizationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getAccountRole();

  return <OrganizationTab role={role} />;
}
