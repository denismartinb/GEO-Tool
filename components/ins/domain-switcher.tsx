"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { useLayer } from "@/components/ins/layer";
import { ProjectFav } from "@/components/ins/project-fav";
import { useShellData } from "@/components/ins/shell-context";
import { scoreBand } from "@/lib/ins/band";
import { domainScanLabel } from "@/lib/ins/scan-label";

/** Selector de dominios (`xoDomHtml`): popover en escritorio, hoja inferior en móvil. */
export function DomainSwitcherPanel() {
  const d = useShellData();
  const { close } = useLayer();
  const router = useRouter();
  const cap = d.planProjectCap;
  const full = d.projects.length >= cap;
  const left = Math.max(0, cap - d.projects.length);
  const now = Date.now();

  return (
    <>
      <div className="xo-h">
        <b>Tus dominios</b>
        <span className="num xo-cap">
          {d.projects.length} de {cap}
        </span>
      </div>
      <ul className="xo-doms">
        {d.projects.map((p) => {
          const st = domainScanLabel(d.latestScanStatusByProject[p.id], d.latestScanDateByProject[p.id], now);
          const score = d.latestScoreByProject[p.id];
          const cur = d.project?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`xo-dom${cur ? " cur" : ""}`}
                aria-current={cur ? "true" : undefined}
                onClick={() => {
                  close();
                  router.push(`/dashboard/projects/${p.id}`);
                }}
              >
                <ProjectFav domain={p.domain} name={p.name} size={30} />
                <span className="t">
                  <b>{p.name}</b>
                  <span className="mono">{p.domain}</span>
                  <span className={`xo-st ${st.tone}`}>
                    {st.tone === "run" ? <span className="pl" /> : <span className="dt" />}
                    {st.text}
                  </span>
                </span>
                <span className="sc">
                  {score == null ? (
                    <span className="na">Sin datos</span>
                  ) : (
                    <>
                      <b className="num">{Math.round(score)}</b>
                      <span>{scoreBand(score)}</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {full ? (
        <div className="xo-full">
          <Ic n="plus" sm />
          <span>
            <b>
              Has usado {cap === 1 ? "el dominio" : `los ${cap} dominios`} de tu plan.
            </b>{" "}
            {d.inApp ? null : "Para añadir otro, retira uno o cambia de plan."}
          </span>
          {d.inApp ? null : (
            <Link href="/dashboard/settings?openPlan=pro#plan" className="btn sm line" onClick={close}>
              Cambiar de plan
            </Link>
          )}
        </div>
      ) : (
        <div className="xo-full">
          <Ic n="plus" sm />
          <span>
            <b>Puedes añadir {left === 1 ? "un dominio más" : `${left} dominios más`}.</b>
          </span>
          <Link href="/dashboard/projects/new" className="btn sm line" onClick={close}>
            Añadir dominio
          </Link>
        </div>
      )}
      <div className="xo-f">
        <span>Retirar un dominio y ver todos.</span>
        <Link href="/dashboard/domains" className="xo-lk" onClick={close}>
          Gestionar
          <Ic n="chevr" sm />
        </Link>
      </div>
    </>
  );
}
