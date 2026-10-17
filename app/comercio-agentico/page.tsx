import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { AgentScene } from "@/components/agentic/agent-scene";
import { AgenticChecker } from "@/components/agentic/agentic-checker";
import { PsiExample } from "@/components/agentic/psi-example";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import { contentMetadata } from "@/lib/seo/metadata";
import "./comercio-agentico.css";

const PAGE_PATH = "/comercio-agentico";

/**
 * AGENTIC-COMMERCE-1 Fase 1: «¿Pueden comprar los agentes en tu web?».
 *
 * Ported from the design the founder approved on 2026-10-17
 * (`docs/design-reference/agentic-commerce-1/`). The checker at the top is
 * real (`/api/comercio-agentico/comprobar`, no LLM); the scene and the
 * five-component block are illustrations and say so.
 *
 * Copy that differs from the prototype, on purpose: the console part
 * (Auditoría agéntica, Visibilidad en agentes) ships in a later phase, so the
 * page never promises it as available today. The «Auditoría agéntica» card is
 * marked «Próximamente» and the free result has no Pro gate.
 */
export const metadata: Metadata = contentMetadata({
  title: "Comercio agéntico: ¿los agentes pueden comprar en tu web? · GenScore",
  description:
    "Comprueba gratis si un agente de IA puede entrar en tu tienda, entender tus productos y llegar al pago. Visibilidad agéntica en cinco componentes.",
  path: PAGE_PATH
});

const FAQ_ITEMS = [
  {
    question: "¿Qué es el comercio agéntico?",
    answer:
      "La compra que hace un agente de IA en nombre de una persona: busca, compara, elige y, con su permiso, paga. Puede hacerlo con un navegador, como una persona, o a través de un protocolo que publica la tienda."
  },
  {
    question: "¿Ya se puede comprar con agentes en España?",
    answer:
      "No de forma general. A octubre de 2026 la compra dentro de los asistentes funciona en Estados Unidos, y los agentes personales que compran están en Estados Unidos o por invitación. En España sí importa ya que la IA te nombre y que tu web se entienda."
  },
  {
    question: "¿Tengo que implantar UCP o ACP?",
    answer:
      "Todavía no te hace falta en España. El comprobador te dice qué tienes publicado hoy, para que sepas qué te falta el día que llegue. Si usas Shopify, buena parte llega hecha."
  },
  {
    question: "¿Debería bloquear a los agentes?",
    answer:
      "Es una decisión de negocio. Lo que no conviene es que la tome tu anti-bots por defecto. El comprobador te dice a qué asistentes deja pasar tu robots.txt hoy y si tu web pone un reto a las visitas automáticas."
  }
];

const AGENTS = [
  { name: "Muse", by: "Meta", logo: "/comercio-agentico/muse.svg", full: false, pays: "Tarjeta de un solo uso de Link", where: "EE. UU. y Canadá" },
  { name: "Dots", by: "OpenAI", logo: "/comercio-agentico/chatgpt.svg", full: false, pays: "No publicado", where: "Planes Pro y Business Premium" },
  { name: "Instinct", by: "Startup", logo: "/comercio-agentico/instinct-logo.webp", full: true, pays: "Shop Pay en tiendas Shopify", where: "Por invitación" },
  { name: "Grok Bot", by: "xAI", logo: "/comercio-agentico/grok-bot.svg", full: false, pays: "Tarjeta virtual de Link", where: "EE. UU." },
  { name: "Tab", by: "Startup", logo: "/comercio-agentico/tab-logo.webp", full: true, pays: "Monedero propio", where: "EE. UU." }
];

