import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Temporary diagnostic endpoint for the cross-tab session investigation.
// Returns no cookie values or tokens, only cookie names and auth status.
export async function GET() {
  const cookieStore = await cookies();
  const cookieNames = cookieStore.getAll().map((c) => c.name);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json({
    cookieNames,
    authenticated: !!data.user,
    userId: data.user?.id ?? null,
    error: error?.message ?? null
  });
}
