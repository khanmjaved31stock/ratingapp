import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { UserSupport } from "@/components/UserPortal";

export const metadata = { title: "Support | Ratewell" };

export default async function SupportPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <UserSupport />;
}
