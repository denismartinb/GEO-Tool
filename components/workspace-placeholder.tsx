import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export function WorkspacePlaceholder({
  projectId,
  kicker,
  title,
  description
}: {
  projectId: string;
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page space-y-4">
      <p className="kicker">{kicker}</p>
      <h1 className="title-lg">{title}</h1>
      <Card>
        <CardHeader>
          <h2 className="font-medium">Disponible próximamente</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="sub">{description}</p>
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
          >
            Volver a la visión general
            <Icon name="arrRight" size={14} />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
