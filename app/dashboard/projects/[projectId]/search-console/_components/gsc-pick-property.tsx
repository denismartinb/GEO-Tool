import { propertyLabel } from "@/lib/search-console/property";
import { selectPropertyAction } from "../actions";

/**
 * Shown when the connected Google account has several properties that cover
 * the domain, or none (log §283). Only matching properties are offered; the
 * action checks them again against the live list.
 */
export function GscPickProperty({
  projectId,
  domain,
  candidates,
  verifiedCount,
  connectHref
}: {
  projectId: string;
  domain: string;
  candidates: string[];
  verifiedCount: number;
  connectHref: string;
}) {
  if (candidates.length === 0) {
    return (
      <div className="card gsc-pick">
        <h3>Esta cuenta de Google no tiene {domain} en Search Console</h3>
        <p>
          {verifiedCount === 0
            ? "La cuenta que has conectado no tiene ninguna web verificada en Search Console."
            : "La cuenta que has conectado tiene otras webs verificadas, pero ninguna es este dominio."}{" "}
          Conecta la cuenta de Google con la que gestionas {domain}, o da de alta la web en Search Console.
        </p>
        <a className="btn btn-primary btn-sm" href={connectHref} rel="nofollow">
          Conectar otra cuenta
        </a>
      </div>
    );
  }
  return (
    <form className="card gsc-pick" action={selectPropertyAction}>
      <h3>¿Qué propiedad de Search Console usamos?</h3>
      <p>Tu cuenta tiene varias propiedades para {domain}. La de todo el dominio suele ser la más completa.</p>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="gsc-pick-list">
        {candidates.map((property, i) => (
          <label key={property} className="gsc-pick-opt">
            <input type="radio" name="property" value={property} defaultChecked={i === 0} />
            <span>{propertyLabel(property)}</span>
          </label>
        ))}
      </div>
      <button type="submit" className="btn btn-primary btn-sm">
        Usar esta propiedad
      </button>
    </form>
  );
}
