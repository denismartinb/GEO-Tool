import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Política de Cookies — GenScore"
};

export default function CookiesPage() {
  return (
    <LegalPageShell title="Política de Cookies" updated="9 de julio de 2026" activeHref="/cookies">
      <h2>Qué cookies usamos</h2>
      <p>
        GenScore utiliza únicamente <strong>cookies técnicas, propias y esenciales</strong> para el
        funcionamiento del servicio. No utilizamos cookies de analítica ni de publicidad, por lo
        que no necesitamos pedirte consentimiento para las cookies que sí usamos: las cookies
        técnicas están exentas de esa obligación porque son estrictamente necesarias para
        prestarte el servicio que has solicitado.
      </p>

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
