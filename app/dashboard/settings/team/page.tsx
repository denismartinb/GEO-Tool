import { redirect } from "next/navigation";

// The "Equipo" tab was hidden in 2026-07-12 (multi-user accounts are not a
// launch priority) and CONSOLE-REDESIGN-1 removed the tab bar entirely. The
// route still redirects rather than 404ing so a stale link or bookmark lands
// somewhere useful.
export default function TeamSettingsPage() {
  redirect("/dashboard/settings#cuenta");
}
