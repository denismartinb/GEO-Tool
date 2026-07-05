import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { BillingContent } from "@/components/billing/billing-content";

export default async function BillingSettingsPage() {
  await requireUser();

  const role = await getAccountRole();
  if (role !== "admin") redirect("/dashboard/settings/profile");

  return <BillingContent embedded />;
}
