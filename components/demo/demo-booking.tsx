"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { requestDemoCall } from "@/app/demo/actions";
import { DEMO_FIELDS } from "@/lib/demo/request";
import { listDemoSlots, DEMO_TIME_ZONE, type DemoSlot } from "@/lib/demo/slots";
import type { DemoState } from "@/lib/demo/submit";

/**
 * DEMO-CALL-1 — the slot picker and the request form (`/demo`).
 *
 * Slots are computed after mount, in the browser: the page is static, and a
 * list baked into the HTML at build time would offer slots that are already
 * in the past. The action re-checks the submitted slot against the same
 * `listDemoSlots`, so this list is a convenience, not the gate.
 *
 * Design: `docs/design-reference/demo-affiliates-1/` (approved 2026-10-10).
 */

const INITIAL: DemoState = { status: "idle" };

const dayLabel = new Intl.DateTimeFormat("es-ES", { timeZone: DEMO_TIME_ZONE, weekday: "short", day: "numeric" });
const monthLabel = new Intl.DateTimeFormat("es-ES", { timeZone: DEMO_TIME_ZONE, month: "short" });

function groupByDay(slots: DemoSlot[]): Array<{ day: string; label: string; month: string; slots: DemoSlot[] }> {
  const groups = new Map<string, DemoSlot[]>();
  for (const slot of slots) groups.set(slot.day, [...(groups.get(slot.day) ?? []), slot]);
  return [...groups.entries()].map(([day, daySlots]) => {
    const at = new Date(daySlots[0].id);
    return { day, label: dayLabel.format(at).replace(".", ""), month: monthLabel.format(at).replace(".", ""), slots: daySlots };
  });
}

