"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { SettingRow } from "@/components/settings/setting-row";
import { Switch } from "@/components/settings/switch";
import { updateNotificationPreference, type NotificationPreferenceKey } from "@/app/dashboard/settings/notifications/actions";

type NotificationKey = "visibility" | "competitor" | "weekly" | "recs" | "scan" | "product";

// "visibility" (Fase 6a) and "weekly" (Fase 6b) send real emails now — both
// have a working backend (score-drop alert; weekly digest cron, gated
// behind CRON_DIGEST_ENABLED until the founder turns it on in Vercel). The
// other three still show disabled with a "Próximamente" badge: none of them
// controls an email that actually exists yet (docs/ux-qa-audit-2026-07.md,
// findings 2 and 3).
const ROWS: { key: NotificationKey; title: string; desc: string; comingSoon?: boolean; last?: boolean }[] = [
  { key: "visibility", title: "Cambios de visibilidad", desc: "Cuando tu GEO Score sube o baja de forma significativa" },
  { key: "weekly", title: "Resumen semanal", desc: "Un email cada lunes con la evolución de la semana" },
  { key: "competitor", title: "Movimientos de competidores", desc: "Cuando un competidor te adelanta o pierde posiciones", comingSoon: true },
  { key: "recs", title: "Nuevas recomendaciones", desc: "Cuando se generan acciones prioritarias para tu marca", comingSoon: true },
  { key: "scan", title: "Escaneos completados", desc: "Aviso cada vez que termina un escaneo", comingSoon: true },
  { key: "product", title: "Novedades de producto", desc: "Mejoras y nuevas funciones de GEO Studio", comingSoon: true, last: true }
];

// visibility (Fase 6a) and weekly (Fase 6b) are persisted server-side; the
// rest stay client-only placeholders until their own phase.
const PERSISTED_KEYS: Partial<Record<NotificationKey, NotificationPreferenceKey>> = {
  visibility: "notify_score_drop_alert",
  weekly: "notify_weekly_digest"
};

const LOCAL_DEFAULTS: Record<NotificationKey, boolean> = {
  visibility: true,
  competitor: true,
  weekly: true,
  recs: true,
  scan: false,
  product: false
};

export function NotificationsTab({
  initialScoreDropAlert,
  initialWeeklyDigest
}: {
  initialScoreDropAlert: boolean;
  initialWeeklyDigest: boolean;
}) {
  const [n, setN] = useState<Record<NotificationKey, boolean>>({
    ...LOCAL_DEFAULTS,
    visibility: initialScoreDropAlert,
    weekly: initialWeeklyDigest
  });
  const [, startTransition] = useTransition();

  const set = (key: NotificationKey) => (value: boolean) => {
    const previous = n[key];
    setN((current) => ({ ...current, [key]: value }));

    const persistedKey = PERSISTED_KEYS[key];
    if (!persistedKey) return;

    startTransition(async () => {
      const result = await updateNotificationPreference(persistedKey, value);
      if (!result.success) {
        setN((current) => ({ ...current, [key]: previous }));
      }
    });
  };

  return (
    <div className="set-pane">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <p className="card-title">Notificaciones por email</p>
          <InfoTip text="Las notificaciones se envían al email de tu perfil. Cada usuario gestiona las suyas." />
        </CardHeader>
        <CardContent>
          {ROWS.map((row) => (
            <SettingRow
              key={row.key}
              title={
                row.comingSoon ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {row.title}
                    <span className="badge badge-neutral" style={{ fontSize: 10.5 }}>
                      Próximamente
                    </span>
                  </span>
                ) : (
                  row.title
                )
              }
              desc={row.desc}
              last={row.last}
            >
              <Switch on={row.comingSoon ? false : n[row.key]} onChange={set(row.key)} disabled={row.comingSoon} />
            </SettingRow>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
