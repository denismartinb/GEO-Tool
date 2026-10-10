import { requireOperator } from "@/lib/admin/operator";
import { listCompareProjects } from "./actions";
import { CompareRunner } from "./compare-runner";

// The server actions rendered from this page inherit it: each step gets the
// same 60 s every scan invocation gets (docs/adr/0003).
export const maxDuration = 60;

export default async function AdminCompareModelsPage() {
  await requireOperator("/admin/comparar-modelos");
  const projects = await listCompareProjects();

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Comparar modelos</h1>
          <p className="adm-sub">
            Lanza las preguntas principales de búsqueda de un proyecto con los modelos de hoy y con modelos más baratos, y
            compara lo que cambia. No escribe nada en la base de datos ni toca los escaneos de los clientes; sólo gasta
            llamadas a los motores.
          </p>
        </div>
      </div>
      <CompareRunner projects={projects} />
    </main>
  );
}
