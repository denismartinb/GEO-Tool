import type { Metadata } from "next";
import { getNotificationsPageData } from "@/lib/project-workspace";
import { consoleMetadata } from "@/lib/seo/console-metadata";
import { NotificationsPageClient } from "@/components/notifications-page-client";

// ROOT-METADATA-1: pestaña propia. Ver `lib/seo/console-metadata.ts`.
export const metadata: Metadata = consoleMetadata("Notificaciones");

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
