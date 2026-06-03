import { WorkspacePlaceholder } from "@/components/workspace-placeholder";
import { requireActiveProject } from "@/lib/project-workspace";

export default async function RunsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireActiveProject(projectId);

  return (
    <WorkspacePlaceholder
      projectId={projectId}
      kicker="Analizar"
      title="Escaneos"
      description="Aquí verás el historial de escaneos del proyecto."
    />
  );
}
