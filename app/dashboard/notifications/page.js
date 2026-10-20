import { redirect } from "next/navigation";
import UserNotifications from "@/components/UserNotifications";
import { requirePageRole } from "@/lib/page-auth";

export const metadata = { title: "Notifications | Ratewell" };

export default async function NotificationsPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <UserNotifications />;
}
