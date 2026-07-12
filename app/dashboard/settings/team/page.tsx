import { redirect } from "next/navigation";

// The "Equipo" tab is hidden (founder decision 2026-07-12, not a launch
// priority — see components/settings/settings-tabs.tsx). This route redirects
// rather than 404ing so a stale link or bookmark still lands somewhere useful,
// mirroring the /dashboard/billing -> /dashboard/settings/billing pattern.
export default function TeamSettingsPage() {
  redirect("/dashboard/settings/profile");
}
