"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { ProjectFav } from "@/components/ins/project-fav";
import { Sheet, SheetHead } from "@/components/ins/kit/sheet";
import {
  addBrandAliasAction,
  createCompetitorAction,
  deactivateCompetitorAction,
  removeBrandAliasAction,
  updateCompetitorAction,
} from "@/app/dashboard/projects/[projectId]/actions";

type Competitor = { id: string; name: string; domain: string };

/**
 * «Gestionar competidores» and the brand aliases, in the shared side sheet
 * (CONSOLE-INSTRUMENTO-1 F5b, log §374). Same server actions as before; the
 * only addition to the prototype is «Editar», which the old panel had.
 */
export function ManageSheet({
  projectId,
  brand,
  active,
  inactive,
  aliases,
  onClose,
}: {
  projectId: string;
  brand: string;
  active: Competitor[];
  inactive: Competitor[];
  aliases: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [alias, setAlias] = useState("");
  const [askOff, setAskOff] = useState<string | null>(null);
  const [askAlias, setAskAlias] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", domain: "" });
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<{ success: boolean; error?: string } | void>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await job();
      if (r && r.success === false) {
        setError(r.error ?? "No se ha podido completar la acción.");
        return;
      }
      after?.();
      router.refresh();
    });
  };

  return (
    <Sheet label="Gestionar competidores" onClose={onClose}>
      <SheetHead title="Gestionar competidores" kicker={<span className="kicker">Competidores</span>} onClose={onClose} />
      <div className="psh-b">
        <p className="ap-sub">Añade, edita o deja de seguir competidores. Los cambios se miden en tu próximo escaneo.</p>

        <label className="ap-lbl" htmlFor="cp-nn">
          Añadir competidor
        </label>
        <div className="ap-in cp-add">
          <input id="cp-nn" className="ap-input" placeholder="Nombre (p. ej. Leroy Merlin)" value={name} disabled={pending} data-autofocus onChange={(e) => setName(e.target.value)} />
          <input className="ap-input" placeholder="Dominio (p. ej. leroymerlin.es)" value={domain} disabled={pending} onChange={(e) => setDomain(e.target.value)} />
          <button
            type="button"
            className="btn ink sm"
            disabled={pending || !name.trim() || !domain.trim()}
            onClick={() =>
              run(
                () => createCompetitorAction({ projectId, name, domain }),
                () => {
                  setName("");
                  setDomain("");
                },
              )
            }
          >
            {pending ? "Añadiendo…" : "Añadir"}
          </button>
        </div>

        <div className="ap-rev">
          {active.length === 0 ? <p className="ap-sub" style={{ padding: "12px 0" }}>Ningún competidor activo todavía.</p> : null}
          {active.map((c) =>
            editing === c.id ? (
              <div key={c.id} className="cp-mr">
                <div className="ap-in cp-add" style={{ flex: "1 1 100%" }}>
                  <input className="ap-input" value={draft.name} disabled={pending} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nombre" />
                  <input className="ap-input" value={draft.domain} disabled={pending} onChange={(e) => setDraft({ ...draft, domain: e.target.value })} aria-label="Dominio" />
                </div>
                <button
                  type="button"
                  className="btn ink sm"
                  disabled={pending}
                  onClick={() => run(() => updateCompetitorAction({ projectId, competitorId: c.id, name: draft.name, domain: draft.domain }), () => setEditing(null))}
                >
                  {pending ? "Guardando…" : "Guardar"}
                </button>
                <button type="button" className="btn ghost sm" disabled={pending} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div key={c.id} className="cp-mr">
                <ProjectFav domain={c.domain} name={c.name} />
                <span className="t">
                  <b>{c.name}</b>
                  <span className="mono">{c.domain}</span>
                </span>
                {askOff === c.id ? (
                  <span className="inl">
                    ¿Dejar de seguirla?
                    <button type="button" className="btn ink sm" disabled={pending} onClick={() => run(() => deactivateCompetitorAction({ projectId, competitorId: c.id }), () => setAskOff(null))}>
                      Sí
                    </button>
                    <button type="button" className="btn ghost sm" disabled={pending} onClick={() => setAskOff(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => {
                        setEditing(c.id);
                        setDraft({ name: c.name, domain: c.domain });
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className="btn sm ghost" onClick={() => setAskOff(c.id)}>
                      Dejar de seguir
                    </button>
                  </>
                )}
              </div>
            ),
          )}
          {inactive.map((c) => (
            <div key={c.id} className="cp-mr">
              <ProjectFav domain={c.domain} name={c.name} />
              <span className="t">
                <b style={{ color: "var(--ink-3)" }}>{c.name}</b>
                <span className="mono">{c.domain}</span>
              </span>
              <button type="button" className="btn sm line" disabled={pending} onClick={() => run(() => createCompetitorAction({ projectId, name: c.name, domain: c.domain }))}>
                Volver a seguir
              </button>
            </div>
          ))}
        </div>

        <div className="eyebrow" id="alias" style={{ marginTop: 30 }}>
          Alias de {brand}
        </div>
        <p className="ap-sub" style={{ marginTop: 8 }}>
          Si la IA nombra un producto tuyo sin nombrar a la empresa, esa respuesta sólo cuenta si añades ese nombre como alias.
        </p>
        <div className="ap-in" style={{ marginTop: 12 }}>
          <input className="ap-input" placeholder={`p. ej. el nombre de un producto de ${brand}`} value={alias} disabled={pending} onChange={(e) => setAlias(e.target.value)} aria-label="Nuevo alias" />
          <button type="button" className="btn line sm" disabled={pending || !alias.trim()} onClick={() => run(() => addBrandAliasAction({ projectId, alias }), () => setAlias(""))}>
            Añadir
          </button>
        </div>
        <div className="ap-rev">
          {aliases.length === 0 ? (
            <p className="ap-sub" style={{ padding: "12px 0" }}>
              Todavía no hay ningún alias. Sólo cuenta una respuesta que nombre literalmente {brand}.
            </p>
          ) : null}
          {aliases.map((a) => (
            <div key={a} className="cp-mr">
              <span className="t">
                <b>{a}</b>
              </span>
              {askAlias === a ? (
                <span className="inl">
                  ¿Quitarlo?
                  <button type="button" className="btn ink sm" disabled={pending} onClick={() => run(() => removeBrandAliasAction({ projectId, alias: a }), () => setAskAlias(null))}>
                    Sí
                  </button>
                  <button type="button" className="btn ghost sm" disabled={pending} onClick={() => setAskAlias(null)}>
                    No
                  </button>
                </span>
              ) : (
                <button type="button" className="navb sm" aria-label={`Quitar ${a}`} onClick={() => setAskAlias(a)}>
                  <Ic n="x" sm />
                </button>
              )}
            </div>
          ))}
        </div>

        {error ? (
          <p className="alert" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
