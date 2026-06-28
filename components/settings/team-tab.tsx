"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import type { AccountRole } from "@/lib/account-role";
import { deriveNameFromEmail } from "@/lib/derive-name-from-email";

type TeamMemberStatus = "active" | "invited";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: AccountRole;
  status: TeamMemberStatus;
  initials: string;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function canManageRole(isAdmin: boolean, member: TeamMember) {
  return isAdmin && member.role !== "admin" && member.status === "active";
}

function seedTeam(currentUser: { email: string; initials: string }): TeamMember[] {
  return [
    {
      id: "self",
      name: deriveNameFromEmail(currentUser.email),
      email: currentUser.email,
      role: "admin",
      status: "active",
      initials: currentUser.initials
    },
    { id: "2", name: "Lucía Ferrer", email: "lucia@agenciaacme.com", role: "member", status: "active", initials: "LF" },
    { id: "3", name: "Marc Oliva", email: "marc@agenciaacme.com", role: "member", status: "active", initials: "MO" },
    { id: "4", name: null, email: "nuria@agenciaacme.com", role: "member", status: "invited", initials: "N" }
  ];
}

export function TeamTab({
  role,
  currentUser
}: {
  role: AccountRole;
  currentUser: { email: string; initials: string };
}) {
  const isAdmin = role === "admin";
  const [team, setTeam] = useState<TeamMember[]>(() => seedTeam(currentUser));
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");

  const addMember = () => {
    const email = invite.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setErr("Introduce un email válido.");
      return;
    }
    if (team.some((member) => member.email.toLowerCase() === email)) {
      setErr("Ese usuario ya está en el equipo.");
      return;
    }
    setTeam((current) => [
      ...current,
      { id: String(Date.now()), name: null, email, role: "member", status: "invited", initials: email[0].toUpperCase() }
    ]);
    setInvite("");
    setErr("");
  };

  const remove = (id: string) => setTeam((current) => current.filter((member) => member.id !== id));
  const setRole = (id: string, nextRole: AccountRole) =>
    setTeam((current) => current.map((member) => (member.id === id ? { ...member, role: nextRole } : member)));

  const activeCount = team.filter((member) => member.status === "active").length;
  const invitedCount = team.filter((member) => member.status === "invited").length;

  return (
    <div className="set-pane">
      <div className="summary">
        <div className="summary-ico">
          <Icon name="users" size={20} />
        </div>
        <div className="summary-txt">
          <b>{activeCount} usuarios activos</b> y <b>{invitedCount} invitaciones</b> pendientes. Tu plan incluye{" "}
          <b>usuarios ilimitados</b> — invita a todo tu equipo sin coste adicional.
        </div>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <p className="card-title">Invitar usuario</p>
          </CardHeader>
          <CardContent>
            <div className="set-invite">
              <div style={{ flex: 1 }}>
                <div className="set-invite-bar">
                  <Icon name="mail" size={16} className="text-[var(--ink-4)]" />
                  <input
                    className="set-invite-input"
                    placeholder="nombre@empresa.com"
                    value={invite}
                    onChange={(event) => {
                      setInvite(event.target.value);
                      setErr("");
                    }}
                    onKeyDown={(event) => event.key === "Enter" && addMember()}
                  />
                </div>
                {err && (
                  <div className="field-err" style={{ justifyContent: "flex-start", marginTop: 8 }}>
                    <Icon name="alertCircle" size={13} />
                    {err}
                  </div>
                )}
              </div>
              <Button type="button" onClick={addMember}>
                <Icon name="plus" size={15} />
                Enviar invitación
              </Button>
            </div>
            <div className="set-hint" style={{ marginTop: 10 }}>
              <Icon name="info" size={12} />
              Los usuarios invitados tienen acceso a todo excepto a <b>Plan y facturación</b>.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <p className="card-title">Usuarios</p>
          <span className="badge badge-neutral">{team.length}</span>
        </CardHeader>
        <div className="set-team">
          {team.map((member, index) => (
            <div className="set-member" key={member.id} style={{ borderBottom: index < team.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
              <div className={`set-avatar ${member.status === "invited" ? "pending" : ""}`}>{member.initials}</div>
              <div className="set-member-info">
                <div className="set-member-name">
                  {member.name ?? <span style={{ color: "var(--ink-4)", fontWeight: 600 }}>Invitación pendiente</span>}
                  {member.status === "invited" && <span className="badge badge-warn" style={{ marginLeft: 8 }}>Pendiente</span>}
                </div>
                <div className="set-member-email">{member.email}</div>
              </div>
              <div className="set-member-role">
                {canManageRole(isAdmin, member) ? (
                  <div className="seg">
                    <button type="button" className={member.role === "member" ? "on" : ""} onClick={() => setRole(member.id, "member")}>
                      Miembro
                    </button>
                    <button type="button" className={member.role === "admin" ? "on" : ""} onClick={() => setRole(member.id, "admin")}>
                      Admin
                    </button>
                  </div>
                ) : (
                  <span className={`set-role-pill ${member.role === "admin" ? "" : "ghost"}`}>
                    <Icon name={member.role === "admin" ? "shield" : "user"} size={12} />
                    {member.role === "admin" ? "Administrador" : "Miembro"}
                  </span>
                )}
              </div>
              {isAdmin && member.role !== "admin" && (
                <button
                  type="button"
                  className="icon-btn"
                  title={member.status === "invited" ? "Cancelar invitación" : "Quitar usuario"}
                  onClick={() => remove(member.id)}
                >
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
