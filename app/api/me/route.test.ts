import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn((_columns: string) => ({ eq: () => ({ maybeSingle }) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select })
  })
}));

// The service client backs the trial DOWNGRADE, which this endpoint must never
// perform. Importing it for real would also demand its env vars; mocking it
// lets the "no write, no email" assertions below be real assertions.
const serviceUpdate = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ update: () => ({ eq: serviceUpdate }) })
  })
}));

const sendTrialEndedEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendTrialEndedEmail: (...args: unknown[]) => sendTrialEndedEmail(...args)
}));

import { GET } from "./route";

const USER = { id: "user-1", email: "de5@gmail.com" };
const DAY = 24 * 60 * 60 * 1000;

function anonymous() {
  getUser.mockResolvedValue({ data: { user: null } });
}

function loggedIn(profile: Record<string, unknown> | null) {
  getUser.mockResolvedValue({ data: { user: USER } });
  maybeSingle.mockResolvedValue({ data: profile });
}

describe("GET /api/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 200 with a null user when nobody is logged in", async () => {
    anonymous();

    const response = await GET();

    // Not 401: anonymous is the expected case on a marketing page, and a
    // failed request on every public page load would be noise in the console.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  it("returns the email and the resolved plan for a logged-in visitor", async () => {
    loggedIn({ current_plan: "agency", trial_ends_at: null, stripe_subscription_id: null });

    const { user } = await (await GET()).json();

    expect(user.email).toBe("de5@gmail.com");
    expect(user.planId).toBe("agency");
    expect(user.planName).toBeTruthy();
  });

  it("reports an elapsed reverse trial as free, so the badge stops claiming a plan the account no longer has", async () => {
    loggedIn({
      current_plan: "pro",
      trial_ends_at: new Date(Date.now() - DAY).toISOString(),
      stripe_subscription_id: null
    });

    const { user } = await (await GET()).json();

    expect(user.planId).toBe("free");
  });

  it("keeps a paid subscription on its plan even once the original trial window elapsed", async () => {
    loggedIn({
      current_plan: "pro",
      trial_ends_at: new Date(Date.now() - DAY).toISOString(),
      stripe_subscription_id: "sub_123"
    });

    const { user } = await (await GET()).json();

    expect(user.planId).toBe("pro");
  });

  it("still reports the trial plan while the window is open", async () => {
    loggedIn({
      current_plan: "pro",
      trial_ends_at: new Date(Date.now() + DAY).toISOString(),
      stripe_subscription_id: null
    });

    const { user } = await (await GET()).json();

    expect(user.planId).toBe("pro");
  });

  it("never downgrades or emails on an elapsed trial — painting a badge is not enforcement", async () => {
    loggedIn({
      current_plan: "pro",
      trial_ends_at: new Date(Date.now() - DAY).toISOString(),
      stripe_subscription_id: null
    });

    await GET();

    // This endpoint is reachable from every static marketing page. If it ever
    // starts writing or emailing, a blog visit sends a customer a "trial
    // ended" email — enforcement belongs on the console's own plan read.
    expect(serviceUpdate).not.toHaveBeenCalled();
    expect(sendTrialEndedEmail).not.toHaveBeenCalled();
  });

  it("reads only the three columns the chip needs, never the whole profile row", async () => {
    loggedIn({ current_plan: "pro" });

    await GET();

    // `profiles` carries billing identifiers and the account email; this
    // endpoint answers unauthenticated-looking requests from every marketing
    // page, so widening the select here widens what those pages can leak.
    const [columns] = select.mock.calls[0];
    expect(columns).toBe("current_plan, trial_ends_at, stripe_subscription_id");
  });

  it("falls back to a resolved plan when the profile row is missing rather than throwing", async () => {
    loggedIn(null);

    const response = await GET();

    expect(response.status).toBe(200);
    const { user } = await response.json();
    expect(user.email).toBe("de5@gmail.com");
    expect(user.planId).toBeTruthy();
  });
});
