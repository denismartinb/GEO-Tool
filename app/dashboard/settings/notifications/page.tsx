import { requireUser } from "@/lib/auth";
import { NotificationsTab } from "@/components/settings/notifications-tab";

export default async function NotificationsSettingsPage() {
  await requireUser();

  return <NotificationsTab />;
}
