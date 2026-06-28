import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountRole } from "@/lib/account-role";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getAccountRole();

  return (
    <div className="page">
      <p className="kicker">Cuenta</p>
      <h1 className="title-lg">Ajustes de cuenta</h1>
      <SettingsTabs role={role} />
      {children}
    </div>
  );
}
