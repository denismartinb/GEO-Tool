import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <p className="text-sm text-slate-600">{user.email}</p>
          <form action={signOut}>
            <Button variant="outline" type="submit">Sign out</Button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
