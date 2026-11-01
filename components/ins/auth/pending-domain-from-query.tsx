"use client";

import { useEffect } from "react";
import { rememberPendingDomain } from "@/lib/onboarding/pending-domain";

/**
 * WP-PLUGIN-1: «Analizar dominio» in the WordPress plugin opens
 * `/signup?dominio=<site>`. The domain takes the hero's path to the new-domain
 * wizard (`localStorage`, consumed on read), so it survives email
 * confirmation. Renders nothing.
 */
export function PendingDomainFromQuery({ domain }: { domain?: string }) {
  useEffect(() => {
    if (domain) rememberPendingDomain(domain);
  }, [domain]);
  return null;
}
