import { GoogleMark } from "@/components/search-console/google-mark";

/**
 * «Conecta tu Search Console» (log §284, design screen "connect"). The ghost
 * behind the box in the mockup was example data; here it is a plain panel,
 * because blurred fake numbers behind a real screen would still be fake
 * numbers.
 */
export const SEARCH_CONSOLE_HELP_URL = "https://support.google.com/webmasters/answer/34592?hl=es";

export function GscConnect({
  connectHref,
  title = "Conecta tu Search Console",
  lead = "Es la herramienta gratuita de Google para tu web. Con ella te enseñamos:"
}: {
  connectHref: string;
  title?: string;
  lead?: string;
}) {
  return (
    <div className="gsc-lock">
      <div className="gsc-cbox">
        <h3>{title}</h3>
        <p>{lead}</p>
        <ul>
          <li>En qué puesto sales para cada búsqueda y cómo evoluciona en el tiempo.</li>
          <li>
            Las búsquedas en las que sales en las primeras páginas con las keywords más relevantes. Oportunidad de
            posicionarlas mejor.
          </li>
          <li>
            Qué páginas tiene Google indexadas y cuáles no. Importante para complementar lo que los motores de IA ven de
            tu marca.
          </li>
        </ul>
        {/* A plain link, not next/link: it leaves the app for Google's consent screen. */}
        <a className="gsc-gbtn" href={connectHref} rel="nofollow">
          <GoogleMark />
          Conectar con Google
        </a>
        <span className="gsc-fine">
          Sólo lectura: no cambiamos nada de tu cuenta. Google te enseñará un aviso de app en revisión; es normal
          mientras verifica GenScore. ¿Tu web aún no está en Search Console?{" "}
          <a href={SEARCH_CONSOLE_HELP_URL} target="_blank" rel="noopener noreferrer">
            Cómo darla de alta
          </a>
          .
        </span>
      </div>
    </div>
  );
}
