import { requirePageRole } from "@/lib/page-auth";
import AdminDashboard from "@/components/AdminDashboard";
import { getRatingPage } from "@/lib/rating-data";

export const metadata = { title: "Helpline Admin Console | Ratewell" };

export default async function HelpAdminDashboardPage() {
  const profile = await requirePageRole("helpAdmin", "/help-admin");
  const [ratingPage, taskReviewPage] = await Promise.all([
    getRatingPage({ role: "helpAdmin" }),
    getRatingPage({ role: "helpAdmin", taskReviewQueue: true }),
  ]);

  return (
    <AdminDashboard
      role="helpAdmin"
      title="Helpline Admin console"
      description={`Signed in as ${profile.name}. Review customer feedback securely.`}
      initialRatingPage={ratingPage}
      initialTaskReviewPage={taskReviewPage}
    />
  );
}
