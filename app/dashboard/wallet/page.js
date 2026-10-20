import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { UserWallet } from "@/components/UserPortal";

export const metadata = { title: "Wallet | Ratewell" };

export default async function WalletPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <UserWallet />;
}
