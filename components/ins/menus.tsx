"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { requestDemoCall } from "@/app/demo/actions";
import { Ic } from "@/components/ins/ic";
import { useLayer, XoClose } from "@/components/ins/layer";
import { avatarStyle, initialsOf, planLabel, useShellData } from "@/components/ins/shell-context";
import { useToast } from "@/components/ins/toasts";
import { SignOutForm } from "@/components/session-cache-sync";
import { useTour } from "@/components/tour-provider";
import { DEMO_FIELDS } from "@/lib/demo/request";
import { applyTheme, currentTheme, type InsTheme } from "@/lib/ins/theme";
import { DEMO_TIME_ZONE, listDemoSlots, type DemoSlot } from "@/lib/demo/slots";
import type { DemoState } from "@/lib/demo/submit";

/* Menús de cuenta y de ayuda y sus diálogos (`overlays.js` del prototipo v51). */

export function HelpPanel() {
  const { close, dlg } = useLayer();
  const { open: openTour } = useTour();
  return (
    <>
      <div className="xo-h">
        <b>¿Cómo funciona?</b>
      </div>
      <div className="xo-menu">
        <button
          type="button"
          className="xo-mi"
          onClick={() => {
            close();
            openTour();
          }}
        >
          <Ic n="c-rocket" />
          <span>
            Ver el tour<small>Ocho pasos por la consola</small>
          </span>
          <span className="k">2 min</span>
        </button>
        <button
          type="button"
          className="xo-mi"
          onClick={() => {
            close();
            setTimeout(() => dlg(<DemoDialog />, { label: "Hablar con nosotros", narrow: true }), 220);
          }}
        >
          <Ic n="c-video" />
          <span>
            Hablar con nosotros<small>Videollamada con el equipo</small>
          </span>
          <span className="k">20 min</span>
        </button>
        <Link href="/blog" target="_blank" rel="noopener" className="xo-mi" onClick={close}>
          <Ic n="c-book" />
          <span>
            Manuales y estudios<small>Guías y estudios de GenScore</small>
          </span>
          <Ic n="c-ext" sm />
        </Link>
      </div>
    </>
  );
}

export function AccountPanel({ helpAnchor }: { helpAnchor: () => HTMLElement | null }) {
  const d = useShellData();
  const { close, pop, dlg } = useLayer();
  return (
    <>
      <div className="xo-who">
        <span className={`av${d.avatarUrl ? " xo-avimg" : ""}`} style={{ width: 40, height: 40, fontSize: 14, ...avatarStyle(d.avatarUrl) }} aria-hidden="true">
          {d.avatarUrl ? null : initialsOf(d.userEmail)}
        </span>
        <span>
          <b>{d.userEmail}</b>
          <span className="xo-pl">{planLabel(d)}</span>
        </span>
      </div>
      <div className="xo-menu">
        <Link href="/dashboard/settings" className="xo-mi" onClick={close}>
          <Ic n="c-user" />
          <span>Tu perfil</span>
        </Link>
        <Link href="/dashboard/settings/notifications" className="xo-mi" onClick={close}>
          <Ic n="bell" />
          <span>Notificaciones</span>
        </Link>
        <ThemeSwitchItem />
        <button
          type="button"
          className="xo-mi"
          onClick={() => {
            close();
            const a = helpAnchor();
            if (a) setTimeout(() => pop(a, <HelpPanel />, { w: 320, label: "¿Cómo funciona?" }), 220);
          }}
        >
          <Ic n="c-help" />
          <span>¿Cómo funciona?</span>
        </button>
        {d.inApp ? null : (
          <>
            <div className="xo-sep" />
            <button
              type="button"
              className="xo-mi"
              onClick={() => {
                close();
                setTimeout(() => dlg(<AffiliateDialog />, { label: "Programa de afiliados", narrow: true }), 220);
              }}
            >
              <Ic n="c-hand" />
              <span>Programa de afiliados</span>
              <span className="k">30 %</span>
            </button>
          </>
        )}
        <div className="xo-sep" />
        <SignOutForm action={d.signOutAction}>
          <button type="submit" className="xo-mi">
            <Ic n="c-logout" />
            <span>Cerrar sesión</span>
          </button>
        </SignOutForm>
      </div>
    </>
  );
}

/**
 * DARK-MODE-MENU-1 (log §397): el único interruptor del tema. No cierra el
 * menú, así se ve el cambio en el sitio. Lee el tema de `<html>` al montar
 * porque lo puso el script inicial antes de hidratar.
 */