export default function AgenticCommercePage() {
  return (
    <div className="lp">
      <PublicHeader activeHref={PAGE_PATH} />
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "Comercio agéntico", url: `${SITE_ORIGIN}${PAGE_PATH}` }
        ]}
      />
      <FaqPageSchema items={FAQ_ITEMS} />

      <main className="ca-page">
        <header className="ca-hero ca-lhero">
          <div className="ca-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="ca-in">
            <span className="ca-eyebrow">
              <span className="ca-dot-live" aria-hidden="true" />
              Comercio agéntico
            </span>
            <h1 className="ca-h1">
              Los agentes de IA ya compran.
              <br />
              <span className="ca-acc">¿Pueden comprar en tu web?</span>
            </h1>
            <p className="ca-lead">
              Un agente recibe un encargo, busca, compara y compra por tu cliente. Para elegirte tiene que entrar en tu tienda,
              entender tus productos y llegar al pago.
            </p>
            <AgenticChecker />
          </div>

          <AgentScene />
        </header>

        <section className="ca-sec">
          <div className="ca-grid2 ca-qe">
            <div>
              <div className="ca-kick">Qué es</div>
              <h2 className="ca-h2">Comprar sin abrir la web. Vender sin ver al cliente.</h2>
              <p className="ca-sub">
                El comercio agéntico es la compra que hace un agente de IA en nombre de una persona. Tú le das un encargo y él
                busca, compara, elige y, con tu permiso, paga. Las tiendas seguirán vendiendo, pero los compradores ya no serán
                únicamente las personas.
              </p>
            </div>
            <div className="ca-modes">
              <div className="ca-mode">
                <div className="ca-mode-art" aria-hidden="true">
                  <div className="ca-mb">
                    <div className="ca-mb-bar">
                      <i />
                      <i />
                      <i />
                      <span>tutienda.es/cumbre-trail-3</span>
                    </div>
                    <div className="ca-mb-body">
                      <div className="ca-mb-img" />
                      <div className="ca-mb-tx">
                        <i />
                        <i className="ca-s" />
                        <b>89,00 €</b>
                        <span className="ca-mb-buy">Comprar</span>
                      </div>
                    </div>
                    <div className="ca-mb-ptr">
                      <svg viewBox="0 0 24 24">
                        <path d="M5 3l14 6.2-5.9 2-2 5.9z" fill="#0b1426" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                      </svg>
                      <span>Agente</span>
                    </div>
                  </div>
                </div>
                <div className="ca-mode-tx">
                  <span className="ca-mode-k">Ya pasa hoy, en cualquier tienda</span>
                  <h3 className="ca-mode-h">Con navegador</h3>
                  <p>El agente abre tu web como una persona, lee la ficha y rellena el checkout. Tu tienda debe estar optimizada para permitir la navegación agéntica sin obstáculos.</p>
                </div>
              </div>
              <div className="ca-mode">
                <div className="ca-mode-art" aria-hidden="true">
                  <div className="ca-px">
                    <div className="ca-px-n">
                      <span className="ca-px-i ca-st">
                        <svg viewBox="0 0 24 24">
                          <path
                            d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <small>Tu tienda</small>
                    </div>
                    <div className="ca-px-pipe">
                      <span className="ca-px-lane">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="ca-px-lane ca-rev">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="ca-px-tags">
                        <em>UCP</em>
                        <em>MCP</em>
                        <em>ACP</em>
                      </span>
                    </div>
                    <div className="ca-px-n">
                      <span className="ca-px-i ca-ag">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="#fff" />
                        </svg>
                      </span>
                      <small>Agente</small>
                    </div>
                  </div>
                </div>
                <div className="ca-mode-tx">
                  <span className="ca-mode-k">Lo que viene: un canal directo</span>
                  <h3 className="ca-mode-h">Con protocolo</h3>
                  <p>La tienda publica un canal propio para agentes: UCP de Google y Shopify, ACP de OpenAI y Stripe, AP2 para el pago.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ca-sec ca-sec-tight">
          <div className="ca-center">
            <div className="ca-kick">Los agentes que ya compran</div>
            <h2 className="ca-h2">Han llegado este otoño. Y entran como una persona.</h2>
            <p className="ca-sub">Agentes personales que compran con el permiso de su usuario.</p>
          </div>
          <div className="ca-grid5 ca-agents">
            {AGENTS.map((agent) => (
              <div className="ca-agent" key={agent.name}>
                <div className="ca-top">
                  <span className={`ca-lg${agent.full ? " ca-full" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static logos, no optimisation to gain */}
                    <img src={agent.logo} alt="" width={26} height={26} />
                  </span>
                  <div>
                    <b>{agent.name}</b>
                    <small>{agent.by}</small>
                  </div>
                </div>
                <dl>
                  <dt>Paga con</dt>
                  <dd>{agent.pays}</dd>
                  <dt>Dónde</dt>
                  <dd>{agent.where}</dd>
                </dl>
              </div>
            ))}
          </div>
          <p className="ca-ex ca-center">Fuentes: anuncios de Meta, OpenAI, Shopify y Stripe; TechCrunch y WIRED. Octubre de 2026.</p>
        </section>

        <section className="ca-sec ca-sec-tight">
          <div className="ca-quote">
            <div>
              <div className="ca-kick ca-kick-night">Por qué ahora</div>
              <blockquote>«Como mínimo, los catálogos de producto tendrán que optimizarse para que los agentes puedan leerlos.»</blockquote>
              <cite>McKinsey, «The agentic commerce opportunity», octubre de 2025 (traducción propia)</cite>
            </div>
            <div className="ca-doors">
              <div className="ca-door">
                <b>
                  <span>Shopify</span>
                  <span className="ca-v-open">Abre la puerta</span>
                </b>
                <p>El 28 de septiembre de 2026 permitió que los agentes con navegador paguen en las tiendas que lo activen, con la autorización del comprador.</p>
              </div>
              <div className="ca-door">
                <b>
                  <span>Amazon</span>
                  <span className="ca-v-closed">La cierra</span>
                </b>
                <p>Bloqueó a Muse en septiembre y, en octubre, a los pedidos de Grok Bot. «Los agentes de compra de terceros deberían operar de forma abierta.»</p>
              </div>
            </div>
          </div>
        </section>

        <section className="ca-sec ca-sec-tight" id="como">
          <div className="ca-center">
            <div className="ca-kick">Cómo te ayuda GenScore</div>
            <h2 className="ca-h2">Medir, arreglar y ver cómo mejoras.</h2>
          </div>
          <div className="ca-grid3 ca-how">
            <div className="ca-card">
              <div className="ca-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </div>
              <h3 className="ca-card-h">Comprobador gratuito</h3>
              <p>
                Escribe una ficha de tu tienda y en unos segundos ves tu Visibilidad agéntica y lo que más sube la nota. Sin
                registro.
              </p>
            </div>
            <div className="ca-card">
              <div className="ca-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" />
                  <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                </svg>
              </div>
              <h3 className="ca-card-h">
                Auditoría agéntica <span className="ca-new">Próximamente</span>
              </h3>
              <p>
                Llegará a tu consola: acceso de cada agente, datos de producto, envío y devoluciones, checkout y protocolos (UCP,
                ACP, MCP), ficha a ficha.
              </p>
            </div>
            <div className="ca-card">
              <div className="ca-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19h16M7 15l4-4 3 3 5-6" />
                </svg>
              </div>
              <h3 className="ca-card-h">Recomendaciones priorizadas</h3>
              <p>
                Cada recomendación te dice lo que tienes que hacer: desde mejoras de visibilidad, preparación semántica, datos
                estructurados o integración de protocolos agénticos.
              </p>
            </div>
          </div>
          <PsiExample />
        </section>

        {/* Same accordion as the home FAQ (`lp-faq-item` + `FaqAccordion`), at
            the founder's request: open list on desktop, accordion on mobile. */}
        <section className="ca-sec ca-sec-tight ca-faq lp-faq-sec">
          <div className="lp-sec-head">
            <div className="lp-kicker">Preguntas frecuentes</div>
            <h2 className="lp-h2">Lo que nos preguntan</h2>
          </div>
          <div className="lp-faq">
            {FAQ_ITEMS.map((item) => (
              <details className="lp-faq-item" key={item.question} open>
                <summary>
                  <span>{item.question}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <FaqAccordion selector=".lp-faq-item" />
          <p className="ca-faq-more">
            ¿Quieres saber más? Lee <Link href="/blog/que-es-el-comercio-agentico">qué es el comercio agéntico</Link> y{" "}
            <Link href="/blog/web-preparada-para-el-comercio-agentico">cómo preparar tu web</Link>.
          </p>
        </section>

        <section className="ca-sec ca-sec-tight">
          <div className="ca-cta-band">
            <h2 className="ca-h2 ca-cta-h">¿Los agentes pueden comprar en tu web?</h2>
            <p className="ca-sub">Compruébalo gratis. Y si quieres saber si la IA te nombra, prueba Pro 7 días, sin tarjeta.</p>
            <a className="ca-nbtn ca-pri" href="#comprobar">
              Comprobar mi tienda
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
