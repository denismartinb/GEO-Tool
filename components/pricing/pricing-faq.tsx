"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PLAN_FAQ } from "@/app/pricing/plans-data";

/**
 * El acordeón de «Lo que suelen preguntarnos» (PRELAUNCH-HARDENING-1 Fase V,
 * V4). Es lo único de `/pricing` que necesita estado, y era el motivo de que
 * la página entera —tres tarjetas de plan, la matriz de comparación, el pie—
 * se enviara al navegador para hidratarse.
 *
 * El texto sigue viniendo de `PLAN_FAQ`, la misma lista que
 * `app/pricing/page.tsx` marca como `FAQPage` para los buscadores. Son una
 * sola fuente a propósito: un schema que anuncia preguntas que la página no
 * muestra es exactamente lo que SEO-POS-1 (T8) evitó.
 *
 * La primera pregunta nace abierta, como antes.
 */
export function PricingFaq() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="price-faq">
      {PLAN_FAQ.map((f, i) => (
        <div className={"price-faq-item" + (openFaq === i ? " open" : "")} key={f.q}>
          <button
            type="button"
            className="price-faq-q"
            aria-expanded={openFaq === i}
            onClick={() => setOpenFaq((o) => (o === i ? -1 : i))}
          >
            <span>{f.q}</span>
            <Icon name={openFaq === i ? "chevDown" : "chevRight"} size={16} className="price-faq-chev" />
          </button>
          <div className="price-faq-a"><p>{f.a}</p></div>
        </div>
      ))}
    </div>
  );
}
