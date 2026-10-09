import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";
import { contentMetadata } from "@/lib/seo/metadata";
import { adsEnabled, readAdsConfig } from "@/lib/ads/config";
import { ConsentPreferencesButton } from "@/components/ads/consent-preferences-button";

/**
 * PAID-ADS-1: the advertising section appears in the SAME deploy that turns
 * the ad tags on (an ad-platform id set in Vercel) and never before — this
 * page must describe what the site does today, not what it might do.
 */
const ADS_CONFIG = readAdsConfig();
const ADS_ON = adsEnabled(ADS_CONFIG);

export const metadata: Metadata = contentMetadata({
  title: "Política de Cookies — GenScore",
  description: ADS_ON
    ? "Qué cookies usa GenScore: la cookie técnica de sesión y, solo si las aceptas, cookies publicitarias de Google y LinkedIn para medir anuncios."
    : "Qué cookies usa GenScore: solo la cookie técnica de sesión, sin cookies de analítica ni publicitarias, y por eso sin banner de consentimiento.",
  path: "/cookies"
});

export default function CookiesPage() {
  return (
    <LegalPageShell title="Política de Cookies" updated={ADS_ON ? "9 de octubre de 2026" : "9 de julio de 2026"} activeHref="/cookies">
      <h2>Qué cookies usamos</h2>
      {ADS_ON ? (
        <p>
          GenScore utiliza <strong>cookies técnicas, propias y esenciales</strong> para el
          funcionamiento del servicio, que no requieren tu consentimiento, y{" "}
          <strong>cookies publicitarias de terceros</strong> (Google y LinkedIn) que{" "}
          <strong>solo se activan si las aceptas</strong> en el aviso que te mostramos al entrar.
          No utilizamos cookies de analítica: nuestra analítica de producto funciona sin cookies.
        </p>
      ) : (
        <p>
          GenScore utiliza únicamente <strong>cookies técnicas, propias y esenciales</strong> para el
          funcionamiento del servicio. No utilizamos cookies de analítica ni de publicidad, por lo
          que no necesitamos pedirte consentimiento para las cookies que sí usamos: las cookies
          técnicas están exentas de esa obligación porque son estrictamente necesarias para
          prestarte el servicio que has solicitado.
        </p>
      )}

      <h2>Cookie de sesión (autenticación)</h2>
      <p>
        Nuestro proveedor de autenticación (Supabase) establece una cookie que identifica tu
        sesión iniciada. Sin ella no podríamos mantenerte identificado entre una página y otra del
        panel de control, ni proteger el acceso a tus proyectos.
      </p>
      <ul>
        <li><strong>Finalidad:</strong> mantener tu sesión iniciada de forma segura.</li>
        <li><strong>Titularidad:</strong> propia (primera parte).</li>
        <li><strong>Duración:</strong> mientras dure tu sesión o hasta que cierres sesión manualmente.</li>
      </ul>

      {ADS_ON && (
        <>
          <h2>Cookie de preferencia de cookies</h2>
          <ul>
            <li><strong>Nombre:</strong> gs_ads_consent.</li>
            <li><strong>Finalidad:</strong> recordar qué usos publicitarios aceptaste o rechazaste, para no volver a preguntarte en cada página.</li>
            <li><strong>Titularidad:</strong> propia (primera parte). Es técnica y no requiere consentimiento.</li>
            <li><strong>Duración:</strong> 6 meses; después te lo volvemos a preguntar.</li>
          </ul>
          <p>
            Si aceptaste la medición de anuncios y te registras con Google, guardamos además
            durante 10 minutos la cookie propia <code>gs_pending_conversion</code>, que solo dice
            «registro» para poder contarlo en la siguiente página y se borra al leerla.
          </p>

          <h2>Cookies publicitarias (solo con tu consentimiento)</h2>
          <p>
            Te pedimos permiso por separado para dos usos, y puedes aceptar uno sin el otro:
          </p>
          <ul>
            <li>
              <strong>Medir de qué anuncio vienes:</strong> saber qué anuncios de Google nos traen
              comprobaciones gratuitas, registros y contrataciones.
            </li>
            <li>
              <strong>Mostrarte anuncios de GenScore después:</strong> que Google y LinkedIn
              recuerden tu visita para enseñarte anuncios nuestros más adelante. La etiqueta de
              LinkedIn usa la misma cookie para medir y para volver a mostrarte anuncios, así que
              solo se carga si aceptas este uso.
            </li>
          </ul>
          <p>
            Si rechazas los dos, no se carga ninguna etiqueta publicitaria y la web funciona
            exactamente igual.
          </p>
          <ul>
            {ADS_CONFIG.googleAdsId && (
              <li>
                <strong>Google Ads</strong> (Google Ireland Ltd.) — cookies como <code>_gcl_au</code> y{" "}
                <code>_gcl_aw</code> en nuestro dominio, y otras en dominios de Google. Duración
                habitual: hasta 90 días. Más información en la{" "}
                <a href="https://policies.google.com/technologies/ads?hl=es" rel="noopener noreferrer" target="_blank">
                  política de publicidad de Google
                </a>.
              </li>
            )}
            {ADS_CONFIG.linkedinPartnerId && (
              <li>
                <strong>LinkedIn Insight Tag</strong> (LinkedIn Ireland Unlimited Company) — cookies
                como <code>li_fat_id</code> en nuestro dominio y otras en dominios de LinkedIn.
                Duración habitual: hasta 6 meses. Más información en la{" "}
                <a href="https://es.linkedin.com/legal/cookie-policy" rel="noopener noreferrer" target="_blank">
                  política de cookies de LinkedIn
                </a>.
              </li>
            )}
          </ul>
          <p>
            Puedes cambiar tu decisión cuando quieras. Al retirar el consentimiento borramos las
            cookies publicitarias de nuestro dominio; las que estos proveedores guardan en sus
            propios dominios se gestionan desde la configuración de tu navegador o de tu cuenta
            en Google o LinkedIn.
          </p>
          <p>
            <ConsentPreferencesButton />
          </p>
        </>
      )}

      <h2>Si desactivas esta cookie</h2>
      <p>
        Puedes bloquear o eliminar cookies desde la configuración de tu navegador. Si lo haces, no
        podrás iniciar sesión ni usar GenScore, porque esta cookie es indispensable para el
        funcionamiento del servicio.
      </p>

      <h2>Cambios futuros</h2>
      <p>
        Si en el futuro incorporamos cookies de analítica o de terceros, actualizaremos esta
        política y te mostraremos un aviso para solicitar tu consentimiento antes de activarlas,
        tal y como exige la normativa.
      </p>
    </LegalPageShell>
  );
}
