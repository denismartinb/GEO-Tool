"use client";

import { useEffect } from "react";
import { setInternalVisitor } from "@/lib/analytics/internal-visitor";

/**
 * Marks this browser as the team's so it stops sending web analytics
 * (`lib/analytics/internal-visitor.ts`). Rendered only for team accounts,
 * decided on the server. Renders nothing.
 */
export function InternalVisitorMark() {
  useEffect(() => {
    setInternalVisitor(true);
  }, []);
  return null;
}
