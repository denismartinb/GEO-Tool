"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { EmergingBrand } from "@/lib/competitors/emerging-brands";
import { createCompetitorAction } from "../actions";

function FollowRow({ projectId, brand }: { projectId: string; brand: EmergingBrand }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!domain.trim()) {
      setError("Indica el dominio para poder seguir esta marca.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCompetitorAction({ projectId, name: brand.name, domain });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="cm2-emg" style={{ flexWrap: "wrap" }}>
      <span className="cm2-rank-fav" style={{ background: "var(--ink-4)" }}>
        {brand.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="cm2-rank-main">
        <div className="cm2-rank-nm">{brand.name}</div>
        <div className="cm2-emg-meta">
          En {brand.occurrences} {brand.occurrences === 1 ? "prompt" : "prompts"}
        </div>
      </div>
      {open ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            className="add-prompts-text-input"
            style={{ width: 140, padding: "6px 9px", fontSize: 12 }}
            placeholder="dominio.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={isPending}
            autoFocus
          />
          <button type="button" className="cm2-btn-mini" onClick={submit} disabled={isPending}>
            {isPending ? "…" : "Guardar"}
          </button>
        </div>
      ) : (
        <button type="button" className="cm2-btn-mini" onClick={() => setOpen(true)}>
          <Icon name="plus" size={11} /> Seguir
        </button>
      )}
      {error ? <div style={{ flexBasis: "100%", color: "var(--brand-neg)", fontSize: 11, marginTop: 4 }}>{error}</div> : null}
    </div>
  );
}

export function EmergingBrandsSection({ projectId, brands }: { projectId: string; brands: EmergingBrand[] }) {
  return (
    <div className="card">
      <div style={{ padding: "11px 13px 0", fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
        La IA las menciona en tus prompts y no las sigues todavía.
      </div>
      {brands.map((brand) => (
        <FollowRow key={brand.name} projectId={projectId} brand={brand} />
      ))}
    </div>
  );
}
