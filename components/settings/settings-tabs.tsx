"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { AccountRole } from "@/lib/account-role";

const TABS = [
  { href: "/dashboard/settings/profile", label: "Perfil", icon: "user" },
  { href: "/dashboard/settings/organization", label: "Organización", icon: "building" },
  { href: "/dashboard/settings/team", label: "Equipo", icon: "users" },
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
