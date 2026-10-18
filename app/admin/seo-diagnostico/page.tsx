import { requireOperator } from "@/lib/admin/operator";
import { dataForSeoConfigured } from "@/lib/seo-data/dataforseo";
import { SeoDiagRunner } from "./seo-diag-runner";

// Each diagnosis step is one DataForSEO call inside its own invocation.
export const maxDuration = 60;

export default async function AdminSeoDiagPage() {
  await requireOperator("/admin/seo-diagnostico");
  const configured = dataForSeoConfigured();

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Diagnóstico SEO</h1>
          <p className="adm-sub">
            Datos reales de DataForSEO para un dominio en Google España: palabras en las que ya sale, competidores orgánicos,
            palabras que ellos tienen y él no, ideas por tema, el Top 20 de cada búsqueda y enlaces. No escribe nada en la base de
            datos; cada paso enseña lo que ha costado.
          </p>
        </div>
      </div>
      {configured ? (
        <SeoDiagRunner />
      ) : (
        <p className="adm-note">Faltan DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD en este entorno de Vercel.</p>
      )}
    </main>
  );
}
