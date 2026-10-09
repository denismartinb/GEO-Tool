import Image from "next/image";
import Link from "next/link";
import { FREE_REPORT_ENTRY, freeReportHref } from "@/lib/free-report/promo";

/**
 * FREE-REPORT-2 — the free report offered inside the page, where a pop-up
 * would compete with the trial signup (home, pricing). Design:
 * `docs/design-reference/free-report-1/` (Portada-*, Precios-*), log §250.
 */

const COVER_SRC = "/informe-gratis/portada-ejemplo.webp";

const BAND_POINTS = [
  "En qué preguntas te nombran",
  "A quién recomiendan en tu lugar",
  "Qué cambiar primero"
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10.5 L8 14 L16 6" stroke="#09c5d6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Home band, between «Cinco pantallas» and the FAQ. */
export function FreeReportBand() {
  return (
    <section className="lp-section fr-band-sec" aria-labelledby="fr-band-title">
      <div className="lp-inner">
        <div className="fr-band">
          <div className="fr-band-copy">
            <span className="fr-band-pill">Informe gratuito · en 48 h laborables</span>
            <h2 className="fr-band-title" id="fr-band-title">
              ¿Lo analizamos? <span className="fr-grad">Te enviamos gratis un informe de tu marca.</span>
            </h2>
            <ul className="fr-band-list">
              {BAND_POINTS.map((point) => (
                <li key={point}>
                  <Check />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="fr-band-actions">
              <Link className="fr-band-cta" href={freeReportHref(FREE_REPORT_ENTRY.homeBand)}>
                Pedir mi informe gratis
              </Link>
            </div>
          </div>
          <figure className="fr-band-cover">
            <Image
              src={COVER_SRC}
              alt="Portada de un informe GenScore de ejemplo"
              width={794}
              height={1123}
              sizes="(max-width: 760px) 150px, 210px"
            />
          </figure>
        </div>
      </div>
    </section>
  );
}

/** One line under the pricing cards. */
export function FreeReportPriceLine() {
  return (
    <div className="fr-price-line">
      <Image src={COVER_SRC} alt="" width={794} height={1123} sizes="40px" />
      <p>
        <strong>¿Aún dudas?</strong> Pide antes tu informe gratis y mira qué dice la IA de tu marca.{" "}
        <Link href={freeReportHref(FREE_REPORT_ENTRY.pricingLine)}>Pedir mi informe gratis →</Link>
      </p>
    </div>
  );
}