export function DemoBooking() {
  const [state, formAction, pending] = useActionState(requestDemoCall, INITIAL);
  const [slots, setSlots] = useState<DemoSlot[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string>("");
  const [renderedAt, setRenderedAt] = useState("0");
  const [source, setSource] = useState("");
  // Controlled: React resets an uncontrolled form after its action runs.
  const [values, setValues] = useState({ name: "", email: "", domain: "", topic: "" });
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listDemoSlots(new Date());
    setSlots(list);
    setDay(list[0]?.day ?? null);
    setRenderedAt(String(Date.now()));
    const params = new URLSearchParams(window.location.search);
    setSource([params.get("utm_source"), params.get("utm_campaign"), params.get("desde")].filter(Boolean).join(" / "));
  }, []);

  useEffect(() => {
    if (state.status === "ok") topRef.current?.scrollIntoView({ block: "nearest" });
    // A slot that stopped being offered: refresh the list so the visitor picks a live one.
    if (state.status === "error" && state.field === "slot") {
      const list = listDemoSlots(new Date());
      setSlots(list);
      setSlotId("");
      setDay((current) => (list.some((s) => s.day === current) ? current : (list[0]?.day ?? null)));
    }
  }, [state]);

  const days = useMemo(() => groupByDay(slots ?? []), [slots]);
  const daySlots = days.find((d) => d.day === day)?.slots ?? [];

  if (state.status === "ok") {
    return (
      <div className="dm-card dm-done" ref={topRef} role="status">
        <h2 className="dm-card-title">Solicitud recibida</h2>
        <p>
          {state.when ? (
            <>
              Has pedido la videollamada el <strong>{state.when}</strong> (hora de Madrid).
            </>
          ) : (
            <>Hemos recibido tu solicitud.</>
          )}{" "}
          Te enviaremos la invitación con el enlace{state.email ? <> a <strong>{state.email}</strong></> : null}.
        </p>
        <p className="dm-fine">Si no ves nuestro correo de confirmación, mira en promociones o spam.</p>
        <Link href="/gratis/informe-geo?desde=demo" className="dm-btn dm-btn--light">
          Mientras, pide tu informe gratis
        </Link>
      </div>
    );
  }

  const errorFor = (field: string) =>
    state.status === "error" && (state.field === field || (field === "email" && state.field === "email_disposable"))
      ? state.message
      : null;
  const generalError = state.status === "error" && !state.field ? state.message : null;
  const slotError = errorFor("slot") ?? errorFor("slot_missing");

  return (
    <div ref={topRef}>
    <form className="dm-card" action={formAction} noValidate>
      <h2 className="dm-card-title">Elige un hueco</h2>
      <div className="dm-meta">
        <span>20 min</span>
        <span>Videollamada</span>
        <span>Hora de Madrid</span>
      </div>

      {slots === null ? (
        <p className="dm-fine">Cargando huecos…</p>
      ) : slots.length === 0 ? (
        <p className="dm-fine">
          No quedan huecos en los próximos días. Escríbenos a soporte@genscore.es y buscamos uno.
        </p>
      ) : (
        <>
          <div className="dm-days" role="radiogroup" aria-label="Día">
            {days.map((d) => (
              <button
                type="button"
                key={d.day}
                role="radio"
                aria-checked={d.day === day}
                className={"dm-day" + (d.day === day ? " is-on" : "")}
                onClick={() => {
                  setDay(d.day);
                  setSlotId("");
                }}
              >
                <span>{d.label}</span>
                <small>{d.month}</small>
              </button>
            ))}
          </div>
          <div className="dm-times" role="radiogroup" aria-label="Hora">
            {daySlots.map((s) => (
              <button
                type="button"
                key={s.id}
                role="radio"
                aria-checked={s.id === slotId}
                className={"dm-time" + (s.id === slotId ? " is-on" : "")}
                onClick={() => setSlotId(s.id)}
              >
                {s.time}
              </button>
            ))}
          </div>
          <p className="dm-fine">De lunes a viernes, de 18:00 a 21:00.</p>
        </>
      )}
      {slotError && (
        <p className="dm-err" role="alert">
          {slotError}
        </p>
      )}

      <div className="dm-fields">
        <label className="dm-field">
          Nombre
          <input
            type="text"
            name={DEMO_FIELDS.name}
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            autoComplete="name"
            required
            aria-invalid={errorFor("name") ? true : undefined}
          />
          {errorFor("name") && <span className="dm-err">{errorFor("name")}</span>}
        </label>
        <label className="dm-field">
          Email de trabajo
          <input
            type="email"
            name={DEMO_FIELDS.email}
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            placeholder="nombre@tuempresa.es"
            autoComplete="email"
            required
            aria-invalid={errorFor("email") ? true : undefined}
          />
          {errorFor("email") && <span className="dm-err">{errorFor("email")}</span>}
        </label>
        <label className="dm-field">
          Tu web
          <input
            type="text"
            name={DEMO_FIELDS.domain}
            value={values.domain}
            onChange={(e) => setValues((v) => ({ ...v, domain: e.target.value }))}
            placeholder="tuempresa.es"
            autoComplete="url"
            inputMode="url"
            required
            aria-invalid={errorFor("domain") ? true : undefined}
          />
          {errorFor("domain") && <span className="dm-err">{errorFor("domain")}</span>}
        </label>
        <label className="dm-field">
          <span>
            ¿Algo que quieras ver? <span className="dm-opt">(opcional)</span>
          </span>
          <input
            type="text"
            name={DEMO_FIELDS.topic}
            value={values.topic}
            onChange={(e) => setValues((v) => ({ ...v, topic: e.target.value }))}
            maxLength={300}
            placeholder="Un competidor, una pregunta de tus clientes…"
          />
        </label>
      </div>

      <div className="dm-hp" aria-hidden="true">
        <label>
          Web de tu empresa
          <input type="text" name={DEMO_FIELDS.website} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name={DEMO_FIELDS.slot} value={slotId} />
      <input type="hidden" name={DEMO_FIELDS.renderedAt} value={renderedAt} />
      <input type="hidden" name={DEMO_FIELDS.source} value={source} />

      {generalError && (
        <p className="dm-err" role="alert">
          {generalError}
        </p>
      )}

      <button type="submit" className="dm-btn" aria-busy={pending || undefined}>
        {pending ? "Enviando…" : "Pedir videollamada"}
      </button>
      <p className="dm-fine">
        Te enviamos la invitación con el enlace por correo. Al enviar aceptas la{" "}
        <Link href="/privacidad">Política de privacidad</Link>.
      </p>
    </form>
    </div>
  );
}
