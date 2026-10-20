import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { UserReferrals } from "@/components/UserPortal";

export const metadata = { title: "Referrals | Ratewell" };

export default async function ReferralsPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <UserReferrals />;
}
