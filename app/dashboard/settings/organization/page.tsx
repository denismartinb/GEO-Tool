import { redirect } from "next/navigation";

// CONSOLE-REDESIGN-1: Organización no longer has a screen of its own — the
// declarative fields are a collapsed fold inside Cuenta and the fiscal ones
// moved to Plan. Permanent redirect, same reason as profile/page.tsx.
export default function OrganizationSettingsPage() {
  redirect("/dashboard/settings#cuenta");
}
