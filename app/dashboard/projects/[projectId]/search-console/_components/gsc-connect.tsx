/**
 * «Conecta tu Search Console» (log §284, design screen "connect"). The ghost
 * behind the box in the mockup was example data; here it is a plain panel,
 * because blurred fake numbers behind a real screen would still be fake
 * numbers.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1C42.6 36.8 45 31.2 45 24.5z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3V14H4.5C3 17 2 20.4 2 24s1 7 2.5 10l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  );
}

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
          <li>En qué puesto sales para cada búsqueda y cómo cambia</li>
          <li>Las búsquedas en las que sales en la página 2, las más fáciles de subir a la primera</li>
          <li>Qué páginas tiene Google indexadas y cuáles no</li>
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
