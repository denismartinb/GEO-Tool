"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { AccountRole } from "@/lib/account-role";

// "Equipo" is hidden (founder decision 2026-07-12, docs/ux-qa-audit-2026-07.md
// F1 follow-up): multi-user accounts are not a launch priority, and the tab
// was only shown honestly-empty after F1 removed the fabricated team. Hiding
// it avoids raising the "can I invite my team?" question before there's an
// answer. /dashboard/settings/team redirects away — see its page.tsx.
const TABS = [
  { href: "/dashboard/settings/profile", label: "Perfil", icon: "user" },
  { href: "/dashboard/settings/organization", label: "Organización", icon: "building" },
  { href: "/dashboard/settings/notifications", label: "Notificaciones", icon: "bell" },
  { href: "/dashboard/settings/billing", label: "Plan y facturación", icon: "card", adminOnly: true }
];

export function SettingsTabs({ role }: { role: AccountRole }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => !tab.adminOnly || role === "admin");

  return (
    <nav className="set-tabs">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`set-tab ${active ? "on" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={tab.icon} size={15} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
