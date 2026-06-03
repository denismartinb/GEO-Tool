import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: projects }, { data: runs }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, country, language")
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("project_id, status, created_at")
      .order("created_at", { ascending: false })
  ]);

  const latestScanStatusByProject = (runs ?? []).reduce<Record<string, string>>((statuses, run) => {
    if (!statuses[run.project_id]) statuses[run.project_id] = run.status;
    return statuses;
  }, {});

  return (
    <div className="shell">
      <Sidebar projects={projects ?? []} />
      <div className="dash-main">
        <header className="dash-header">
          <WorkspaceTopbar projects={projects ?? []} latestScanStatusByProject={latestScanStatusByProject} />
          <div className="dash-header-actions">
            <div className="meta">{user.email}</div>
            <form action={signOut}>
              <Button variant="outline" type="submit">
                <Icon name="settings" size={14} />
                Cerrar sesión
              </Button>
            </form>
          </div>
        </header>
        <main className="dash-content">{children}</main>
      </div>
    </div>
  );
}
