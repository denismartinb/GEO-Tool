import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountRole } from "@/lib/account-role";
import { ProfileTab } from "@/components/settings/profile-tab";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getAccountRole();
  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return <ProfileTab email={email} role={role} initials={initials} />;
}
