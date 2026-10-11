"use client";

import { useState } from "react";
import {
  VITAL_ORDER,
  VITAL_THRESHOLDS,
  formatVital,
  rateVital,
  vitalValue,
  type DeviceSpeed,
  type PageSpeedReport,
  type VitalKey,
  type VitalRating
} from "@/lib/web-audit/seo-health";
import { formatDate } from "./format";
import { NewBadge } from "./new-badge";

/**
 * «Optimización de tu página Home» (SEARCH-SEO-1 Fase 2, log §281, design in
 * `docs/design-reference/search-seo-1/salud-seo.html`): the three Core Web
 * Vitals of the home page, mobile and desktop, as Google PageSpeed Insights
 * reported them. Only mobile scores in the Salud SEO, which the card says.
 *
 * Only the device toggle is client state. Rendered only when the audit tried
 * to measure (`pageSpeed !== undefined`): without `PAGESPEED_API_KEY` there
 * is no card at all rather than an empty promise.
 */

type Device = "mobile" | "desktop";

const VITAL_NAMES: Record<VitalKey, Record<Device, string>> = {
  lcp: { mobile: "Carga del contenido principal", desktop: "Carga del contenido principal" },
  inp: { mobile: "Respuesta al tocar", desktop: "Respuesta al hacer clic" },
  cls: { mobile: "Estabilidad visual", desktop: "Estabilidad visual" }
};

/** Right end of each scale: a bit past «lento», so the marker has somewhere to sit. */
const SCALE_MAX: Record<VitalKey, number> = { lcp: 6000, inp: 700, cls: 0.4 };

const RATING_TEXT: Record<VitalRating, string> = { good: "Bueno", needs_improvement: "Mejorable", poor: "Lento" };

export function SpeedCard({ pageSpeed }: { pageSpeed: PageSpeedReport | null }) {
  const [device, setDevice] = useState<Device>("mobile");
  const measured = pageSpeed?.[device] ?? null;

  return (
    <div className="card sa-speed">
      <div className="sa-ch">
        <h3>
          Optimización de tu página Home <NewBadge />
        </h3>
        {pageSpeed && (
          <span className="sa-seg" role="group" aria-label="Dispositivo">
            {(["mobile", "desktop"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>
                {d === "mobile" ? "Móvil" : "Escritorio"}
              </button>
            ))}
          </span>
        )}
      </div>
      <p className="sa-note">
        Las tres medidas con las que Google juzga la experiencia de carga. Puntúa la de móvil, que es la que Google usa
        para ordenar.
      </p>
      {!pageSpeed ? (
        <p className="sa-empty">Google no respondió en esta revisión. Lo volveremos a intentar en la próxima.</p>
      ) : !measured ? (
        <p className="sa-empty">
          Google no devolvió la medición en {device === "mobile" ? "móvil" : "escritorio"} esta vez. Lo volveremos a
          intentar en la próxima revisión.
        </p>
      ) : (
        <>
          <div className="sa-vitals">
            {VITAL_ORDER.map((key) => (
              <VitalTile key={key} vital={key} device={device} speed={measured} />
            ))}
          </div>
          <p className="sa-speed-src">
            {measured.source === "field" ? (
              <>
                <b>Datos de usuarios reales de Chrome</b> de los últimos 28 días, vía Google PageSpeed Insights.
              </>
            ) : (
              <>
                <b>Medición de laboratorio:</b> tu web aún no tiene visitas suficientes en Chrome para que Google publique
                datos reales, así que es una carga simulada por Google PageSpeed Insights.
              </>
            )}{" "}
            Medido el {formatDate(pageSpeed.measuredAt)}.
          </p>
        </>
      )}
    </div>
  );
}

function VitalTile({ vital, device, speed }: { vital: VitalKey; device: Device; speed: DeviceSpeed }) {
  const value = vitalValue(speed, vital);
  const { good, poor } = VITAL_THRESHOLDS[vital];
  const max = SCALE_MAX[vital];
  const name = (
    <span className="sa-vt-l">
      {vital.toUpperCase()}
      <small>{VITAL_NAMES[vital][device]}</small>
    </span>
  );

  if (value === null) {
    return (
      <div className="sa-vt sa-vt-na">
        {name}
        <span className="sa-vt-v">—</span>
        <span className="sa-vt-s">{speed.source === "lab" && vital === "inp" ? "Sólo con usuarios reales" : "Sin dato"}</span>
      </div>
    );
  }

  const rating = rateVital(vital, value);
  const goodPart = (good / max) * 100;
  const needsPart = ((poor - good) / max) * 100;
  const marker = Math.min((value / max) * 100, 98);
  return (
    <div className="sa-vt" data-rating={rating}>
      {name}
      <span className="sa-vt-v">{formatVital(vital, value)}</span>
      <span className="sa-vt-s">{RATING_TEXT[rating]}</span>
      <div className="sa-vt-scale" aria-hidden="true">
        <div
          className="sa-vt-bands"
          style={{ gridTemplateColumns: `${goodPart}fr ${needsPart}fr ${100 - goodPart - needsPart}fr` }}
        >
          <span />
          <span />
          <span />
        </div>
        <i style={{ left: `${marker}%` }} />
      </div>
      <div className="sa-vt-lbl">
        <span>Bueno ≤ {formatVital(vital, good)}</span>
        <span>Lento &gt; {formatVital(vital, poor)}</span>
      </div>
    </div>
  );
}
