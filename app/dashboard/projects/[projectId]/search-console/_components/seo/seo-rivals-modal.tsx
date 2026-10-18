"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setSeoRivalsAction } from "../../seo-actions";

/** «Cambiar rivales» (log §342): up to the plan's cap, own domain refused by the core too. */
export function SeoRivalsModal(props: {
  projectId: string;
  ownDomain: string;
  cap: number;
  current: string[];
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length: props.cap }, (_, i) => props.current[i] ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const save = () => {
    const domains = values.map((v) => v.trim().toLowerCase()).filter(Boolean);
    const own = props.ownDomain.replace(/^www\./, "");
    if (domains.some((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] === own)) {
      setError("Tu propio dominio no puede ser un rival.");
      return;
    }
    start(async () => {
      const result = await setSeoRivalsAction({ projectId: props.projectId, domains });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onToast(result.message ?? "Rivales guardados.");
      props.onClose();
    });
  };

  return (
    <div className="skw-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="skw-modal" role="dialog" aria-modal="true" aria-labelledby="skw-rivals-t">
        <div className="skw-mh">
          <h2 id="skw-rivals-t">Tus rivales en Google</h2>
          <button type="button" className="skw-x" onClick={props.onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="skw-mb">
          <p className="skw-p">
            Hasta {props.cap === 1 ? "un dominio" : `${props.cap} dominios`}. Comparamos tus enlaces con los suyos y los marcamos en cada Top 10.
          </p>
          {values.map((v, i) => (
            <label key={i} className="skw-field">
              Rival {i + 1}
              <input
                ref={i === 0 ? first : undefined}
                className="skw-inp"
                value={v}
                placeholder="ejemplo.es"
                onChange={(e) => setValues((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
          {error && (
            <p className="skw-err" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="skw-mf">
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar rivales"}
          </button>
        </div>
      </div>
    </div>
  );
}
