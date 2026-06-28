export type AccountRole = "admin" | "member";

// There is no teams/RBAC table yet — every signed-in user is the sole owner
// of their workspace, so they are treated as admin until multi-user ships.
// The Settings permission gating (billing tab, org edit, team management)
// is real and reads from this function, so flipping it later to a real
// role lookup is the only change needed.
export async function getAccountRole(): Promise<AccountRole> {
  return "admin";
}
