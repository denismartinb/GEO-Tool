"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SettingRow } from "@/components/settings/setting-row";
import { Switch } from "@/components/settings/switch";
import {
  updateNotificationPreference,
  type NotificationPreferenceKey
} from "@/app/dashboard/settings/notifications/actions";

/**
 * CONSOLE-REDESIGN-1. Only the two alerts that actually send an email are
 * rows now.
 *
 * The previous version listed six, four of them disabled behind a
 * "Próximamente" badge — a screen where two thirds of the controls are dead
 * reads as a roadmap, not as a setting. The four unbuilt ones become one line
 * of text at the foot, which says the same thing without four inert switches
 * taking up more room than the working feature.
 *
 * `visibility` sends the score-drop alert (Fase 6a) and `weekly` the Monday
 * digest (Fase 6b, gated behind CRON_DIGEST_ENABLED). Both persist server-side.
 */
type NotificationKey = "visibility" | "weekly";

const ROWS: { key: NotificationKey; persisted: NotificationPreferenceKey; title: string; desc: string }[] = [
  {
    key: "visibility",
    persisted: "notify_score_drop_alert",
    title: "Cambios de visibilidad",
    desc: "Si tu GEO Score se mueve de forma significativa"
  },
  {
    key: "weekly",
    persisted: "notify_weekly_digest",
    title: "Resumen semanal",
    desc: "Cada lunes, cómo fue la semana"
  }
];

export function NotificationsSection({
  initialScoreDropAlert,
  initialWeeklyDigest
}: {
  initialScoreDropAlert: boolean;
  initialWeeklyDigest: boolean;
}) {
  const [state, setState] = useState<Record<NotificationKey, boolean>>({
    visibility: initialScoreDropAlert,
    weekly: initialWeeklyDigest
  });
  const [, startTransition] = useTransition();

  const set = (key: NotificationKey, persisted: NotificationPreferenceKey) => (value: boolean) => {
    const previous = state[key];
    setState((current) => ({ ...current, [key]: value }));

    startTransition(async () => {
      const result = await updateNotificationPreference(persisted, value);
      if (!result.success) {
        setState((current) => ({ ...current, [key]: previous }));
      }
    });
  };

  return (
    <Card>
      <CardContent>
        {ROWS.map((row, index) => (
          <SettingRow key={row.key} title={row.title} desc={row.desc} last={index === ROWS.length - 1}>
            <Switch on={state[row.key]} onChange={set(row.key, row.persisted)} />
          </SettingRow>
        ))}
        <p className="set-quiet">
          Iremos añadiendo avisos de competidores, recomendaciones y escaneos. Te lo diremos cuando estén.
        </p>
      </CardContent>
    </Card>
  );
}
