import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import type { AccountRole } from "@/lib/account-role";
import { deriveNameFromEmail } from "@/lib/derive-name-from-email";

/**
 * Multi-user accounts (invites, roles, RBAC) are not built — "teams" is on
 * CLAUDE.md's Forbidden list. This tab used to render a fabricated team
 * (seeded fake colleagues + a fake pending invite) and an "Enviar invitación"
 * button that added a client-only row without ever sending anything, while
 * claiming "usuarios ilimitados". That is exactly the kind of fake product
 * behavior the constitution forbids, and it is the first screen an
 * agency-owner (this product's ICP, who works in teams) is likely to open
 * (docs/ux-qa-audit-2026-07.md, finding 1). Shows only the real signed-in
 * user and an honest "coming later" note instead.
 */
export function TeamTab({
  role,
  currentUser
}: {
  role: AccountRole;
  currentUser: { email: string; initials: string };
}) {
  const isAdmin = role === "admin";
  const name = deriveNameFromEmail(currentUser.email);

  return (
    <div className="set-pane">
      <div className="summary">
        <div className="summary-ico">
          <Icon name="users" size={20} />
        </div>
        <div className="summary-txt">
          Por ahora tu cuenta es de <b>un solo usuario</b>. Invitar a compañeros de
          equipo llegará más adelante.
        </div>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <p className="card-title">Usuarios</p>
          <span className="badge badge-neutral">1</span>
        </CardHeader>
        <div className="set-team">
          <div className="set-member" style={{ borderBottom: "none" }}>
            <div className="set-avatar">{currentUser.initials}</div>
            <div className="set-member-info">
              <div className="set-member-name">{name}</div>
              <div className="set-member-email">{currentUser.email}</div>
            </div>
            <div className="set-member-role">
              <span className={`set-role-pill ${isAdmin ? "" : "ghost"}`}>
                <Icon name={isAdmin ? "shield" : "user"} size={12} />
                {isAdmin ? "Administrador" : "Miembro"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <p className="card-title">Invitar usuarios</p>
        </CardHeader>
        <CardContent>
          <div className="set-hint">
            <Icon name="info" size={12} />
            El modo multiusuario (invitar compañeros con roles de equipo) todavía no
            está disponible. Trabajamos en ello para una próxima fase.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
