import { getNotificationsPageData } from "@/lib/project-workspace";
import { NotificationsPageClient } from "@/components/notifications-page-client";

export default async function NotificationsPage() {
  const { projects, notifications } = await getNotificationsPageData();

  const domainByProjectId = projects.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.domain;
    return acc;
  }, {});

  return (
    <div className="page">
      <NotificationsPageClient notifications={notifications} domainByProjectId={domainByProjectId} />
    </div>
  );
}
