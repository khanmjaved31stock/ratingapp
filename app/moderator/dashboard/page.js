import { requirePageRole } from "@/lib/page-auth";
import { getRatingPage } from "@/lib/rating-data";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata = { title: "Moderator workspace | Ratewell" };

export default async function ModeratorDashboardPage() {
  const profile = await requirePageRole("moderator", "/moderator");
  const [ratingPage, taskReviewPage] = await Promise.all([
    getRatingPage({ role: "moderator" }),
    getRatingPage({ role: "moderator", taskReviewQueue: true }),
  ]);
  return (
    <AdminDashboard
      role="moderator"
      title="Moderator workspace"
      description={`Signed in as ${profile.name}. Review feedback and manage support tickets.`}
      initialRatingPage={ratingPage}
      initialTaskReviewPage={taskReviewPage}
    />
  );
}
