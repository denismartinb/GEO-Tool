"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { SettingRow } from "@/components/settings/setting-row";
import { Switch } from "@/components/settings/switch";

type NotificationKey = "visibility" | "competitor" | "weekly" | "recs" | "scan" | "product";

const ROWS: { key: NotificationKey; title: string; desc: string; last?: boolean }[] = [
  { key: "visibility", title: "Cambios de visibilidad", desc: "Cuando tu GEO Score sube o baja de forma significativa" },
  { key: "competitor", title: "Movimientos de competidores", desc: "Cuando un competidor te adelanta o pierde posiciones" },
  { key: "weekly", title: "Resumen semanal", desc: "Un email cada lunes con la evolución de la semana" },
  { key: "recs", title: "Nuevas recomendaciones", desc: "Cuando se generan acciones prioritarias para tu marca" },
  { key: "scan", title: "Escaneos completados", desc: "Aviso cada vez que termina un escaneo" },
  { key: "product", title: "Novedades de producto", desc: "Mejoras y nuevas funciones de GEO Studio", last: true }
];

const DEFAULTS: Record<NotificationKey, boolean> = {
  visibility: true,
  competitor: true,
  weekly: true,
  recs: true,
  scan: false,
  product: false
};

export function NotificationsTab() {
  const [n, setN] = useState(DEFAULTS);
  const set = (key: NotificationKey) => (value: boolean) => setN((current) => ({ ...current, [key]: value }));

  return (
    <div className="set-pane">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <p className="card-title">Notificaciones por email</p>
          <InfoTip text="Las notificaciones se envían al email de tu perfil. Cada usuario gestiona las suyas." />
        </CardHeader>
        <CardContent>
          {ROWS.map((row) => (
            <SettingRow key={row.key} title={row.title} desc={row.desc} last={row.last}>
              <Switch on={n[row.key]} onChange={set(row.key)} />
            </SettingRow>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
