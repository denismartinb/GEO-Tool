import { WorkspacePlaceholder } from "@/components/workspace-placeholder";
import { requireActiveProject } from "@/lib/project-workspace";

export default async function CompetitorsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireActiveProject(projectId);

  return (
    <WorkspacePlaceholder
      projectId={projectId}
      kicker="Analizar"
      title="Competidores"
      description="Gestiona y revisa competidores de este proyecto."
    />
  );
}
