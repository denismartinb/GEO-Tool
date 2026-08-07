import { redirect } from "next/navigation";

// CONSOLE-REDESIGN-1. Permanent redirect: four transactional emails and the
// in-app notification renderer link here (lib/email/transactional.ts,
// lib/notifications/render.ts). The admin check that used to live in this file
// now guards the Plan section itself in app/dashboard/settings/page.tsx, so a
// non-admin landing here simply arrives at a page without that section.
export default function BillingSettingsPage() {
  redirect("/dashboard/settings#plan");
}
