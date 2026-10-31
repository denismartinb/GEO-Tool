import { Sk, SkCard, SkHead, SkPage, SkRows, SkStrip, SkTabs } from "@/components/ins/skeleton";

/** Prompts while it loads (log §398): visibility strip in one row, Temas/Prompts with search, and a theme group. */
export default function PromptsLoading() {
  return (
    <SkPage>
      <SkHead action lead={1} />

      <div style={{ marginTop: 24 }}>
        <SkStrip n={5} row />
      </div>

      <div className="sk-h" style={{ marginTop: 32 }}>
        <SkTabs n={2} />
        <Sk w={260} h={36} className="pill sk-hide-m" />
      </div>

      <SkCard flush style={{ marginTop: 18 }}>
        <div className="sk-row">
          <div className="sk-grow">
            <Sk w={60} h={10} />
            <Sk w="46%" h={18} className="strong" />
          </div>
          <Sk w={120} h={8} className="pill sk-hide-m" />
          <Sk w={44} h={20} className="strong" />
        </div>
        <SkRows n={5} lead="none" />
      </SkCard>
    </SkPage>
  );
}