export function ThemeSwitchItem() {
  const [theme, setTheme] = useState<InsTheme>("light");
  useEffect(() => setTheme(currentTheme()), []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="xo-mi xo-theme"
      onClick={() => {
        const next: InsTheme = dark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
    >
      <Ic n="moon" />
      <span>Modo oscuro</span>
      <i className="xo-sw" aria-hidden="true" />
    </button>
  );
}

export function AffiliateDialog() {
  const { close } = useLayer();
  return (
    <>
      <div className="xo-dh">
        <XoClose />
        <div className="eyebrow bare">Programa de afiliados</div>
        <h2>
          Gana el <span className="xo-big num">30 %</span> de cada Pro que traigas.
        </h2>
        <p>Durante 12 meses, sobre lo que pague en Pro.</p>
      </div>
      <ol className="steps xo-steps">
        {[
          "Te damos un enlace propio.",
          "Quien se registra con él queda ligado a ti.",
          "Cobras el 30 % de lo que pague en Pro, cada mes, durante un año."
        ].map((t, i) => (
          <li key={t}>
            <a>
              <span className="n num">{String(i + 1).padStart(2, "0")}</span>
              <span className="t">{t}</span>
            </a>
          </li>
        ))}
      </ol>
      <div className="xo-df">
        <button type="button" className="btn ghost" onClick={close}>
          Ahora no
        </button>
        <Link href="/afiliados" target="_blank" rel="noopener" className="btn ink" onClick={close}>
          Ver el programa
          <Ic n="c-ext" sm />
        </Link>
      </div>
    </>
  );
}

const INITIAL: DemoState = { status: "idle" };
const WEEKDAY = new Intl.DateTimeFormat("es-ES", { timeZone: DEMO_TIME_ZONE, weekday: "short" });
const DAYNUM = new Intl.DateTimeFormat("es-ES", { timeZone: DEMO_TIME_ZONE, day: "numeric" });
const MONTH = new Intl.DateTimeFormat("es-ES", { timeZone: DEMO_TIME_ZONE, month: "long" });

/** «Hablar con nosotros»: la misma solicitud que `/demo` (`requestDemoCall`), con los datos de la cuenta. */
export function DemoDialog() {
  const d = useShellData();
  const { close } = useLayer();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(requestDemoCall, INITIAL);
  const [slots, setSlots] = useState<DemoSlot[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState("");
  const [renderedAt, setRenderedAt] = useState("0");

  useEffect(() => {
    const list = listDemoSlots(new Date());
    setSlots(list);
    setDay(list[0]?.day ?? null);
    setRenderedAt(String(Date.now()));
  }, []);

  useEffect(() => {
    if (state.status === "ok") {
      toast("Solicitud enviada.", state.when ? `${state.when}. Te la confirmamos por correo.` : "Te la confirmamos por correo.", "c-cal");
      close();
    }
  }, [state, toast, close]);

  const days = useMemo(() => {
    const seen = new Map<string, DemoSlot[]>();
    for (const s of slots) seen.set(s.day, [...(seen.get(s.day) ?? []), s]);
    return [...seen.entries()].slice(0, 5).map(([key, list]) => {
      const at = new Date(list[0].id);
      return { key, week: WEEKDAY.format(at).replace(".", ""), num: DAYNUM.format(at), month: MONTH.format(at), list };
    });
  }, [slots]);
  const daySlots = days.find((x) => x.key === day)?.list ?? [];
  const name = (d.userEmail.split("@")[0] || "Cliente").slice(0, 60);
  const error = state.status === "error" ? state.message : null;

  return (
    <form action={formAction} noValidate>
      <div className="xo-dh">
        <XoClose />
        <div className="eyebrow bare">Hablar con nosotros</div>
        <h2>Una videollamada de 20 minutos</h2>
        <p>Revisamos tus datos contigo. De lunes a viernes, de 18:00 a 21:00.</p>
      </div>
      <div className="xo-db">
        <div className="xo-lbl">{days[0]?.month ? days[0].month.charAt(0).toUpperCase() + days[0].month.slice(1) : "Huecos"}</div>
        <div className="xo-days" role="radiogroup" aria-label="Día">
          {days.map((x) => (
            <button
              type="button"
              key={x.key}
              role="radio"
              aria-checked={x.key === day}
              className={x.key === day ? "on" : ""}
              onClick={() => {
                setDay(x.key);
                setSlotId("");
              }}
            >
              <span>{x.week}</span>
              <b className="num">{x.num}</b>
            </button>
          ))}
        </div>
        <div className="xo-lbl" style={{ marginTop: 18 }}>
          Hora (Madrid)
        </div>
        <div className="xo-slots" role="radiogroup" aria-label="Hora">
          {daySlots.map((s) => (
            <button
              type="button"
              key={s.id}
              role="radio"
              aria-checked={s.id === slotId}
              className={`num${s.id === slotId ? " on" : ""}`}
              onClick={() => setSlotId(s.id)}
            >
              {s.time}
            </button>
          ))}
        </div>
        <p className="xo-note">Es una solicitud: te confirmamos el hueco por correo en {d.userEmail}.</p>
        {error ? (
          <p className="xo-note" role="alert" style={{ color: "var(--warm)" }}>
            {error}
          </p>
        ) : null}
        <input type="hidden" name={DEMO_FIELDS.name} value={name} />
        <input type="hidden" name={DEMO_FIELDS.email} value={d.userEmail} />
        <input type="hidden" name={DEMO_FIELDS.domain} value={d.project?.domain ?? ""} />
        <input type="hidden" name={DEMO_FIELDS.topic} value="" />
        <input type="hidden" name={DEMO_FIELDS.website} value="" />
        <input type="hidden" name={DEMO_FIELDS.slot} value={slotId} />
        <input type="hidden" name={DEMO_FIELDS.renderedAt} value={renderedAt} />
        <input type="hidden" name={DEMO_FIELDS.source} value="consola" />
      </div>
      <div className="xo-df">
        <button type="button" className="btn ghost" onClick={close}>
          Cancelar
        </button>
        <button type="submit" className="btn ink" disabled={pending || !slotId}>
          {pending ? "Enviando…" : "Pedir videollamada"}
        </button>
      </div>
    </form>
  );
}
