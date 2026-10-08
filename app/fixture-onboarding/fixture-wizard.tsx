"use client";

// FIXTURE-ONLY (rama de previsualización, nunca se fusiona): respuestas fijas en lugar de las
// server actions. No llama a Gemini, Supabase ni Stripe; «Crear dominio» no hace nada.
import { OnboardingWizard } from "@/components/onboarding-wizard";

const LONG_P = "¿Cuál es la mejor tienda online especializada en electrónica de consumo, informática y electrodomésticos para comprar con financiación sin intereses y entrega en 24 horas en toda España, incluyendo Canarias y Baleares?";
const LONG_BRAND = "Grandes Almacenes Internacionales de Distribución Comercial y Moda Sociedad Anónima";

const NORMAL = {
  ok: true as const, brand: "El Corte Inglés", language: "es",
  competitors: [
    { name: "Amazon España", domain: "amazon.es", source: { uri: "https://example.invalid/r/1", title: "amazon.es" } },
    { name: "MediaMarkt", domain: "mediamarkt.es" },
    { name: "Carrefour", domain: "carrefour.es" }
  ],
  prompts: [
    { text: "¿Cuál es la mejor tienda online para comprar electrónica en España?", category: "Casos de uso" as const },
    { text: "¿Qué es un gran almacén y en qué se diferencia de un centro comercial?", category: "Cómo hacer / guía" as const },
    { text: "Mejores tiendas de moda en Madrid", category: "Casos de uso" as const },
    { text: "¿Cuánto cuesta un envío en 24 horas?", category: "Precio y planes" as const },
    { text: "¿Dónde comprar un televisor con entrega en casa?", category: "Casos de uso" as const },
    { text: "¿Qué tienda tiene mejor servicio posventa en electrodomésticos?", category: "Casos de uso" as const },
    { text: "Alternativas a Amazon para comprar tecnología en España", category: "Alternativas" as const },
    { text: "¿Es fiable comprar moda en grandes almacenes online?", category: "Casos de uso" as const }
  ],
  failed: [], reason: null,
  brandProposal: { brand: "El Corte Inglés", source: "homepage_title" as const, pending: false },
  proposedAliases: ["Club del Gourmet"],
  basis: { sector: "Retail", subSector: "Grandes almacenes", country: "ES" }
};

const LARGO = {
  ...NORMAL, brand: LONG_BRAND,
  competitors: [
    { name: "Distribuidora Internacional de Electrodomésticos y Telecomunicaciones del Mediterráneo", domain: "distribuidora-internacional-de-electrodomesticos-mediterraneo.com.es", source: { uri: "https://example.invalid/r/1", title: "distribuidora-internacional-de-electrodomesticos-mediterraneo.com.es" } },
    { name: "MediaMarkt", domain: "mediamarkt.es" }
  ],
  prompts: [
    { text: LONG_P, category: "Casos de uso" as const },
    { text: "Mejores tiendas de moda en Madrid", category: "Casos de uso" as const },
    { text: LONG_P.replace("electrónica", "hogar"), category: "Precio y planes" as const }
  ],
  brandProposal: { brand: LONG_BRAND, source: "homepage_title" as const, pending: false },
  proposedAliases: ["Un alias bastante largo para comprobar el ajuste de líneas del chip"]
};

export function FixtureWizard({ caso }: { caso: "normal" | "largo" }) {
  const data = caso === "largo" ? LARGO : NORMAL;
  return (
    <>
      <div style={{ background: "#fde68a", color: "#111", padding: "6px 12px", fontSize: 12 }}>
        FIXTURE · datos simulados · sin backend (no llama a Gemini, Supabase ni Stripe) · caso {caso} ·
        alternativa responsive en revisión, NO integrada
      </div>
      <OnboardingWizard
        errorMessage={null}
        promptCap={15}
        scanContext={{ planId: "pro", providers: ["gemini", "claude", "openai"], samplingEnabled: true }}
        suggestAction={async () => { await new Promise((r) => setTimeout(r, 200)); return data; }}
        generateMorePromptsAction={async () => ({ ok: false })}
        createAction={async () => {}}
      />
    </>
  );
}
