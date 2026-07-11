import { requireUser } from "@/lib/auth";
import { NotificationsTab } from "@/components/settings/notifications-tab";

export default async function NotificationsSettingsPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("notify_score_drop_alert, notify_weekly_digest")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <NotificationsTab
      initialScoreDropAlert={profile?.notify_score_drop_alert ?? true}
      initialWeeklyDigest={profile?.notify_weekly_digest ?? true}
    />
  );
}
