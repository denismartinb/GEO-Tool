/**
 * One line after a round trip (connect, property, disconnect). Read from the
 * query string the server itself wrote; anything unknown shows nothing.
 */
const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Search Console conectado. Ya ves tus datos reales de Google." },
  disconnected: { tone: "ok", text: "Search Console desconectado. Hemos borrado el acceso de GenScore." },
  denied: { tone: "warn", text: "No se conectó: en Google se canceló el permiso. Puedes intentarlo de nuevo cuando quieras." },
  scope: {
    tone: "warn",
    text: "No se conectó: hace falta marcar el permiso de ver los datos de Search Console en la pantalla de Google."
  },
  error: { tone: "warn", text: "No se pudo completar la conexión con Google. Inténtalo de nuevo en unos minutos." },
  disconnect_failed: { tone: "warn", text: "No se pudo desconectar. Inténtalo de nuevo." },
  property_domain_mismatch: { tone: "warn", text: "Esa propiedad no corresponde a este dominio." },
  property_not_listed: { tone: "warn", text: "Esa propiedad ya no aparece en tu cuenta de Search Console." },
  property_not_connected: { tone: "warn", text: "La conexión con Google ya no es válida. Vuelve a conectar." },
  property_google: { tone: "warn", text: "Google no respondió. Inténtalo de nuevo en unos minutos." },
  property_save_failed: { tone: "warn", text: "No se pudo guardar la propiedad. Inténtalo de nuevo." },
  property_invalid: { tone: "warn", text: "No se pudo guardar la propiedad. Inténtalo de nuevo." }
};

export function GscOutcome({ code }: { code: string | undefined }) {
  const message = code ? MESSAGES[code] : undefined;
  if (!message) return null;
  return (
    <p className={`gsc-outcome gsc-outcome-${message.tone}`} role="status">
      {message.text}
    </p>
  );
}
