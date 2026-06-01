import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject } from "../actions";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Project</h1>
        <Link href="/dashboard/projects" className="text-sm underline">Back</Link>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Project Details</h2>
        </CardHeader>
        <CardContent>
          <form action={createProject} className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input id="domain" name="domain" placeholder="example.com" required />
            </div>
            <div>
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" name="brand" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="country">Country</Label>
                <Input id="country" name="country" placeholder="ES" required />
              </div>
              <div>
                <Label htmlFor="language">Language</Label>
                <Input id="language" name="language" placeholder="es" required />
              </div>
            </div>
            {params.error ? <p className="text-sm text-red-600">{params.error}</p> : null}
            <Button type="submit">Create project</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
