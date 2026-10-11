/**
 * OBSERVABILITY-1 (log §300): what leaves GenScore for Sentry.
 *
 * `sendDefaultPii: false` already keeps IPs, cookies and request bodies out,
 * but a few things still travel by default and some of them are secrets in
 * this product:
 *
 * - **Query strings.** `/baja?token=…` (signed unsubscribe link), the Search
 *   Console OAuth callback (`?code=…&state=…`), `/login?next=…`. A URL is
 *   kept, its query is not.
 * - **Headers.** `Authorization: Bearer <CRON_SECRET>` on every cron and
 *   self-dispatch. Dropped wholesale; nothing in a header helps a diagnosis.
 * - **Emails inside messages.** Errors from Supabase/Resend/Stripe can quote
 *   the address they failed on. Redacted wherever free text goes.
 *
 * Pure on purpose (no Sentry import): it runs as `beforeSend` in the three
 * runtimes and in the browser, and it is the one place to test.
 */

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, "[email]");
}

/** Keeps scheme, host and path; drops query string and fragment. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

type ScrubbableEvent = {
  message?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: unknown;
    cookies?: unknown;
    data?: unknown;
  };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: ScrubbableBreadcrumb[];
  user?: unknown;
};

type ScrubbableBreadcrumb = {
  message?: string;
  data?: Record<string, unknown>;
};

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(crumb: B): B {
  if (crumb.message) crumb.message = redactEmails(crumb.message);
  if (crumb.data) {
    for (const key of ["url", "from", "to"]) {
      const value = crumb.data[key];
      if (typeof value === "string") crumb.data[key] = stripQuery(value);
    }
  }
  return crumb;
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.message) event.message = redactEmails(event.message);

  if (event.request) {
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactEmails(exception.value);
  }

  event.breadcrumbs?.forEach(scrubBreadcrumb);

  // Nothing in this codebase calls Sentry.setUser; if something ever does,
  // the email/ip must not ride along. An opaque id is enough to group.
  if (event.user && typeof event.user === "object") {
    const { id } = event.user as { id?: unknown };
    event.user = id === undefined ? undefined : { id };
  }

  return event;
}
