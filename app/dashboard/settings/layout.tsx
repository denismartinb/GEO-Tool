import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

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
