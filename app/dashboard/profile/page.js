import { redirect } from "next/navigation";
import UserProfile from "@/components/UserProfile";
import { requirePageRole } from "@/lib/page-auth";

export const metadata = { title: "Your profile | Ratewell" };

export default async function ProfilePage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");
  return <UserProfile initialProfile={{ name: profile.name, email: profile.email }} />;
}
