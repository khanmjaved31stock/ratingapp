import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { UserSettings } from "@/components/UserPortal";

export const metadata = { title: "Account settings | Ratewell" };

export default async function SettingsPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <UserSettings />;
}
