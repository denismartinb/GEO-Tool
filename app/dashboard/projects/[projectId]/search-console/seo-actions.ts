"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { screenPath } from "@/lib/search-console/oauth-cookie";
import { seoTrackingCapsFor } from "@/lib/seo-tracking/caps";
import { discoverFromRivalsCore, discoverFromSeedCore, type DiscoverResult } from "@/lib/seo-tracking/discover";
import { MAX_SEED_CHARS } from "@/lib/seo-tracking/discover-pure";
import { MAX_KEYWORD_CHARS } from "@/lib/seo-tracking/keyword-text";
import {
  addTrackedKeywordsCore,
  ensureTopicCore,
  MAX_TOPIC_NAME,
  setActionDoneCore,
  setCompetitorsCore,
  untrackKeywordCore,
  type KeywordSource
} from "@/lib/seo-tracking/manage";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * SEO-TRACK-1 PR B (log §341): the writes of «Posición en Google». Each one
 * validates with zod, proves identity and ownership (`requireUser` +
 * `requireActiveProject`), reads the user's own effective plan, and hands
 * verified ids to the service-role cores in `lib/seo-tracking/manage.ts`
 * (`.claude/rules/seo-tracking.md`). They return an outcome for the client
 * (called with `useTransition`), never a raw database message.
 */

export type SeoActionResult = { ok: true; message?: string } | { ok: false; error: string };

const projectId = z.string().uuid();
const keyword = z.string().trim().min(1).max(MAX_KEYWORD_CHARS);
const topicRef = z.union([z.object({ id: z.string().uuid() }), z.object({ name: z.string().trim().min(1).max(MAX_TOPIC_NAME) }), z.object({ none: z.literal(true) })]);
const domain = z.string().trim().min(3).max(255);

const FAILED = "No se ha podido guardar. Vuelve a intentarlo en un momento.";
const UNAVAILABLE = "El seguimiento de palabras todavía no está activo en tu cuenta.";

async function verified(id: string) {
  const { supabase, user } = await requireUser();
  const project = await requireActiveProject(id);
  const plan = await getPlanForUser(supabase, user.id);
  return { ownerUserId: user.id, project, planId: plan.id as string };
}

function done(id: string) {
  revalidatePath(screenPath(id));
}

async function resolveTopic(
  service: ReturnType<typeof createServiceClient>,
  ids: { projectId: string; ownerUserId: string },
  ref: z.infer<typeof topicRef>
): Promise<{ ok: true; topicId: string | null } | { ok: false; error: string }> {
  if ("id" in ref) return { ok: true, topicId: ref.id };
  if ("none" in ref) return { ok: true, topicId: null };
  const topic = await ensureTopicCore(service, { ...ids, name: ref.name });
  if (topic.status === "ok") return { ok: true, topicId: topic.topicId };
  return { ok: false, error: topic.status === "invalid" ? "El nombre del tema no es válido." : topic.status === "unavailable" ? UNAVAILABLE : FAILED };
}

function capMessage(added: number, overCap: number, cap: number): string {
  const head = added === 1 ? "Vigilas 1 palabra más." : `Vigilas ${added} palabras más.`;
  const tail = overCap > 0 ? ` ${overCap === 1 ? "Una no entraba" : `${overCap} no entraban`}: tu plan llega a ${cap}.` : "";
  return `${added > 0 ? head : "No se ha añadido ninguna palabra."}${tail}${added > 0 ? " Su primera foto llega el lunes." : ""}`;
}

const addSchema = z.object({
  projectId,
  source: z.enum(["search_console", "competitor_gap", "keyword_ideas", "manual"]),
  items: z.array(z.object({ keyword, topic: topicRef })).min(1).max(150)
});

/** «Vigilar N palabras» from «Descubrir palabras», each with its topic. */
export async function addSeoKeywordsAction(input: z.input<typeof addSchema>): Promise<SeoActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa las palabras elegidas." };
  const { ownerUserId, planId } = await verified(parsed.data.projectId);
  const ids = { projectId: parsed.data.projectId, ownerUserId };
  const service = createServiceClient();

  // Group by topic so each topic is resolved once; the cap is re-read per group.
  const groups = new Map<string, { ref: z.infer<typeof topicRef>; keywords: string[] }>();
  for (const item of parsed.data.items) {
    const key = JSON.stringify(item.topic);
    if (!groups.has(key)) groups.set(key, { ref: item.topic, keywords: [] });
    groups.get(key)!.keywords.push(item.keyword);
  }
  let added = 0;
  let overCap = 0;
  for (const group of groups.values()) {
    const topic = await resolveTopic(service, ids, group.ref);
    if (!topic.ok) return topic;
    const result = await addTrackedKeywordsCore(service, { ...ids, planId, keywords: group.keywords, source: parsed.data.source as KeywordSource, topicId: topic.topicId });
    if (result.status === "unavailable") return { ok: false, error: UNAVAILABLE };
    if (result.status !== "ok") return { ok: false, error: FAILED };
    added += result.added.length + result.retracked.length;
    overCap += result.overCap.length;
  }
  done(parsed.data.projectId);
  return { ok: true, message: capMessage(added, overCap, seoTrackingCapsFor(planId).keywords) };
}

