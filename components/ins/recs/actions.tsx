"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { useToast } from "@/components/ins/toasts";
import { useActionFeedback } from "@/components/ui/action-feedback";
import {
  addEmergingCompetitorAction,
  dismissRecommendationAction,
  restoreRecommendationAction,
  rewriteRecommendationAction,
} from "@/app/dashboard/projects/[projectId]/actions";
import { domainForBrandName } from "@/lib/recommendations/anchored-domains";
import { parseCompetitorDomain } from "@/lib/competitors/competitor-domain";
import { deliverableForType } from "@/lib/recommendations/deliverable";
import type { InsCard } from "@/lib/ins/recs-cards";

/**
 * The actions of a recommendation card, run through the same contract as the
 * old cards (pending, acknowledged success or categorized error, never
 * nothing; ACTIONS-OBSERVABLE-1 slice 4a). Marking a plan card done keeps its
 * plate in the deck, marked, so the plan does not reshuffle under the person
 * while they work through it (log §357); «Resueltas» keeps the durable undo.
 */

export type DoneInfo = { message: string; hint: string };

type RecsCtx = {
  projectId: string;
  done: Record<string, DoneInfo>;
  setDone: (id: string, info: DoneInfo | null) => void;
};

export const RecsContext = createContext<RecsCtx | null>(null);

function useRecs(): RecsCtx {
  const ctx = useContext(RecsContext);
  if (!ctx) throw new Error("RecsContext missing");
  return ctx;
}

export function doneHint(card: InsCard): string {
  if (card.lever && card.lever.memberIds.length > 1)
    return "Cierra todas sus preguntas. Cada una se comprueba en tu próximo escaneo.";
  return card.control === "third_party"
    ? "Verás si te incluyen en tu próximo escaneo."
    : "Lo verás en tu próximo escaneo.";
}

export function useCardActions(card: InsCard) {
  const { projectId, done, setDone } = useRecs();
  const router = useRouter();
  const toast = useToast();
  const gen = useActionFeedback();
  const dis = useActionFeedback();
  const undo = useActionFeedback();
  const others = card.lever
    ? card.lever.memberIds.filter((id) => id !== card.lever?.representativeId)
    : [];
  const memberIds = card.lever ? card.lever.memberIds : [card.id];
  const cta = deliverableForType(card.type).cta;

  return {
    done: done[card.id] ?? null,
    cta,
    generating: gen.isPending,
    generateError: gen.state.status === "error" ? gen.state.message : null,
    marking: dis.isPending,
    markError: dis.state.status === "error" ? dis.state.message : null,
    undoing: undo.isPending,
    undoError: undo.state.status === "error" ? undo.state.message : null,
    generate() {
      gen.run(
        () =>
          rewriteRecommendationAction({
            projectId,
            recommendationId: card.id,
            ...(others.length > 0 ? { leverMemberIds: others } : {}),
          }),
        {
          successMessage: "Propuesta generada.",
          onSuccess: () => {
            toast(
              "Propuesta generada.",
              "La tienes en la tarjeta.",
              "sparkles",
            );
            router.refresh();
          },
        },
      );
    },
    markDone() {
      dis.run(
        () =>
          dismissRecommendationAction({
            projectId,
            recommendationId: card.id,
            ...(others.length > 0 ? { leverMemberIds: others } : {}),
          }),
        {
          successMessage: "Marcada como hecha.",
          onSuccess: () => {
            const info = {
              message: "Marcada como hecha.",
              hint: doneHint(card),
            };
            setDone(card.id, info);
            toast(info.message, info.hint, "checkc");
            router.refresh();
          },
        },
      );
    },
    undoDone() {
      undo.run(
        async () => {
          for (const id of memberIds) {
            const result = await restoreRecommendationAction({
              projectId,
              recommendationId: id,
            });
            if (!result.success) return result;
          }
          return { success: true as const };
        },
        {
          successMessage: "Restaurada.",
          onSuccess: () => {
            setDone(card.id, null);
            router.refresh();
          },
        },
      );
    },
  };
}

/**
 * RECS-ADD-COMPETITOR-1: this type is a button, not a plan. The website comes
 * from a cited source that matches the brand exactly, or the card asks for it.
 */
export function EmergingAction({ card }: { card: InsCard }) {
  const { projectId, done, setDone } = useRecs();
  const router = useRouter();
  const toast = useToast();
  const feedback = useActionFeedback();
  const ev = card.rec.evidence_json ?? {};
  const name = (ev.emerging_competitor ?? "").trim();
  const knownDomain =
    ev.emerging_competitor_domain ??
    (name ? domainForBrandName(name, ev.citation_domains ?? []) : null);
  const [editing, setEditing] = useState(!knownDomain);
  const [input, setInput] = useState(knownDomain ?? "");
  const domain = parseCompetitorDomain(input);
  const pending = feedback.state.status === "pending";
  const info = done[card.id];
  const inputId = `rec-web-${card.id}`;

  useEffect(() => {
    if (feedback.state.status === "error" && !input) setEditing(true);
  }, [feedback.state.status, input]);

  if (info) {
    return (
      <div className="donebar" role="status">
        <Ic n="checkc" />
        {info.message}
        <a
          className="btn sm ghost"
          href={`/dashboard/projects/${projectId}/competitors`}
        >
          Ver competidores
        </a>
      </div>
    );
  }

  function add() {
    if (!domain || !name) return;
    feedback.run(
      async () => {
        const result = await addEmergingCompetitorAction({
          projectId,
          recommendationId: card.id,
          domain,
        });
        if (result.success) {
          const message = result.alreadyTracked
            ? `Ya seguías a ${name}.`
            : `${name} añadida a tus competidores.`;
          setDone(card.id, {
            message,
            hint: result.alreadyTracked
              ? "Damos esta tarjeta por hecha."
              : "El próximo escaneo medirá cuánto aparece frente a ti.",
          });
          toast(
            message,
            result.alreadyTracked
              ? "Damos esta tarjeta por hecha."
              : "El próximo escaneo medirá cuánto aparece frente a ti.",
            "checkc",
          );
          router.refresh();
        }
        return result;
      },
      { successMessage: `${name} añadida a tus competidores.` },
    );
  }

  return (
    <div className="rc-add">
      {editing ? (
        <label className="rc-field" htmlFor={inputId}>
          <span>Web de {name}</span>
          <input
            id={inputId}
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="ejemplo.com"
            value={input}
            disabled={pending}
            onChange={(e) => {
              setInput(e.target.value);
              if (feedback.state.status === "error") feedback.reset();
            }}
          />
        </label>
      ) : null}
      {editing && input.trim() !== "" && !domain ? (
        <p className="rc-err" role="alert">
          El dominio no es válido.
        </p>
      ) : null}
      <div className="rc-addb">
        <button
          type="button"
          className="btn ink"
          disabled={!domain || !name || pending}
          onClick={add}
        >
          {pending ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              Añadiendo {name}…
            </>
          ) : (
            <>
              <Ic n="plus" sm />
              Añadir {name} a competidores
            </>
          )}
        </button>
        {!editing && domain && !pending ? (
          <span className="rc-meta">
            Con su web {domain} ·{" "}
            <button
              type="button"
              className="rc-link"
              onClick={() => setEditing(true)}
            >
              Cambiar
            </button>
          </span>
        ) : null}
      </div>
      {feedback.state.status === "error" ? (
        <p className="rc-err" role="alert">
          {feedback.state.message}
        </p>
      ) : null}
    </div>
  );
}
