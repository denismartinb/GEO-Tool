import { redirect } from "next/navigation";

// CONSOLE-REDESIGN-1. Permanent redirect: the footer of every transactional
// email points here ("Puedes desactivar … en Ajustes → Notificaciones",
// lib/email/transactional.ts), so this route has to keep resolving forever.
export default function NotificationsSettingsPage() {
  redirect("/dashboard/settings#avisos");
}
