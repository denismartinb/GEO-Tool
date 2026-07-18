import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic endpoint for the ENGINES-2a real-world test — remove
 * before this branch's changes are merged (same lifecycle as the
 * /api/debug/sentry-test route used and removed in PR #183).
 *
 * Why it exists: OPENAI_API_KEY is stored as a Sensitive variable in Vercel,
 * which cannot be viewed again after saving — so when the scan executor kept
 * reporting 401 from OpenAI while the same key verified fine from outside,
 * there was no way to inspect what the runtime actually receives. This
 * endpoint reports metadata about the configured value (length, prefix
 * checks, whitespace/quote contamination) and performs one live auth check
 * against OpenAI's /v1/models — it NEVER returns the key itself.
 *
 * Gated by an authenticated session (any logged-in user) instead of a
 * dedicated secret env var: the first version used DEBUG_CHECK_SECRET, but
 * newly-added env vars were exactly what wasn't reaching the runtime — the
 * gate itself reproduced the bug it was meant to diagnose. A session
 * cookie doesn't depend on any env var landing.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawKey = process.env.OPENAI_API_KEY ?? "";
  const diagnostics = {
    hasKey: rawKey.length > 0,
    keyLength: rawKey.length,
    startsWithSkProj: rawKey.startsWith("sk-proj-"),
    startsWithBearer: rawKey.toLowerCase().startsWith("bearer"),
    hasLeadingOrTrailingWhitespace: rawKey !== rawKey.trim(),
    containsNewline: /[\r\n]/.test(rawKey),
    containsQuotes: rawKey.includes('"') || rawKey.includes("'"),
    keyFirst8: rawKey.slice(0, 8),
    keyLast4: rawKey.slice(-4),
    model: process.env.OPENAI_MODEL ?? null,
    providers: process.env.LLM_SCAN_PROVIDERS ?? null,
    debugCheckSecretPresent: Boolean(process.env.DEBUG_CHECK_SECRET),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null
  };

  // Live auth check using the value EXACTLY as the scan executor would
  // (`Bearer ${key}`, no trimming) plus a trimmed variant to distinguish
  // "key is wrong" from "key is right but padded with whitespace".
  let statusExact: number | string = "not_attempted";
  let statusTrimmed: number | string = "not_attempted";
  if (rawKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${rawKey}` },
        signal: AbortSignal.timeout(8000)
      });
      statusExact = res.status;
    } catch (error) {
      statusExact = `fetch_failed: ${error instanceof Error ? error.name : "unknown"}`;
    }
    if (rawKey !== rawKey.trim()) {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${rawKey.trim()}` },
          signal: AbortSignal.timeout(8000)
        });
        statusTrimmed = res.status;
      } catch (error) {
        statusTrimmed = `fetch_failed: ${error instanceof Error ? error.name : "unknown"}`;
      }
    }
  }

  return NextResponse.json({ ...diagnostics, openaiStatusExact: statusExact, openaiStatusTrimmed: statusTrimmed });
}
