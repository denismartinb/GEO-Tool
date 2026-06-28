import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountRole } from "@/lib/account-role";
import { TeamTab } from "@/components/settings/team-tab";

export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getAccountRole();
  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return <TeamTab role={role} currentUser={{ email, initials }} />;
}
