"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SettingRow } from "@/components/settings/setting-row";
import { Switch } from "@/components/settings/switch";
import { updateNotificationPreference } from "@/app/dashboard/settings/notifications/actions";
import {
  CATEGORY_COPY,
  OPTIONAL_EMAIL_CATEGORIES,
  PREFERENCE_COLUMN,
  type OptionalEmailCategory
} from "@/lib/email/categories";

/**
 * CONSOLE-REDESIGN-1 → EMAIL-UNSUB-1 (log §232). One row per optional email
 * category, named from `lib/email/categories.ts` so this screen, the email
 * footers and `/baja` can never call the same thing two different names.
 *
 * CONSOLE-REDESIGN-1 removed four dead toggles that promised emails nobody
 * sent. The two added here are different on purpose: they exist so a person
 * can opt out BEFORE the first such email reaches them (the legal basis for
 * the lifecycle emails is legitimate interest, and the way out has to exist
 * from day one — founder, 2026-09-28). Their emails ship in Fases C/D.
 *
 * The last row is fixed and disabled: account and billing emails are part of
 * the service and cannot be turned off, and saying so here answers the
 * question before someone writes to support to ask.
 */
export function NotificationsSection({ initial }: { initial: Record<OptionalEmailCategory, boolean> }) {
  const [state, setState] = useState<Record<OptionalEmailCategory, boolean>>(initial);
  const [, startTransition] = useTransition();

  const set = (category: OptionalEmailCategory) => (value: boolean) => {
    const previous = state[category];
    setState((current) => ({ ...current, [category]: value }));

    startTransition(async () => {
      const result = await updateNotificationPreference(PREFERENCE_COLUMN[category], value);
      if (!result.success) {
        setState((current) => ({ ...current, [category]: previous }));
      }
    });
  };

  return (
    <Card>
      <CardContent>
        {OPTIONAL_EMAIL_CATEGORIES.map((category) => (
          <SettingRow key={category} title={CATEGORY_COPY[category].title} desc={CATEGORY_COPY[category].desc}>
            <Switch on={state[category]} onChange={set(category)} />
          </SettingRow>
        ))}
        <SettingRow title="Tu cuenta y facturación" desc="Seguridad, pagos y cambios de plan. Siempre activos." last>
          <Switch on disabled onChange={() => {}} />
        </SettingRow>
      </CardContent>
    </Card>
  );
}
