import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import PayoutSettings from "@/components/PayoutSettings";

export const metadata = { title: "Withdrawal settings | Ratewell" };

export default async function WithdrawalSettingsPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <PayoutSettings />;
}
