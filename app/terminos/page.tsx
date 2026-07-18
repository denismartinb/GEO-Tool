import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Términos del Servicio — GenScore"
};

export default function TerminosPage() {
  return (
    <LegalPageShell title="Términos del Servicio" updated="9 de julio de 2026" activeHref="/terminos">
      <h2>Quiénes somos</h2>
      <p>
        GenScore es un servicio operado por <strong>Denis Martín Barroso</strong> (contacto:{" "}
        <a href="mailto:soporte@genscore.es">soporte@genscore.es</a>). Estos términos regulan el
        acceso y uso de la plataforma GenScore por parte de cualquier usuario, tanto empresas y
        profesionales como particulares.
      </p>

      <h2>Qué es GenScore</h2>
      <p>
        GenScore es una plataforma de Generative Engine Optimization (GEO): mide y analiza cómo
        aparece tu marca en respuestas generadas por motores de inteligencia artificial, y
        convierte esos datos en recomendaciones priorizadas y accionables.
      </p>

      <h2>Estado del servicio: beta</h2>
      <p>
        GenScore se ofrece actualmente en fase de <strong>beta privada</strong>. Esto significa que
        el servicio puede sufrir cambios, interrupciones o ajustes sin previo aviso, y que no
        ofrecemos un nivel de disponibilidad garantizado (SLA) durante esta fase. Haremos
        esfuerzos razonables para mantener el servicio disponible y avisarte de cambios
        relevantes.
      </p>

      <h2>Naturaleza de los datos y resultados</h2>
      <p>
        Los escaneos, puntuaciones (como el GEO Score) y recomendaciones que genera GenScore se
        basan en respuestas obtenidas de modelos de lenguaje de terceros (como Gemini de Google,
        Claude de Anthropic y ChatGPT de OpenAI). Estas respuestas son simulaciones representativas del comportamiento
        de dichos modelos y pueden variar entre ejecuciones, no garantizan una réplica exacta de lo
        que un usuario final vería en producción, ni constituyen una garantía de resultados
        futuros en tu visibilidad real. GenScore no fabrica ni infla métricas: cuando la
        información disponible es insuficiente para una conclusión fiable, el servicio lo indica
        explícitamente en lugar de mostrar un dato inventado.
      </p>

      <h2>Tu cuenta</h2>
      <p>
        Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de la
        veracidad de los datos que proporcionas. Debes tener capacidad legal para contratar
        (mayoría de edad) para registrarte en GenScore.
      </p>

      <h2>Planes y precios</h2>
      <p>
        Los planes disponibles, sus características y precios se describen en nuestra{" "}
        <Link href="/pricing">página de precios</Link>. Podemos modificar los precios o las
        características de los planes; si el cambio te afecta de forma sustancial y ya eres
        cliente, te avisaremos con antelación razonable antes de que te sea aplicado.
      </p>

      <h2>Derecho de desistimiento (clientes particulares)</h2>
      <p>
        Si contratas GenScore como consumidor particular (no como empresa o profesional), tienes
        derecho a desistir del contrato en un plazo de 14 días naturales desde la contratación,
        sin necesidad de justificación, conforme a la normativa de consumidores. Si solicitas
        expresamente que el servicio comience a prestarse antes de que finalice ese plazo,
        reconoces que perderás tu derecho de desistimiento una vez el servicio se haya ejecutado
        completamente.
      </p>

      <h2>Uso aceptable</h2>
      <p>No puedes usar GenScore para:</p>
      <ul>
        <li>Fines ilícitos o que infrinjan derechos de terceros.</li>
        <li>Intentar acceder sin autorización a datos de otros usuarios o a la infraestructura del servicio.</li>
        <li>Realizar ingeniería inversa de la plataforma o extraer de forma masiva y no autorizada su funcionamiento.</li>
      </ul>

      <h2>Propiedad intelectual</h2>
      <p>
        GenScore y su tecnología son propiedad de su operador. El contenido que GenScore genera
        específicamente para tu proyecto (recomendaciones, briefs, bloques de contenido) puede ser
        usado libremente por ti en tu propio dominio o negocio.
      </p>

      <h2>Cancelación</h2>
      <p>
        Puedes eliminar tu cuenta y tus proyectos en cualquier momento desde la propia aplicación.
        La eliminación de un proyecto es permanente. En el plan gratuito no existe compromiso de
        permanencia.
      </p>

      <h2>Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, GenScore no será responsable de daños indirectos
        derivados del uso del servicio, de la indisponibilidad temporal de la plataforma, ni de
        decisiones tomadas exclusivamente en base a los datos generados por motores de IA de
        terceros que quedan fuera de nuestro control.
      </p>

      <h2>Modificación de estos términos</h2>
      <p>
        Podemos actualizar estos términos para reflejar cambios legales o en el servicio. Los
        cambios sustanciales te serán notificados por email o mediante un aviso en la aplicación.
      </p>

      <h2>Ley aplicable</h2>
      <p>
        Estos términos se rigen por la legislación española. Si eres consumidor, podrás ejercer
        las acciones legales que te correspondan ante los tribunales de tu domicilio, conforme a
        la normativa de protección de consumidores.
      </p>
    </LegalPageShell>
  );
}
