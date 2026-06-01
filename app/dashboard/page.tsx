import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card>
        <CardHeader>
          <h2 className="font-medium">Phase 0/1 Ready</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">Use the projects section to create and manage v0 inputs.</p>
          <Link href="/dashboard/projects" className="mt-3 inline-block text-sm underline">
            Go to projects
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
