import { requireOperator } from "@/lib/admin/operator";
import { SECTORS } from "@/lib/studies/sector-study";
import { StudyRunner } from "./study-runner";

// The server action rendered from this page inherits it: each study step
// gets the same 60 s every scan invocation gets (docs/adr/0003).
export const maxDuration = 60;

export default async function AdminStudyPage() {
  await requireOperator("/admin/estudio");

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Estudio sectorial</h1>
          <p className="adm-sub">
            ¿Qué marcas recomienda la IA? Mismas instrucciones y misma verificación que un escaneo. No escribe nada en la base
            de datos; sólo gasta llamadas a los motores.
          </p>
        </div>
      </div>
      <StudyRunner sectors={SECTORS.map(({ id, label, prompts }) => ({ id, label, promptCount: prompts.length }))} />
    </main>
  );
}
