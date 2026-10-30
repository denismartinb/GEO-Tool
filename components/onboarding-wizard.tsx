"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type {
  GenerateMorePromptsResult,
  ProjectSetupSuggestion,
} from "@/app/dashboard/projects/actions";
import { Ic } from "@/components/ins/ic";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { ProjectFav } from "@/components/ins/project-fav";
import type { PromptCategory } from "@/lib/projects/prompt-categories";
import {
  isWellFormedDomain,
  MAX_USER_COMPETITORS,
  RECOMMENDED_MIN_PROMPTS_COPY,
  sanitizePromptLineText,
} from "@/lib/projects/project-form";
import { takePendingDomain } from "@/lib/onboarding/pending-domain";
import type { LLMScanProvider } from "@/lib/scan/providers";

/**
 * Alta de dominio, pantalla «Nuevo dominio» de la consola «Instrumento»
 * (CONSOLE-INSTRUMENTO-1 F3c, log §356). Cuatro pasos: Dominio, Competidores,
 * Prompts y Lanzar. Sólo cambia el aspecto: las sugerencias, el tope de prompts,
 * los motores del plan y la acción de crear son los reales de siempre.
 */

const DEFAULT_PROMPT_CAP = 10;
const GENERATE_MORE_BATCH_SIZE = 5;

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "ES", name: "España" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "US", name: "Estados Unidos" },
  { code: "UK", name: "Reino Unido" },
  { code: "DE", name: "Alemania" },
  { code: "FR", name: "Francia" },
  { code: "IT", name: "Italia" },
  { code: "PT", name: "Portugal" },
  { code: "BR", name: "Brasil" },
];

// Sólo el respaldo: la página pasa los motores reales del plan
// (`resolveScanProvidersForPlan`), así que Pro y Agencia ven Perplexity y
// Starter no (log §285).
const DEFAULT_ENGINE_PROVIDERS: readonly LLMScanProvider[] = [
  "gemini",
  "claude",
  "openai",
];

// Nombres para lo que devuelve `languageForCountry` (lib/projects/project-form.ts).
// Cae al código crudo si algún día aparece uno nuevo.
const LANGUAGE_NAMES: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  de: "Alemán",
  fr: "Francés",
  it: "Italiano",
  pt: "Portugués",
};

const WIZARD_STEP_LABELS = ["Dominio", "Competidores", "Prompts", "Lanzar"];
const UNTOPICED = "Tuyos";

// Cada paso describe trabajo real de `suggestProjectSetup` (lee el dominio,
// busca competidores y genera prompts) y de `createProject` (guarda, crea
// prompts y competidores y lanza el primer escaneo).
const SUGGEST_STEPS = [
  "Leyendo el contenido de tu web",
  "Buscando competidores relevantes",
  "Proponiendo prompts de monitorización",
];
const CREATE_PROJECT_STEPS = [
  "Guardando tu dominio y configuración",
  "Creando tus prompts y competidores",
  "Lanzando tu primer escaneo",
];

// `source` distingue una fila que vino de la sugerencia de Gemini de una
// añadida a mano: «Sugerido» sólo se pinta en la primera, para no afirmar una
// sugerencia de IA que no existió. `id` es identidad de UI local, nunca viaja
// al servidor.
type Competitor = {
  id: number;
  name: string;
  domain: string;
  source: "suggested" | "manual";
};
type PromptRow = {
  id: number;
  text: string;
  category: PromptCategory | null;
  on: boolean;
};

function useStepCycle(stepCount: number, done: boolean, intervalMs = 1400) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (done) return;
    if (active >= stepCount - 1) return;
    const timer = setTimeout(
      () => setActive((value) => Math.min(value + 1, stepCount - 1)),
      intervalMs,
    );
    return () => clearTimeout(timer);
  }, [active, done, stepCount, intervalMs]);
  return active;
}