const setupSchema = z.object({
  projectId,
  rivals: z.array(domain).max(10),
  topics: z
    .array(z.object({ name: z.string().trim().min(1).max(MAX_TOPIC_NAME), targetUrl: z.string().url().max(2048).nullable(), keywords: z.array(keyword).min(1).max(150) }))
    .min(1)
    .max(30)
});

/** «Guardar y empezar» of the first use: rivals, topics and their keywords. */
export async function setupSeoTrackingAction(input: z.input<typeof setupSchema>): Promise<SeoActionResult> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los temas y las palabras." };
  const { ownerUserId, planId } = await verified(parsed.data.projectId);
  const ids = { projectId: parsed.data.projectId, ownerUserId };
  const service = createServiceClient();

  const rivals = await setCompetitorsCore(service, { ...ids, planId, domains: parsed.data.rivals });
  if (rivals.status === "unavailable") return { ok: false, error: UNAVAILABLE };
  if (rivals.status !== "ok") return { ok: false, error: FAILED };

  let added = 0;
  let overCap = 0;
  for (const t of parsed.data.topics) {
    const topic = await ensureTopicCore(service, { ...ids, name: t.name, targetUrl: t.targetUrl });
    if (topic.status !== "ok") return { ok: false, error: topic.status === "unavailable" ? UNAVAILABLE : FAILED };
    const result = await addTrackedKeywordsCore(service, { ...ids, planId, keywords: t.keywords, source: "search_console", topicId: topic.topicId });
    if (result.status !== "ok") return { ok: false, error: result.status === "unavailable" ? UNAVAILABLE : FAILED };
    added += result.added.length + result.retracked.length;
    overCap += result.overCap.length;
  }
  done(parsed.data.projectId);
  return { ok: true, message: capMessage(added, overCap, seoTrackingCapsFor(planId).keywords) };
}

const untrackSchema = z.object({ projectId, keywordId: z.string().uuid() });

export async function untrackSeoKeywordAction(input: z.input<typeof untrackSchema>): Promise<SeoActionResult> {
  const parsed = untrackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: FAILED };
  const { ownerUserId } = await verified(parsed.data.projectId);
  const result = await untrackKeywordCore(createServiceClient(), { projectId: parsed.data.projectId, ownerUserId, keywordId: parsed.data.keywordId });
  if (result.status !== "ok") return { ok: false, error: result.status === "unavailable" ? UNAVAILABLE : FAILED };
  done(parsed.data.projectId);
  return { ok: true, message: "Ya no la vigilas. Su historial se guarda por si vuelves a vigilarla." };
}

const rivalsSchema = z.object({ projectId, domains: z.array(domain).max(10) });

export async function setSeoRivalsAction(input: z.input<typeof rivalsSchema>): Promise<SeoActionResult> {
  const parsed = rivalsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los dominios." };
  const { ownerUserId, planId } = await verified(parsed.data.projectId);
  const result = await setCompetitorsCore(createServiceClient(), { projectId: parsed.data.projectId, ownerUserId, planId, domains: parsed.data.domains });
  if (result.status !== "ok") return { ok: false, error: result.status === "unavailable" ? UNAVAILABLE : FAILED };
  done(parsed.data.projectId);
  const skipped = result.rejected.length;
  return {
    ok: true,
    message: `Rivales guardados.${skipped ? ` ${skipped === 1 ? "Un dominio no era válido o no entraba en tu plan" : `${skipped} dominios no eran válidos o no entraban en tu plan`}.` : ""}${
      result.added.length ? " Los enlaces de un rival nuevo llegan el lunes." : ""
    }`
  };
}

const actionDoneSchema = z.object({ projectId, topicId: z.string().uuid(), actionKey: z.string().min(1).max(300), done: z.boolean() });

export async function setSeoActionDoneAction(input: z.input<typeof actionDoneSchema>): Promise<SeoActionResult> {
  const parsed = actionDoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: FAILED };
  const { ownerUserId } = await verified(parsed.data.projectId);
  const result = await setActionDoneCore(createServiceClient(), { ...parsed.data, ownerUserId });
  if (result.status !== "ok") return { ok: false, error: result.status === "unavailable" ? UNAVAILABLE : FAILED };
  done(parsed.data.projectId);
  return { ok: true };
}

export type DiscoverActionResult = DiscoverResult | { status: "error" };

const seedSchema = z.object({ projectId, seed: z.string().max(MAX_SEED_CHARS) });

export async function discoverSeedAction(input: z.input<typeof seedSchema>): Promise<DiscoverActionResult> {
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { ownerUserId, planId } = await verified(parsed.data.projectId);
  if (seoTrackingCapsFor(planId).keywords === 0) return { status: "unavailable" };
  return discoverFromSeedCore(createServiceClient(), { projectId: parsed.data.projectId, ownerUserId, seed: parsed.data.seed });
}

const rivalsDiscoverSchema = z.object({ projectId });

export async function discoverRivalsAction(input: z.input<typeof rivalsDiscoverSchema>): Promise<DiscoverActionResult> {
  const parsed = rivalsDiscoverSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { ownerUserId, planId, project } = await verified(parsed.data.projectId);
  const caps = seoTrackingCapsFor(planId);
  if (caps.keywords === 0) return { status: "unavailable" };
  return discoverFromRivalsCore(createServiceClient(), {
    projectId: parsed.data.projectId,
    ownerUserId,
    ownDomain: project.domain,
    rivalCap: caps.competitors
  });
}
