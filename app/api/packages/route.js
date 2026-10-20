import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import RegistrationPackage from "@/models/RegistrationPackage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const packages = await RegistrationPackage.find({
      active: true,
      archivedAt: null,
      $or: [
        { eligibleReferralTiers: { $exists: false } },
        { eligibleReferralTiers: { $size: 0 } },
        { eligibleReferralTiers: "__unassigned__" },
      ],
    })
      .select("name description priceMinor currency benefits validityDays dailyEarningLimitMinor dailyTaskQuota dailyTaskLimit perTaskEarningsMinor minimumWithdrawalMinor maximumWithdrawalMinor withdrawalFeeBrackets")
      .sort({ sortOrder: 1, priceMinor: 1 })
      .lean();
    return NextResponse.json(
      {
        packages: packages.map((item) => ({
          id: item._id.toString(),
          name: item.name,
          description: item.description,
          priceMinor: item.priceMinor,
          currency: item.currency,
          benefits: item.benefits,
          validityDays: item.validityDays ?? 30,
          dailyEarningLimitMinor: item.dailyEarningLimitMinor ?? 0,
          dailyTaskQuota: item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0,
          dailyTaskLimit: item.dailyTaskLimit ?? item.dailyTaskQuota ?? 0,
          perTaskEarningsMinor: item.perTaskEarningsMinor ?? 0,
          minimumWithdrawalMinor: item.minimumWithdrawalMinor ?? 100,
          maximumWithdrawalMinor: item.maximumWithdrawalMinor ?? null,
          withdrawalFeeBrackets: item.withdrawalFeeBrackets || [
            { minimumAmountMinor: 100, maximumAmountMinor: null, basisPoints: 0 },
          ],
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Loading registration packages failed:", error);
    return NextResponse.json(
      { error: "Registration packages are temporarily unavailable." },
      { status: 500 },
    );
  }
}
