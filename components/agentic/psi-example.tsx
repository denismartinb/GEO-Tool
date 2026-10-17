"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge } from "@/components/agentic/gauge";

/**
 * «La Visibilidad agéntica, en cinco componentes» (AGENTIC-COMMERCE-1). An
 * EXAMPLE store, labelled as such on screen: it shows the shape of the
 * result, never a result. Rings fill when the block comes into view; picking
 * one swaps the detail, like the categories in PageSpeed.
 */

type Mark = "pass" | "avg" | "fail";

const COMPONENTS: Array<{
  name: string;
  value: number;
  label?: string;
  weight: string;
  description: string;
  audits: Array<[Mark, string]>;
}> = [
  {
    name: "Descubrimiento",
    value: 38,
    weight: "",
    description:
      "Si un agente puede entrar en tu web: tu robots.txt, si tu protección anti-bots le deja pasar y si publicas sitemap.",
    audits: [
      ["fail", "Tu web pone un reto a las visitas automáticas"],
      ["avg", "Tu robots.txt bloquea a uno de los asistentes"],
      ["pass", "Publicas un sitemap"]
    ]
  },
  {
    name: "Comprensión",
    value: 63,
    weight: "",
    description:
      "Si entiende qué vendes sin adivinar: precio, disponibilidad, identificadores y datos estructurados que se leen sin JavaScript.",
    audits: [
      ["fail", "La ficha no declara el código GTIN"],
      ["fail", "La ficha no declara si hay stock"],
      ["pass", "El precio y la moneda se leen como datos"],
      ["pass", "Datos estructurados de producto"]
    ]
  },
  {
    name: "Confianza",
    value: 65,
    weight: "",
    description:
      "Si un agente puede fiarse de ti y explicárselo a su usuario: envío, devoluciones, reseñas y quién está detrás de la tienda.",
    audits: [
      ["avg", "Enlazas tus devoluciones, pero sin datos estructurados"],
      ["fail", "No vemos reseñas marcadas"],
      ["pass", "Plazos y costes de envío claros"],
      ["pass", "Datos de la empresa y contacto"]
    ]
  },
  {
    name: "Compra",
    value: 40,
    weight: "",
    description:
      "Si puede llegar al pago sin chocar en la ficha: botón de compra, captchas y métodos de pago rápidos.",
    audits: [
      ["fail", "Captcha en la ficha de producto"],
      ["fail", "No vemos pagos rápidos"],
      ["pass", "Botón de añadir al carrito en la página"],
      ["pass", "Plataforma de tienda reconocida"]
    ]
  },
  {
    name: "Interoperabilidad",
    value: 50,
    label: "2/4",
    weight: "2 de 4 protocolos publicados",
    description:
      "Si tienes un canal directo para que los agentes consulten tu catálogo y compren sin pasar por la web: UCP, MCP, la tarjeta de agente A2A y un catálogo público.",
    audits: [
      ["pass", "Perfil UCP publicado"],
      ["pass", "Catálogo por MCP"],
      ["fail", "Tarjeta de agente A2A sin publicar"],
      ["fail", "Catálogo público para máquinas sin publicar"]
    ]
  }
];

export function PsiExample() {
  const root = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setPlay(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlay(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const c = COMPONENTS[selected];
  return (
    <div className="ca-card ca-psi" ref={root}>
      <div className="ca-psi-head">
        <h3 className="ca-psi-title">La Visibilidad agéntica, en cinco componentes</h3>
        <span>Ejemplo de una tienda</span>
      </div>
      <div className="ca-psi-gauges" role="tablist" aria-label="Componentes">
        {COMPONENTS.map((item, i) => (
          <button
            key={item.name}
            type="button"
            className="ca-g"
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
          >
            <Gauge value={item.value} label={item.label} play={play} />
            <b>{item.name}</b>
          </button>
        ))}
      </div>
      <Legend />
      <div className="ca-psi-detail" role="tabpanel">
        <div className="ca-pd-g">
          <Gauge key={selected} value={c.value} label={c.label} big play={play} />
        </div>
        <div className="ca-pd-t">
          <h4 className="ca-pd-name">{c.name}</h4>
          <p>{c.description}</p>
          {c.weight ? <span className="ca-pd-w">{c.weight}</span> : null}
        </div>
        <ul className="ca-pd-a">
          {c.audits.map(([mark, text]) => (
            <li key={text}>
              <span className={`ca-m ca-${mark}`} aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="ca-psi-legend">
      <span>
        <i className="ca-tri" aria-hidden="true" />
        0–49
      </span>
      <span>
        <i className="ca-sq" aria-hidden="true" />
        50–89
      </span>
      <span>
        <i className="ca-ci" aria-hidden="true" />
        90–100
      </span>
    </div>
  );
}
