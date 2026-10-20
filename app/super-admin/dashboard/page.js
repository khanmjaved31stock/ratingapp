import { requirePageRole } from "@/lib/page-auth";
import { getAdminUsersPage } from "@/lib/admin-data";
import { getRatingPage } from "@/lib/rating-data";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata = { title: "Super Admin Console | Ratewell" };

export default async function SuperAdminDashboardPage() {
  await requirePageRole("superAdmin", "/super-admin");
  const [usersPage, ratingPage, taskReviewPage] = await Promise.all([
    getAdminUsersPage(),
    getRatingPage({ role: "superAdmin" }),
    getRatingPage({ role: "superAdmin", taskReviewQueue: true }),
  ]);

  return (
    <AdminDashboard
      role="superAdmin"
      title="Super Admin console"
      description="Create Helpline Admins and manage user accounts."
      initialUsersPage={usersPage}
      initialRatingPage={ratingPage}
      initialTaskReviewPage={taskReviewPage}
    />
  );
}