// Lista «esto es lo que estamos haciendo». Sin porcentaje ni «X de Y»: la
// llamada real es una única promesa opaca, y los pasos previos al activo se
// marcan hechos sólo como parte de la animación.
function LoadList({
  items,
  activeIndex,
}: {
  items: string[];
  activeIndex: number;
}) {
  return (
    <ol className="wz-load" aria-live="polite">
      {items.map((text, i) => {
        const done = i < activeIndex;
        const on = i === activeIndex;
        return (
          <li key={text} className={done ? "done" : on ? "on" : ""}>
            {done ? (
              <Ic n="checkc" />
            ) : on ? (
              <span className="wz-sp" aria-hidden="true" />
            ) : (
              <Ic n="c-dot" />
            )}
            <span className={on ? "shimmer" : ""}>{text}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SuggestLoading({ domain }: { domain: string }) {
  const activeIndex = useStepCycle(SUGGEST_STEPS.length, false);
  return (
    <>
      <div className="eyebrow bare">Paso 1 de 4</div>
      <h1>
        Leyendo <span className="mono wz-dm">{domain || "tu dominio"}</span>
      </h1>
      <p className="lead">
        Unos 15 segundos. No cierres ni recargues esta pestaña.
      </p>
      <LoadList items={SUGGEST_STEPS} activeIndex={activeIndex} />
    </>
  );
}

function EngineRow({ engines }: { engines: readonly LLMScanProvider[] }) {
  const hasPerplexity = engines.includes("perplexity");
  return (
    <div className="wz-engs">
      {engines.map((provider) => (
        <span className="wz-eng" key={provider}>
          <EngineLogo provider={provider} size={15} />
          {engineName(provider)}
          {provider === "perplexity" ? (
            <span className="new">Nuevo</span>
          ) : null}
        </span>
      ))}
      {!hasPerplexity ? (
        <span className="wz-lock">
          <Ic n="c-lock" sm />
          Perplexity, en Pro y Agencia
        </span>
      ) : null}
    </div>
  );
}

// Cuerpo del paso final. Vive dentro del <form> porque `useFormStatus()` sólo
// funciona en un descendiente suyo: mientras `createAction` está en vuelo la
// lista de carga sustituye al botón, en el mismo sitio y sin cortina.
function LaunchBody({
  promptCount,
  engines,
  competitorCount,
  countryName,
  goBack,
}: {
  promptCount: number;
  engines: readonly LLMScanProvider[];
  competitorCount: number;
  countryName: string;
  goBack: () => void;
}) {
  const { pending } = useFormStatus();
  const activeIndex = useStepCycle(CREATE_PROJECT_STEPS.length, !pending);
  return (
    <>
      <div className="eyebrow bare">Paso 4 de 4</div>
      <h1>Todo listo para tu primer escaneo</h1>
      <p className="lead">
        Preguntamos tus prompts a cada motor y leemos menciones, puestos y
        citas.
      </p>
      <div className="wz-sum4">
        <div>
          <span>Prompts</span>
          <b className="num">{promptCount}</b>
        </div>
        <div>
          <span>Motores</span>
          <b className="num">{engines.length}</b>
        </div>
        <div>
          <span>Competidores</span>
          <b className="num">{competitorCount}</b>
        </div>
        <div>
          <span>Mercado</span>
          <b className="wz-country">{countryName}</b>
        </div>
      </div>
      <div className="wz-sub">
        <div className="xo-lbl">Motores</div>
        <EngineRow engines={engines} />
      </div>
      <p className="wz-hint">
        El escaneo tarda unos minutos y sigue aunque cierres la pestaña una vez
        creado el dominio.
      </p>
      {pending ? (
        <LoadList items={CREATE_PROJECT_STEPS} activeIndex={activeIndex} />
      ) : null}
      <div className="wz-foot">
        <button
          type="button"
          className="btn ghost"
          onClick={goBack}
          disabled={pending}
        >
          <Ic n="chevl" sm />
          Atrás
        </button>
        <button
          type="submit"
          className="btn blue"
          disabled={pending || promptCount === 0}
        >
          {pending ? (
            "Creando…"
          ) : (
            <>
              <Ic n="c-rocket" sm />
              Crear dominio y escanear
            </>
          )}
        </button>
      </div>
    </>
  );
}

type OnboardingWizardProps = {
  errorMessage: string | null;
  atLimit?: boolean;
  /** Primer dominio de la cuenta: el asistente no se puede cerrar (no hay a dónde volver). */
  isFirst?: boolean;
  /** Owner's real plan cap on active prompts (app/pricing/plans-data.ts) —
   * bounds both the manual add and "Generar N más" here. */
  promptCap?: number;
  /** Engines the owner's plan scans with, in scan order. */
  engines?: readonly LLMScanProvider[];
  suggestAction: (input: {
    domain: string;
    country: string;
  }) => Promise<ProjectSetupSuggestion>;
  generateMorePromptsAction: (input: {
    domain: string;
    country: string;
    existingPromptTexts: string[];
    existingCategories: string[];
  }) => Promise<GenerateMorePromptsResult>;
  createAction: (formData: FormData) => void | Promise<void>;
};

export function OnboardingWizard({
  errorMessage,
  atLimit = false,
  isFirst = false,
  promptCap = DEFAULT_PROMPT_CAP,
  engines = DEFAULT_ENGINE_PROVIDERS,
  suggestAction,
  generateMorePromptsAction,
  createAction,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("ES");
  const [language, setLanguage] = useState("es");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // LLM-RESILIENCE-1: qué mitades de la sugerencia automática volvieron vacías,
  // para que el paso que de verdad está vacío lo diga.
  const [suggestFailed, setSuggestFailed] = useState<
    Array<"competitors" | "prompts">
  >([]);
  // Diagnóstico sólo de preview de una sugerencia de competidores vacía (log §240).
  const [competitorsReason, setCompetitorsReason] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [showDomainErr, setShowDomainErr] = useState(false);
  const [isGeneratingMore, startGenerateMoreTransition] = useTransition();
  const [generateMoreError, setGenerateMoreError] = useState<string | null>(
    null,
  );
  const [editingCompetitors, setEditingCompetitors] = useState<Set<number>>(
    new Set(),
  );
  const [editingPrompts, setEditingPrompts] = useState<Set<number>>(new Set());
  const [newCompetitor, setNewCompetitor] = useState({ name: "", domain: "" });
  const [newPrompt, setNewPrompt] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const nextId = useRef(0);
  const newId = () => {
    nextId.current += 1;
    return nextId.current;
  };
  function toggleId(
    setter: (updater: (prev: Set<number>) => Set<number>) => void,
    id: number,
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // El dominio que la persona escribió en el hero de la landing se lee una
  // sola vez y se consume (log §54). En un efecto porque `localStorage` no
  // existe en el servidor.
  useEffect(() => {
    const pending = takePendingDomain();
    if (pending) setDomain((current) => (current ? current : pending));
  }, []);

  // Cada paso empieza arriba del todo.
  useEffect(() => {
    rootRef.current?.closest(".scroller")?.scrollTo({ top: 0 });
  }, [step]);

  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isWellFormedDomain(domain);
  const selectedCountry = useMemo(
    () => COUNTRIES.find((option) => option.code === country) ?? COUNTRIES[0],
    [country],
  );

  const competitorsText = useMemo(
    () =>
      competitors
        .map((c) => `${c.name.trim()}|${c.domain.trim()}`)
        .filter(
          (line) =>
            line.length > 1 && !line.startsWith("|") && !line.endsWith("|"),
        )
        .join("\n"),
    [competitors],
  );
  const validCompetitorCount = competitorsText
    ? competitorsText.split("\n").length
    : 0;

  // Sólo cuentan los prompts marcados y con texto; las categorías viajan en el
  // mismo orden que el texto.
  const chosen = useMemo(
    () =>
      prompts
        .filter((p) => p.on)
        .map((p) => ({
          text: sanitizePromptLineText(p.text),
          category: p.category ?? "",
        }))
        .filter((p) => p.text),
    [prompts],
  );
  const promptsText = chosen.map((p) => p.text).join("\n");
  const categoriesText = chosen.map((p) => p.category).join("\n");
  const validPromptCount = chosen.length;
  const promptRoomLeft = Math.max(0, promptCap - validPromptCount);
  const generateMoreCount = Math.min(GENERATE_MORE_BATCH_SIZE, promptRoomLeft);

  // Reparto real por tema, en orden de aparición; lo escrito a mano va aparte.
  const topics = useMemo(() => {
    const groups = new Map<string, PromptRow[]>();
    for (const row of prompts) {
      const key = row.category ?? UNTOPICED;
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }
    const entries = Array.from(groups.entries());
    return [
      ...entries.filter(([k]) => k !== UNTOPICED),
      ...entries.filter(([k]) => k === UNTOPICED),
    ];
  }, [prompts]);

  function generateSuggestions() {
    if (atLimit || isPending) return;
    if (!domainIsValid) {
      setShowDomainErr(true);
      return;
    }
    setShowDomainErr(false);
    setSuggestError(null);
    setSuggestFailed([]);
    setCompetitorsReason(null);
    startTransition(async () => {
      const result = await suggestAction({ domain, country });
      setCompetitorsReason(result.competitorsReason ?? null);
      if (!result.ok) {
        setSuggestError(
          "No hemos podido sugerir competidores ni prompts para este dominio. Puedes añadirlos manualmente y continuar.",
        );
        setSuggestFailed(
          result.failed.length ? result.failed : ["competitors", "prompts"],
        );
        setCompetitors([]);
        setPrompts([]);
        setLanguage((current) => result.language || current);
        setStep(1);
        return;
      }
      setLanguage(result.language || language);
      setSuggestFailed(result.failed);
      setCompetitors(
        result.competitors.map((c) => ({
          id: newId(),
          ...c,
          source: "suggested" as const,
        })),
      );
      setPrompts(result.prompts.map((p) => ({ id: newId(), ...p, on: true })));
      setStep(1);
    });
  }

  function updateCompetitor(id: number, patch: Partial<Competitor>) {
    setCompetitors((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  function updatePrompt(id: number, patch: Partial<PromptRow>) {
    setPrompts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function addCompetitor() {
    const name = newCompetitor.name.trim();
    const dom = newCompetitor.domain.trim();
    if (!name || !dom || competitors.length >= MAX_USER_COMPETITORS) return;
    setCompetitors((rows) => [
      ...rows,
      { id: newId(), name, domain: dom, source: "manual" },
    ]);
    setNewCompetitor({ name: "", domain: "" });
  }

  function addPrompt() {
    const text = newPrompt.trim();
    if (!text || promptRoomLeft <= 0) return;
    setPrompts((rows) => [
      ...rows,
      { id: newId(), text, category: null, on: true },
    ]);
    setNewPrompt("");
  }

  // «Generar N más»: pide a Gemini prompts distintos de los listados
  // (generateMorePromptsAction -> generateAddedPrompts, la misma llamada del
  // «Añadir prompts» posterior a la creación) y añade sólo los que caben en el
  // tope del plan.
  function generateMorePromptsAutomatically() {
    if (promptRoomLeft <= 0 || isGeneratingMore) return;
    setGenerateMoreError(null);
    startGenerateMoreTransition(async () => {
      // Lo desmarcado también cuenta: no se vuelve a proponer lo que se quitó.
      const existingPromptTexts = prompts
        .map((p) => sanitizePromptLineText(p.text))
        .filter(Boolean);
      const existingCategories = prompts
        .map((p) => p.category ?? "")
        .filter(Boolean);
      const result = await generateMorePromptsAction({
        domain,
        country,
        existingPromptTexts,
        existingCategories,
      });
      if (!result.ok) {
        setGenerateMoreError(
          "No hemos podido generar más prompts ahora mismo. Puedes reintentarlo o añadir uno manualmente.",
        );
        return;
      }
      const room = Math.max(0, promptCap - validPromptCount);
      const toAdd = result.prompts.slice(0, room);
      setPrompts((rows) => [
        ...rows,
        ...toAdd.map((p) => ({
          id: newId(),
          text: p.text,
          category: p.category,
          on: true,
        })),
      ]);
    });
  }

  const s = step + 1;
  const languageName = LANGUAGE_NAMES[language] ?? language;
  const loadingFirst = step === 0 && isPending;

  const stepsBar = (
    <ol className="wz-steps" aria-label="Pasos">
      {WIZARD_STEP_LABELS.map((label, i) => (
        <li
          key={label}
          className={i + 1 < s ? "done" : i + 1 === s ? "cur" : ""}
          aria-current={i + 1 === s ? "step" : undefined}
        >
          <i />
          <span>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );

  const side = (
    <aside className="wz-side" aria-label="Resumen del lanzamiento">
      <div className="xo-lbl">Resumen</div>
      <dl>
        <div>
          <dt>Dominio</dt>
          <dd className="mono">
            {domainHasValue && (s > 1 || isPending)
              ? domain.trim()
              : "Pendiente"}
          </dd>
        </div>
        <div>
          <dt>País</dt>
          <dd>{s > 1 ? selectedCountry.name : "Pendiente"}</dd>
        </div>
        <div>
          <dt>Idioma</dt>
          <dd>{s > 1 ? languageName : "Pendiente"}</dd>
        </div>
        <div>
          <dt>Motores</dt>
          <dd>
            {engines.length} · {engines.map((p) => engineName(p)).join(", ")}
          </dd>
        </div>
        <div>
          <dt>Competidores</dt>
          <dd>{s > 2 ? validCompetitorCount : "Pendiente"}</dd>
        </div>
        <div>
          <dt>Prompts</dt>
          <dd>{s > 2 ? validPromptCount : "Pendiente"}</dd>
        </div>
      </dl>
      <div className="wz-est">
        <span>Cada prompt se pregunta a todos los motores de tu plan.</span>
      </div>
    </aside>
  );

  const failedNotice = (kind: "competitors" | "prompts") => (
    <div className="wz-gap" role="status">
      No hemos podido sugerir{" "}
      {kind === "competitors" ? "competidores" : "prompts"} automáticamente para
      este dominio. Añádelos a mano: el escaneo funciona igual y podrás
      cambiarlos cuando quieras.
      {kind === "competitors" && competitorsReason ? (
        <span style={{ opacity: 0.7 }}> (preview: {competitorsReason})</span>
      ) : null}
    </div>
  );

  let main;
  if (loadingFirst) {
    main = <SuggestLoading domain={domain.trim()} />;
  } else if (step === 0) {
    main = (
      <>
        <div className="eyebrow bare">Paso 1 de 4</div>
        <h1>{isFirst ? "Añade tu primer dominio" : "Añade un dominio"}</h1>
        <p className="lead">
          Te proponemos rivales y prompts, y lanzamos el primer escaneo.
        </p>
        {errorMessage ? (
          <p className="wz-err" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {suggestError ? (
          <p className="wz-err" role="alert">
            {suggestError}
          </p>
        ) : null}
        <div className="wz-f1">
          <label
            className={`wz-fld wz-grow${showDomainErr && !domainIsValid ? " bad" : ""}`}
          >
            <span>Dominio</span>
            <input
              id="wz-dom"
              name="domain"
              className="wz-in mono"
              value={domain}
              onChange={(event) => {
                setDomain(event.target.value);
                setShowDomainErr(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  generateSuggestions();
                }
              }}
              placeholder="miempresa.com"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <em>
              {showDomainErr && !domainIsValid
                ? domainHasValue
                  ? "Eso no parece un dominio. Ejemplo: miempresa.com"
                  : "Escribe tu dominio."
                : "Escribe solo el dominio, sin https:// ni rutas."}
            </em>
          </label>
          <label className="wz-fld">
            <span>País de análisis</span>
            <select
              id="wz-cty"
              className="wz-in"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              {COUNTRIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            <em>El mercado que quieres analizar.</em>
          </label>
        </div>
        <div className="wz-sub">
          <div className="xo-lbl">Motores de tu plan</div>
          <EngineRow engines={engines} />
        </div>
        <div className="wz-foot">
          <span />
          <button
            type="button"
            className="btn ink"
            onClick={generateSuggestions}
            disabled={atLimit}
          >
            Continuar
            <Ic n="arrowr" sm />
          </button>
        </div>
      </>
    );
  } else if (step === 1) {
    const atCap = competitors.length >= MAX_USER_COMPETITORS;
    main = (
      <>
        <div className="eyebrow bare">Paso 2 de 4</div>
        <h1>Tus competidores</h1>
        <p className="lead">
          Los hemos encontrado en tu web y en tu sector. Quita los que no
          encajen o añade los tuyos.
        </p>
        {errorMessage ? (
          <p className="wz-err" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {suggestFailed.includes("competitors")
          ? failedNotice("competitors")
          : null}
        <div className="wz-lh">
          <span>
            <b className="num">{validCompetitorCount}</b> de{" "}
            {MAX_USER_COMPETITORS} como máximo
          </span>
          <span>Podrás cambiarlos cuando quieras.</span>
        </div>
        {competitors.length > 0 ? (
          <ul className="wz-list">
            {competitors.map((row) => {
              const editing = editingCompetitors.has(row.id);
              return (
                <li key={row.id}>
                  <ProjectFav
                    domain={row.domain}
                    name={row.name || row.domain || "?"}
                    size={30}
                  />
                  {editing ? (
                    <div className="wz-edit">
                      <input
                        className="wz-in"
                        aria-label="Nombre del competidor"
                        placeholder="Nombre"
                        value={row.name}
                        onChange={(event) =>
                          updateCompetitor(row.id, { name: event.target.value })
                        }
                        autoFocus
                      />
                      <input
                        className="wz-in mono"
                        aria-label="Dominio del competidor"
                        placeholder="dominio.com"
                        value={row.domain}
                        onChange={(event) =>
                          updateCompetitor(row.id, {
                            domain: event.target.value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <span className="t">
                      <b>{row.name || "Sin nombre"}</b>
                      <span className="mono">
                        {row.domain || "sin dominio"}
                      </span>
                    </span>
                  )}
                  {row.source === "suggested" && !editing ? (
                    <span className="wz-sug">Sugerido</span>
                  ) : null}
                  <button
                    type="button"
                    className="wz-ib"
                    aria-label={
                      editing
                        ? `Listo, ${row.name || "competidor"}`
                        : `Editar ${row.name || "competidor"}`
                    }
                    onClick={() => toggleId(setEditingCompetitors, row.id)}
                  >
                    <Ic n={editing ? "check" : "c-pencil"} sm />
                  </button>
                  <button
                    type="button"
                    className="wz-ib"
                    aria-label={`Quitar ${row.name || "competidor"}`}
                    onClick={() =>
                      setCompetitors((rows) =>
                        rows.filter((r) => r.id !== row.id),
                      )
                    }
                  >
                    <Ic n="x" sm />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <form
          className="wz-addc"
          onSubmit={(event) => {
            event.preventDefault();
            addCompetitor();
          }}
        >
          <input
            className="wz-in"
            aria-label="Nombre del nuevo competidor"
            placeholder="Nombre"
            value={newCompetitor.name}
            onChange={(event) =>
              setNewCompetitor((c) => ({ ...c, name: event.target.value }))
            }
            disabled={atCap}
          />
          <input
            className="wz-in mono"
            aria-label="Dominio del nuevo competidor"
            placeholder="dominio.com"
            value={newCompetitor.domain}
            onChange={(event) =>
              setNewCompetitor((c) => ({ ...c, domain: event.target.value }))
            }
            disabled={atCap}
          />
          <button
            className="btn line sm"
            type="submit"
            disabled={
              atCap ||
              !newCompetitor.name.trim() ||
              !newCompetitor.domain.trim()
            }
          >
            <Ic n="plus" sm />
            Añadir competidor
          </button>
        </form>
        {atCap ? (
          <p className="wz-hint">
            Has llegado a {MAX_USER_COMPETITORS}. Quita uno para añadir otro.
          </p>
        ) : null}
        <div className="wz-foot">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setStep(0)}
          >
            <Ic n="chevl" sm />
            Atrás
          </button>
          <button type="button" className="btn ink" onClick={() => setStep(2)}>
            Continuar a prompts
            <Ic n="arrowr" sm />
          </button>
        </div>
      </>
    );
  } else if (step === 2) {
    main = (
      <>
        <div className="eyebrow bare">Paso 3 de 4</div>
        <h1>Tus prompts</h1>
        <p className="lead">
          Las preguntas que tus clientes hacen a la IA. Desmarca las que no te
          representen
          {promptCap >= RECOMMENDED_MIN_PROMPTS_COPY
            ? `; mejor ${RECOMMENDED_MIN_PROMPTS_COPY} o más.`
            : "."}
        </p>
        {errorMessage ? (
          <p className="wz-err" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {suggestFailed.includes("prompts") ? failedNotice("prompts") : null}
        <div className="wz-lh">
          <span>
            <b className="num">{validPromptCount}</b> elegidos
          </span>
          <span>Límite de tu plan: {promptCap}</span>
        </div>
        {topics.map(([topic, rows]) => (
          <div className="wz-topic" key={topic}>
            <div className="wz-th">
              {topic}
              <span className="num">
                {rows.filter((r) => r.on).length}/{rows.length}
              </span>
            </div>
            <ul className="wz-ps">
              {rows.map((row) => {
                const editing = editingPrompts.has(row.id);
                const blocked = !row.on && promptRoomLeft <= 0;
                return (
                  <li key={row.id}>
                    {editing ? (
                      <div className="wz-pedit">
                        <textarea
                          className="wz-in"
                          rows={3}
                          aria-label="Texto del prompt"
                          placeholder="Ej. ¿Cuáles son las mejores herramientas para…?"
                          value={row.text}
                          onChange={(event) =>
                            updatePrompt(row.id, { text: event.target.value })
                          }
                          autoFocus
                        />
                      </div>
                    ) : (
                      <label className={row.on ? "" : "off"}>
                        <input
                          type="checkbox"
                          checked={row.on}
                          disabled={blocked}
                          onChange={(event) =>
                            updatePrompt(row.id, { on: event.target.checked })
                          }
                        />
                        <span>{row.text || "Prompt vacío"}</span>
                      </label>
                    )}
                    <button
                      type="button"
                      className="wz-ib"
                      aria-label={editing ? "Listo" : "Editar prompt"}
                      onClick={() => toggleId(setEditingPrompts, row.id)}
                    >
                      <Ic n={editing ? "check" : "c-pencil"} sm />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <form
          className="wz-add"
          onSubmit={(event) => {
            event.preventDefault();
            addPrompt();
          }}
        >
          <input
            className="wz-in"
            aria-label="Nuevo prompt"
            placeholder="Escribe un prompt propio"
            value={newPrompt}
            onChange={(event) => setNewPrompt(event.target.value)}
            disabled={promptRoomLeft <= 0}
          />
          <button
            className="btn line sm"
            type="submit"
            disabled={promptRoomLeft <= 0 || !newPrompt.trim()}
          >
            <Ic n="plus" sm />
            Añadir
          </button>
        </form>
        {promptRoomLeft > 0 ? (
          <div className="wz-moreb">
            <button
              type="button"
              className="btn line sm"
              onClick={generateMorePromptsAutomatically}
              disabled={isGeneratingMore}
            >
              <Ic n="sparkles" sm />
              {isGeneratingMore
                ? "Generando…"
                : `Generar ${generateMoreCount} más`}
            </button>
          </div>
        ) : (
          <p className="wz-hint">
            Has llegado al límite de tu plan. Desmarca uno para añadir otro.
          </p>
        )}
        {generateMoreError ? (
          <p className="wz-err" role="alert">
            {generateMoreError}
          </p>
        ) : null}
        <div className="wz-foot">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setStep(1)}
          >
            <Ic n="chevl" sm />
            Atrás
          </button>
          <button
            type="button"
            className="btn ink"
            onClick={() => setStep(3)}
            disabled={validPromptCount === 0}
          >
            Revisar y lanzar
            <Ic n="arrowr" sm />
          </button>
        </div>
      </>
    );
  } else {
    main = (
      <form action={createAction}>
        <input type="hidden" name="domain" value={domain} />
        <input type="hidden" name="country" value={country} />
        <input type="hidden" name="language" value={language} />
        <input
          type="hidden"
          name="initial_competitors"
          value={competitorsText}
        />
        <input type="hidden" name="initial_prompts" value={promptsText} />
        <input
          type="hidden"
          name="initial_prompt_categories"
          value={categoriesText}
        />
        {errorMessage ? (
          <p className="wz-err" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <LaunchBody
          promptCount={validPromptCount}
          engines={engines}
          competitorCount={validCompetitorCount}
          countryName={selectedCountry.name}
          goBack={() => setStep(2)}
        />
      </form>
    );
  }

  return (
    <div className="ins">
      <div className="page">
        <div className="sc-full sc-newdomain" ref={rootRef}>
          <header className="wz-top">
            <span className="wz-brand">
              <svg aria-hidden="true">
                <use href="#e-gs" />
              </svg>
              GenScore
            </span>
            <span className="wz-k">Nuevo dominio</span>
            <span style={{ flex: 1 }} />
            {isFirst ? null : (
              <Link
                className="xo-x wz-x"
                href="/dashboard"
                aria-label="Salir del asistente"
              >
                <Ic n="x" />
              </Link>
            )}
          </header>
          <div className="wz-wrap">
            {stepsBar}
            <div className="wz-grid">
              <div className="wz-main">{main}</div>
              {side}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
