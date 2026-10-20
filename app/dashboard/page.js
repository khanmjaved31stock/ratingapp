import { redirect } from "next/navigation";
import UserDashboard from "@/components/UserDashboard";
import { requirePageRole } from "@/lib/page-auth";
import { getRatingPage } from "@/lib/rating-data";
import { getRemainingPackageDays } from "@/lib/package-dates";

export const metadata = { title: "Your Dashboard | Ratewell" };

export default async function DashboardPage() {
  const profile = await requirePageRole("user", "/");
  if (!profile) redirect("/");

  const ratingPage = await getRatingPage({
    role: "user",
    userId: profile.id,
  });

  return (
    <UserDashboard
      profile={{
        name: profile.name,
        email: profile.email,
        packageActivatedAt: profile.packageActivatedAt,
        packageExpiresAt: profile.packageExpiresAt,
        packageRemainingDays: profile.packageExpiresAt
          ? getRemainingPackageDays(profile.packageExpiresAt)
          : null,
        packageName: profile.packageName,
        packagePriceMinor: profile.packagePriceMinor,
        packageCurrency: profile.packageCurrency,
        packageDailyTaskLimit: profile.packageDailyTaskLimit,
        packagePerTaskEarningsMinor: profile.packagePerTaskEarningsMinor,
        referralTier: profile.referralTier,
      }}
      initialRatings={ratingPage.ratings}
      initialHasMore={ratingPage.hasMore}
      initialCursor={ratingPage.nextCursor}
    />
  );
}
