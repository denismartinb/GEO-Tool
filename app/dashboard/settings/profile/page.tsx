import { redirect } from "next/navigation";

// CONSOLE-REDESIGN-1: the four settings screens became one page with anchors.
// This redirect is PERMANENT, not transitional — the footer of every
// transactional email links to a /dashboard/settings/* route
// (lib/email/transactional.ts), and those messages are already in inboxes we
// cannot rewrite. Removing it would break links that are years old.
export default function ProfileSettingsPage() {
  redirect("/dashboard/settings#cuenta");
}
