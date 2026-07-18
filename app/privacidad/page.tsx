import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Política de Privacidad — GenScore"
};

export default function PrivacidadPage() {
  return (
    <LegalPageShell title="Política de Privacidad" updated="11 de julio de 2026" activeHref="/privacidad">
      <h2>Responsable del tratamiento</h2>
      <p>
        El responsable del tratamiento de los datos personales recogidos a través de GenScore es{" "}
        <strong>Denis Martín Barroso</strong>, contacto:{" "}
        <a href="mailto:soporte@genscore.es">soporte@genscore.es</a>. GenScore se encuentra
        actualmente en fase de beta privada.
      </p>

      <h2>Qué datos tratamos</h2>
      <p>Al usar GenScore tratamos los siguientes datos personales:</p>
      <ul>
        <li>Datos de la cuenta: email y contraseña (esta última gestionada de forma cifrada por nuestro proveedor de autenticación, nunca en texto plano).</li>
        <li>Datos del proyecto que configuras: dominio, marca, país, idioma y competidores.</li>
        <li>Prompts que seleccionas o generas para monitorizar tu visibilidad.</li>
        <li>Resultados de los escaneos: menciones, citas, puntuaciones y recomendaciones generadas a partir de tus prompts.</li>
      </ul>

      <h2>Con qué finalidad y legitimación</h2>
      <p>
        Tratamos estos datos para prestarte el servicio que has contratado (ejecución de un
        contrato o de las medidas precontractuales solicitadas por ti, art. 6.1.b RGPD): crear y
        gestionar tu cuenta, ejecutar los escaneos de visibilidad en motores de IA y mostrarte los
        resultados, puntuaciones y recomendaciones. Si nos escribes para soporte, tratamos tu
        consulta para poder responderte (interés legítimo en atenderte, art. 6.1.f RGPD).
      </p>

      <h2>A quién comunicamos tus datos (encargados del tratamiento)</h2>
      <p>Para prestar el servicio, algunos datos se comparten con los siguientes proveedores, que actúan como encargados del tratamiento:</p>
      <ul>
        <li><strong>Supabase</strong> (base de datos y autenticación de usuarios), infraestructura ubicada en la Unión Europea.</li>
        <li><strong>Vercel</strong> (alojamiento y ejecución de la aplicación).</li>
        <li><strong>Google (Gemini API)</strong> — procesa los prompts de tu proyecto para simular y analizar respuestas de IA. Este proveedor está ubicado fuera del Espacio Económico Europeo.</li>
        <li><strong>Anthropic (Claude API)</strong> — procesa los prompts de tu proyecto como motor adicional de escaneo. Este proveedor está ubicado fuera del Espacio Económico Europeo.</li>
        <li><strong>OpenAI (ChatGPT API)</strong> — procesa los prompts de tu proyecto como motor adicional de escaneo, con búsqueda web para obtener fuentes citadas. Este proveedor está ubicado fuera del Espacio Económico Europeo.</li>
        <li><strong>Resend</strong> — envía los correos transaccionales de tu cuenta (bienvenida, confirmación de plan contratado, avisos de facturación y de tu periodo de prueba).</li>
        <li><strong>Stripe</strong> — procesa los pagos de tu suscripción (datos de facturación y de tu tarjeta; nunca almacenamos ni vemos el número completo de tu tarjeta, lo gestiona Stripe directamente). Este proveedor está ubicado fuera del Espacio Económico Europeo.</li>
        <li><strong>PostHog</strong> (infraestructura en la Unión Europea) — analítica de producto para entender el uso de la aplicación. Funciona sin cookies (no te identifica entre sesiones ni dispositivos).</li>
        <li><strong>Sentry</strong> — monitorización de errores técnicos de la aplicación, para detectar y corregir fallos.</li>
      </ul>
      <p>
        Las transferencias de datos a proveedores fuera del Espacio Económico Europeo se realizan
        amparadas en las garantías adecuadas previstas por el RGPD (cláusulas contractuales tipo u
        otro mecanismo de transferencia válido del proveedor correspondiente). No vendemos ni
        cedemos tus datos a terceros con fines publicitarios.
      </p>
      <p>
        Esta política se actualizará si en el futuro se incorporan nuevos proveedores antes de que
        empiecen a tratar tus datos.
      </p>

      <h2>Cuánto tiempo conservamos tus datos</h2>
      <p>
        Conservamos tus datos mientras tu cuenta permanezca activa. Si eliminas un proyecto o tu
        cuenta, los datos asociados se eliminan de forma permanente, salvo la información que
        debamos conservar por obligación legal.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad escribiendo a{" "}
        <a href="mailto:soporte@genscore.es">soporte@genscore.es</a>. También puedes eliminar tu
        cuenta y tus proyectos directamente desde la aplicación. Si consideras que el tratamiento
        de tus datos no se ajusta a la normativa, tienes derecho a presentar una reclamación ante
        la Agencia Española de Protección de Datos (AEPD).
      </p>

      <h2>Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger tus datos, incluyendo
        el acceso restringido a la base de datos mediante políticas de seguridad a nivel de fila
        (Row Level Security) que garantizan que cada usuario solo accede a sus propios datos.
      </p>

      <h2>Menores de edad</h2>
      <p>GenScore no está dirigido a menores de edad. No recogemos conscientemente datos de menores.</p>

      <h2>Cambios en esta política</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios legales o en el servicio. Si el
        cambio es sustancial, te lo notificaremos por email o mediante un aviso en la aplicación.
      </p>
    </LegalPageShell>
  );
}
