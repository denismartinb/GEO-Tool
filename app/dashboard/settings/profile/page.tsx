import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { ProfileTab } from "@/components/settings/profile-tab";
import { deriveNameFromEmail } from "@/lib/derive-name-from-email";

export default async function ProfileSettingsPage() {
  const { user } = await requireUser();

  const role = await getAccountRole();
  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  const metadata = user.user_metadata ?? {};
  const [fallbackFirst, ...fallbackLastParts] = deriveNameFromEmail(email).split(" ");
  const firstName =
    typeof metadata.first_name === "string" && metadata.first_name.trim() ? metadata.first_name : fallbackFirst ?? "";
  const lastName =
    typeof metadata.last_name === "string" && metadata.last_name.trim()
      ? metadata.last_name
      : fallbackLastParts.join(" ");

  return <ProfileTab email={email} role={role} initials={initials} firstName={firstName} lastName={lastName} />;
}
