"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { EmergingBrand } from "@/lib/competitors/emerging-brands";
import { followBrandAction } from "../actions";

/**
 * "+ Seguir" asks the server for nothing but the brand name — the domain is
 * resolved server-side with the same grounded Gemini lookup onboarding uses
 * (founder feedback: "el sistema tiene que buscar solo el dominio, como en
 * el onboarding. No tiene que meterlo el usuario"). When the lookup fails
 * we surface that honestly and point at "Gestionar" rather than falling back
 * to an inline domain field, which is exactly what this replaced.
 */
function FollowRow({ projectId, brand }: { projectId: string; brand: EmergingBrand }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function follow() {
    setError(null);
    startTransition(async () => {
      const result = await followBrandAction({ projectId, name: brand.name });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="cm2-emg">
      <span className="cm2-rank-fav" style={{ background: "var(--ink-4)" }}>
        {brand.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="cm2-emg-main">
        <div className="cm2-rank-nm">
          <span className="cm2-rank-nm-txt">{brand.name}</span>
        </div>
        <div className="cm2-emg-meta">
          En {brand.occurrences} {brand.occurrences === 1 ? "prompt" : "prompts"}
        </div>
        {error ? <div className="cm2-emg-err">{error}</div> : null}
      </div>
      <button type="button" className="cm2-btn-mini" onClick={follow} disabled={isPending}>
        {isPending ? (
          "Buscando…"
        ) : (
          <>
            <Icon name="plus" size={11} />
            Seguir
          </>
        )}
      </button>
    </div>
  );
}

export function EmergingBrandsSection({ projectId, brands }: { projectId: string; brands: EmergingBrand[] }) {
  return (
    <div className="card">
      <div className="cm2-emg-intro">La IA las menciona en tus prompts y no las sigues todavía.</div>
      {brands.map((brand) => (
        <FollowRow key={brand.name} projectId={projectId} brand={brand} />
      ))}
    </div>
  );
}
