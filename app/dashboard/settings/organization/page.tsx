import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { OrganizationTab } from "@/components/settings/organization-tab";

export default async function OrganizationSettingsPage() {
  const { user } = await requireUser();

  const role = await getAccountRole();

  const metadata = user.user_metadata ?? {};
  const name = typeof metadata.org_name === "string" ? metadata.org_name : "";
  const website = typeof metadata.org_website === "string" ? metadata.org_website : "";
  const sector = typeof metadata.org_sector === "string" ? metadata.org_sector : "";
  const taxInfo = typeof metadata.org_tax_info === "string" ? metadata.org_tax_info : "";

  return <OrganizationTab role={role} name={name} website={website} sector={sector} taxInfo={taxInfo} />;
}
