import type { AnnouncementRead } from "@/lib/admin/announcement";
import { ANNOUNCEMENT_BATCH } from "@/lib/admin/announcement";
import { sendExtensionAnnouncementBatch, sendExtensionAnnouncementTest } from "./actions";

/**
 * EXT-REACH-1 (log §436): the Chrome extension announcement on /admin/crm.
 * Counts first, then a copy to yourself, then batches. Nothing goes out
 * without pressing, and a batch needs the confirmation box.
 */

const STATUS: Record<string, string> = {
  "prueba-ok": "Te hemos enviado una copia. Revísala antes de enviar el primer lote.",
  "prueba-error": "No se pudo enviar la copia. Revisa la clave de Resend y el secreto de baja.",
  "sin-confirmar": "Marca la casilla de confirmación para enviar un lote.",
  lunes: "Los lunes no salen correos de este tipo. Prueba mañana.",
  error: "No se pudieron leer las cuentas. No se ha enviado nada."
};

export function AnnouncementPanel({ read, status }: { read: AnnouncementRead; status: { kind?: string; sent?: string; failed?: string } }) {
  const message =
    status.kind === "lote"
      ? `Lote enviado: ${status.sent ?? "0"} correos${status.failed && status.failed !== "0" ? `, ${status.failed} fallidos` : ""}.`
      : status.kind
        ? STATUS[status.kind]
        : null;

  return (
    <section className="adm-pn-card adm-ann" id="anuncio" aria-labelledby="adm-ann-h">
      <div className="adm-pn-ch">
        <div>
          <h2 id="adm-ann-h">Anuncio: extensión de Chrome</h2>
          <p className="adm-pn-mut">
            Un correo a cada cuenta que se ha registrado alguna vez, con la baja de «consejos, novedades y ofertas». Una sola vez por cuenta.
          </p>
        </div>
      </div>

      {message ? <p className="adm-ann-msg" role="status">{message}</p> : null}

      {read.ok ? (
        <>
          <dl className="adm-ann-counts">
            <div><dt>Listas para recibirlo</dt><dd>{read.audience.counts.ready}</dd></div>
            <div><dt>Ya lo recibieron</dt><dd>{read.audience.counts.alreadySent}</dd></div>
            <div><dt>Esperan 48 h tras otro correo</dt><dd>{read.audience.counts.waiting}</dd></div>
            <div><dt>Se dieron de baja</dt><dd>{read.audience.counts.optedOut}</dd></div>
            <div><dt>Sin confirmar el email</dt><dd>{read.audience.counts.unconfirmed}</dd></div>
          </dl>
          {read.authTruncated ? (
            <p className="adm-pn-mut">Hay más cuentas de las que se leen de una vez: las que no se leen cuentan como sin confirmar.</p>
          ) : null}
          <div className="adm-ann-actions">
            <form action={sendExtensionAnnouncementTest}>
              <button type="submit" className="adm-pn-btn">Enviarme una copia</button>
            </form>
            {read.audience.counts.ready > 0 ? (
              <form action={sendExtensionAnnouncementBatch} className="adm-ann-send">
                <label>
                  <input type="checkbox" name="confirmo" value="si" required /> He revisado la copia y quiero enviarlo
                </label>
                <button type="submit" className="adm-pn-btn adm-ann-go">
                  Enviar a las siguientes {Math.min(ANNOUNCEMENT_BATCH, read.audience.counts.ready)}
                </button>
              </form>
            ) : (
              <p className="adm-pn-mut">No queda nadie a quien enviarlo ahora.</p>
            )}
          </div>
        </>
      ) : (
        <p className="adm-pn-mut">No se pudieron leer las cuentas esta vez.</p>
      )}
    </section>
  );
}
