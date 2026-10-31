import { Sk, SkCard, SkPage, SkTabs } from "@/components/ins/skeleton";

/** Ajustes while it loads (log §398): profile head, the Plan · Cuenta · Notificaciones tabs and the plan card. */
export default function SettingsLoading() {
  return (
    <SkPage>
      <div className="sk-split" style={{ flexDirection: "row", gap: 16 }}>
        <Sk w={64} h={64} className="circ" />
        <div style={{ display: "grid", gap: 10, flex: 1 }}>
          <Sk w="min(260px, 70%)" h={30} style={{ borderRadius: 10 }} />
          <Sk w="min(200px, 50%)" h={13} />
        </div>
      </div>
      <div style={{ marginTop: 28 }}>
        <SkTabs n={3} />
      </div>
      <SkCard style={{ marginTop: 20, gap: 18 }}>
        <Sk w={90} h={11} />
        <Sk w={180} h={28} className="strong" />
        <Sk w="80%" />
        <Sk w="60%" />
        <Sk w={170} h={40} className="pill strong" />
      </SkCard>
      <SkCard style={{ marginTop: 16 }}>
        <Sk w={140} h={14} className="strong" />
        <Sk w="90%" />
        <Sk w="70%" />
      </SkCard>
    </SkPage>
  );
}
