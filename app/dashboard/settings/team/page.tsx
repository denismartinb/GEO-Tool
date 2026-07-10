import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { TeamTab } from "@/components/settings/team-tab";

export default async function TeamSettingsPage() {
  const { user } = await requireUser();

  const role = await getAccountRole();
  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return <TeamTab role={role} currentUser={{ email, initials }} />;
}
