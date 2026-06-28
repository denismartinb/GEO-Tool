import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationsTab } from "@/components/settings/notifications-tab";

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <NotificationsTab />;
}
