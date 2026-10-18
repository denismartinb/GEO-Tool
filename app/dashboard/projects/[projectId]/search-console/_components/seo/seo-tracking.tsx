"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { TopicWithActions, SeoTrackingData } from "@/lib/seo-tracking/screen";
import type { ProposedTopic } from "@/lib/seo-tracking/setup-proposal";
import type { weeklySummary } from "@/lib/seo-tracking/view-model";
import { SeoDiscover, type NearKeyword } from "./seo-discover";
import { SeoResumen, type GscMini, type TodoItem } from "./seo-resumen";
import { SeoSetup, type ProposedRival } from "./seo-setup";
import { SeoTopics } from "./seo-topics";

/**
 * SEO-TRACK-1 PR B (log §342): «Posición en Google» with keyword tracking.
 * Design approved by the founder as prototype v6
 * (docs/design-reference/seo-track-1/posicion-google-v6.html): three tabs,
 * Resumen · Temas · Descubrir palabras; each topic opens in a side panel with
 * its «Qué hacer»; no «atrás» inside a tab. The Search Console detail that
 * already existed stays under the Resumen (`children`).
 */

export type ReadyData = Extract<SeoTrackingData, { kind: "setup" | "ready" }>;
export type SeoView = "resumen" | "temas" | "descubrir";

const TABS: Array<{ id: SeoView; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "temas", label: "Temas" },
  { id: "descubrir", label: "Descubrir palabras" }
];

export function SeoTracking(props: {
  projectId: string;
  ownDomain: string;
  data: ReadyData;
  todo: TodoItem[];
  summary: ReturnType<typeof weeklySummary>;
  gsc: GscMini | null;
  near: NearKeyword[];
  gscPositions: Record<string, number>;
  proposal: { topics: ProposedTopic[]; rivals: ProposedRival[] };
  nextSnapshot: string;
  lastSnapshot: string | null;
  initialView: SeoView;
  children: ReactNode;
}) {
  const { data } = props;
  const [view, setView] = useState<SeoView>(props.initialView);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [keywordId, setKeywordId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const go = useCallback((next: SeoView) => {
    setView(next);
    setTopicId(null);
    const url = new URL(window.location.href);
    if (next === "resumen") url.searchParams.delete("vista");
    else url.searchParams.set("vista", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const openTopic = useCallback(
    (id: string, kwId?: string) => {
      if (view !== "temas") go("temas");
      setTopicId(id);
      setKeywordId(kwId ?? null);
    },
    [view, go]
  );

  if (data.kind === "setup") {
    return (
      <SeoSetup
        projectId={props.projectId}
        caps={data.caps}
        proposal={props.proposal}
        gscConnected={props.gsc !== null}
        onToast={setToast}
        toast={toast}
      />
    );
  }

  const topic: TopicWithActions | null = topicId ? data.topics.find((t) => t.id === topicId) ?? null : null;

  return (
    <div className="skw">
      <div className="skw-tabs" role="tablist" aria-label="Secciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            className={`gsc-st${view === t.id ? " gsc-st-on" : ""}`}
            onClick={() => go(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "resumen" && (
        <SeoResumen
          projectId={props.projectId}
          ownDomain={props.ownDomain}
          data={data}
          todo={props.todo}
          summary={props.summary}
          gsc={props.gsc}
          nextSnapshot={props.nextSnapshot}
          lastSnapshot={props.lastSnapshot}
          onOpenTopic={openTopic}
          onGo={go}
          onToast={setToast}
        />
      )}
      {view === "temas" && (
        <SeoTopics
          projectId={props.projectId}
          ownDomain={props.ownDomain}
          data={data}
          topic={topic}
          keywordId={keywordId}
          onOpen={openTopic}
          onClose={() => setTopicId(null)}
          onSelectKeyword={setKeywordId}
          onToast={setToast}
          onGo={go}
        />
      )}
      {view === "descubrir" && (
        <SeoDiscover
          projectId={props.projectId}
          data={data}
          near={props.near}
          gscPositions={props.gscPositions}
          gscConnected={props.gsc !== null}
          onToast={setToast}
        />
      )}

      {view === "resumen" && props.children}

      {toast && (
        <div className="skw-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
