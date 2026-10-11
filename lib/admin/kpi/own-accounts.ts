import "server-only";

import { isOperatorUserId } from "@/lib/admin/operator";
import { isPanelExcludedEmail } from "@/lib/admin/kpi/excluded-accounts";
import { isInternalTestAccountEmail } from "@/lib/projects/internal-test-accounts";
import { isCompedAccountEmail } from "@/lib/billing/comped-accounts";

/**
 * ADMIN-PANEL-1 — whether an account counts in /admin/panel. Ours never do:
 * operators (`ADMIN_USER_IDS`), internal test accounts
 * (`INTERNAL_TEST_ACCOUNT_EMAILS`), comped accounts (`COMPED_ACCOUNT_EMAILS`)
 * and the team's own sign-ups (`isPanelExcludedEmail`). The console also uses
 * it to stop a team browser from sending web analytics
 * (`components/internal-visitor-mark.tsx`).
 */
export function isCountedAccount(row: { id: string; email: string }): boolean {
  return (
    !isOperatorUserId(row.id) &&
    !isInternalTestAccountEmail(row.email) &&
    !isCompedAccountEmail(row.email) &&
    !isPanelExcludedEmail(row.email)
  );
}
