import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { SoftwareApplicationSchema } from "@/components/seo/software-application-schema";
import { contentMetadata } from "@/lib/seo/metadata";

/**
 * SEO-POS-1 (T1). La home era un componente cliente entero, así que no podía
 * exportar `metadata`: heredaba el título genérico "GenScore" del layout raíz,
 * sin descripción propia y sin canonical, siendo la URL comercial más
 * importante del sitio y estando en el sitemap. La página pasa a ser un
 * componente de servidor que solo aporta metadata y monta el mismo árbol de
 * cliente de siempre — cero cambios visuales.
 *
 * Keyword primaria "posicionamiento GEO" (docs/seo-positioning-plan.md §3.1).
 * Los motores nombrados son los tres reales de hoy (Gemini, Claude, ChatGPT):
 * nombrar Perplexity aquí repetiría el reclamo falso que PRICING-TRUTH-1
 * limpió del resto del producto.
 */
export const metadata: Metadata = contentMetadata({
  title: "Posicionamiento GEO: mide si la IA cita tu marca — GenScore",
  description:
    "GenScore mide si ChatGPT, Gemini y Claude mencionan y citan tu marca al responder en tu mercado, te compara con tus competidores y convierte cada hallazgo en acciones priorizadas. Primer escaneo gratis, sin tarjeta.",
  path: ""
});

/**
 * SEO-POS-1 Fase E, E3. La home declaraba sólo el `Organization` del layout
 * raíz: una empresa llamada GenScore, sin decir en ninguna parte legible por
 * máquina qué producto es ni de qué categoría. El `SoftwareApplication` estaba
 * únicamente en `/que-es-genscore`, que es la página correcta para explicarlo
 * a una persona y la peor de las dos para que un motor lo lea, porque es la
 * que menos autoridad acumula.
 */
export default function Page() {
  return (
    <>
      <SoftwareApplicationSchema />
      <LandingPage />
    </>
  );
}
