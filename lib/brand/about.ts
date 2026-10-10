import { CANONICAL_DEFINITION, CONTACT_EMAIL, FOUNDING_YEAR, ORGANIZATION_SAME_AS } from "./canonical-definition";
import { GEO_SCORE_CANONICAL_PATH } from "./geo-score-definition";

/**
 * El texto de `/sobre-genscore` («Quiénes somos»), como datos — GEO-SELF-1
 * Fase 1.
 *
 * Vive aquí y no dentro de la página porque `/llms-full.txt` publica lo mismo
 * en texto plano: dos redacciones de quién es GenScore divergen al primer
 * retoque, y es justo la clase de descripción que un motor contrasta entre
 * superficies (`.claude/rules/growth-content.md`, "La entidad: un solo nodo").
 *
 * **Reglas de esta página, por decisión del fundador:** la entidad es la
 * empresa. No se nombra a ninguna persona, no hay fotos de personas y no se
 * menciona ningún empleador ni trayectoria. Tampoco recuentos absolutos de
 * preguntas o escaneos, ni versiones de modelos (log §246): se dice qué se
 * mide y dónde está el criterio, no cómo está montada la máquina (log §76).
 */
export type AboutSection = {
  heading: string;
  paragraphs: string[];
  /** Enlace interno de cierre de la sección, si la sección remite a otra página. */
  link?: { href: string; label: string };
};

export const ABOUT_TITLE = "Quiénes somos";

export const ABOUT_LEAD = `${CANONICAL_DEFINITION} GenScore, herramienta GEO hecha en España y en castellano, nació en ${FOUNDING_YEAR}.`;

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    heading: "Qué es GenScore",
    paragraphs: [
      "GenScore es una herramienta GEO (Generative Engine Optimization): mide si los asistentes de IA nombran tu marca cuando alguien les pregunta por tu categoría, y te dice qué hacer cuando no lo hacen.",
      `Está hecha en España, en castellano —interfaz, contenido y soporte— y nació en ${FOUNDING_YEAR} para medir un cambio concreto: cada vez más gente pregunta a una IA en vez de buscar en Google, y lo que esa IA responde no se ve desde ninguna herramienta de SEO.`
    ]
  },
  {
    heading: "Qué medimos",
    paragraphs: [
      "Las respuestas de ChatGPT, Gemini y Claude. Son los tres motores que GenScore ejecuta hoy, los tres incluidos en todos los planes de pago; no medimos Perplexity, Copilot ni AI Overviews.",
      "De cada respuesta miramos si te mencionan, con qué protagonismo, cómo sales frente a tus competidores y si el modelo cita tu web como fuente. Y, aparte, si tu web está técnicamente preparada para que un motor la lea y la cite. Todo eso se resume en el GEO Score, de 0 a 100 por dominio."
    ]
  },
  {
    heading: "Cómo medimos",
    paragraphs: [
      "Con las preguntas que hace tu cliente, escritas como las escribe una persona, lanzadas de forma repetida y en distintos momentos: una sola respuesta de una IA no representa nada, porque la misma pregunta cambia de respuesta según el día.",
      "El criterio completo —qué cuenta, qué no y qué pasa cuando algo no se puede medir— está publicado en la metodología del GEO Score."
    ],
    link: { href: GEO_SCORE_CANONICAL_PATH, label: "Metodología del GEO Score" }
  },
  {
    heading: "Independencia y honestidad",
    paragraphs: [
      "Publicamos comparativas con otras herramientas GEO, y GenScore es nuestro producto: lo decimos. Por eso cada comparativa fecha los datos de terceros que usa, remite a la web de cada herramienta para confirmar precios y marca también las filas en las que gana el competidor.",
      "No publicamos cifras que el producto no mide ni motores que no ejecuta. Cuando un dato nuestro aparece en un estudio, va en porcentajes y con su fecha."
    ],
    link: { href: "/comparativas", label: "Comparativas" }
  },
  {
    heading: "El nombre",
    paragraphs: [
      "GenScore es la plataforma GEO de genscore.es. El nombre coincide con el de productos de otros sectores sin ninguna relación —bioinformática, salud mental, evaluación de riesgo entre empresas—: si has llegado buscando alguno de ésos, no es éste."
    ]
  }
];

export const ABOUT_CONTACT = {
  email: CONTACT_EMAIL,
  linkedin: ORGANIZATION_SAME_AS.linkedin,
  g2: ORGANIZATION_SAME_AS.g2
} as const;
