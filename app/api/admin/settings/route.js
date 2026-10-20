import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import { privateImageUrl } from "@/lib/cloudinary";
import PortalSettings from "@/models/PortalSettings";
import { isValidTimeZone } from "@/lib/business-time";
import { DEFAULT_PRIVACY, DEFAULT_TERMS, DEFAULT_TERMS_VERSION } from "@/lib/legal-terms";
import { getConfiguredWithdrawalMethods, normalizeWithdrawalMethods } from "@/lib/withdrawal-methods";

export const runtime = "nodejs";

function isHttpsUrl(value) {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedTaskVideo(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"].includes(host) ||
      url.pathname.toLowerCase().endsWith(".mp4")
    );
  } catch {
    return false;
  }
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const settings =
      (await PortalSettings.findOne({ key: "global" }).lean()) ||
      (await PortalSettings.create({ key: "global" })).toObject();
    return NextResponse.json({
      settings: {
        currency: "PKR",
        businessTimeZone: settings.businessTimeZone || "UTC",
        ratingRewardMinor: settings.ratingRewardMinor,
        referralLevels: settings.referralLevels,
        reviewTasks: {
          title: "Review task",
          instructions: "",
          rulesText: "",
          websiteUrl: "",
          videoUrl: "",
          mediaImagePublicId: "",
          rewardMinor: settings.ratingRewardMinor ?? 0,
          allowImage: false,
          requireImage: false,
          allowLink: false,
          requireLink: false,
          allowVideoLinks: false,
          minimumSeconds: 0,
          cooldownSeconds: 0,
          dailyLimit: 0,
          userTotalLimit: 0,
          totalLimit: 0,
          ...settings.reviewTasks,
          mediaImageUrl: settings.reviewTasks?.mediaImagePublicId
            ? privateImageUrl(settings.reviewTasks.mediaImagePublicId, Math.floor(Date.now() / 1000) + 86400)
            : "",
          packageIds: (settings.reviewTasks?.packageIds || []).map((id) => id.toString()),
        },
        referralMilestones: settings.referralMilestones || [],
        goals: {
          monthlyRevenueMinor: 0,
          activeUsers: 0,
          monthlyRatings: 0,
          conversionPercent: 0,
          ...settings.goals,
        },
        packagePolicy: {
          validityDays: 30,
          renewalCooldownDays: 2,
          requireRecommendedDuringCooldown: true,
          ...settings.packagePolicy,
        },
        legalContent: {
          termsVersion: DEFAULT_TERMS_VERSION,
          terms: DEFAULT_TERMS,
          privacy: DEFAULT_PRIVACY,
          requireReacceptance: false,
          ...settings.legalContent,
        },
        marqueeNews: {
          message: "",
          active: false,
          startsAt: null,
          endsAt: null,
          ...settings.marqueeNews,
        },
        minimumWithdrawalMinor: settings.minimumWithdrawalMinor,
        withdrawalFeeFixedMinor: settings.withdrawalFeeFixedMinor || 0,
        withdrawalFeeBasisPoints: settings.withdrawalFeeBasisPoints || 0,
        withdrawalMethods: getConfiguredWithdrawalMethods(settings.withdrawalMethods),
        maintenanceMode: settings.maintenanceMode,
      },
    });
  } catch (error) {
    console.error("Loading portal settings failed:", error);
    return NextResponse.json({ error: "Could not load portal settings." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const body = parsed.body;
    const levels = body.referralLevels;
    const tasks = body.reviewTasks;
    const milestones = body.referralMilestones;
    const goals = body.goals || {};
    const packagePolicy = body.packagePolicy || {};
    const legalContent = body.legalContent;
    const news = body.marqueeNews || {};
    const withdrawalMethods = body.withdrawalMethods === undefined
      ? undefined
      : normalizeWithdrawalMethods(body.withdrawalMethods);

    const invalid =
      !Number.isSafeInteger(body.ratingRewardMinor) ||
      body.ratingRewardMinor < 0 ||
      body.ratingRewardMinor > 1000000 ||
      !Number.isSafeInteger(body.minimumWithdrawalMinor) ||
      body.minimumWithdrawalMinor < 100 ||
      body.minimumWithdrawalMinor > 100000000 ||
      !Number.isSafeInteger(body.withdrawalFeeFixedMinor ?? 0) ||
      (body.withdrawalFeeFixedMinor ?? 0) < 0 ||
      (body.withdrawalFeeFixedMinor ?? 0) > 100000000 ||
      !Number.isInteger(body.withdrawalFeeBasisPoints ?? 0) ||
      (body.withdrawalFeeBasisPoints ?? 0) < 0 ||
      (body.withdrawalFeeBasisPoints ?? 0) > 10000 ||
      (body.withdrawalMethods !== undefined && !withdrawalMethods) ||
      !Array.isArray(levels) ||
      levels.length > 10 ||
      levels.some((item, index) =>
        !item ||
        item.level !== index + 1 ||
        !Number.isInteger(item.basisPoints) ||
        item.basisPoints < 0 ||
        item.basisPoints > 10000,
      ) ||
      typeof body.maintenanceMode !== "boolean" ||
      !isValidTimeZone(body.businessTimeZone || "UTC") ||
      !tasks ||
      typeof tasks.title !== "string" ||
      !tasks.title.trim() ||
      tasks.title.length > 120 ||
      typeof tasks.instructions !== "string" ||
      tasks.instructions.length > 2000 ||
      typeof tasks.rulesText !== "string" ||
      tasks.rulesText.length > 4000 ||
      typeof tasks.websiteUrl !== "string" ||
      tasks.websiteUrl.length > 2048 ||
      !isHttpsUrl(tasks.websiteUrl) ||
      typeof tasks.videoUrl !== "string" ||
      tasks.videoUrl.length > 2048 ||
      !isAllowedTaskVideo(tasks.videoUrl) ||
      typeof tasks.mediaImagePublicId !== "string" ||
      tasks.mediaImagePublicId.length > 300 ||
      !Number.isSafeInteger(tasks.rewardMinor) ||
      tasks.rewardMinor < 0 ||
      tasks.rewardMinor > 1000000 ||
      typeof tasks.allowImage !== "boolean" ||
      typeof tasks.requireImage !== "boolean" ||
      typeof tasks.allowLink !== "boolean" ||
      typeof tasks.requireLink !== "boolean" ||
      typeof tasks.allowVideoLinks !== "boolean" ||
      (tasks.requireImage && !tasks.allowImage) ||
      ((tasks.requireLink || tasks.allowVideoLinks) && !tasks.allowLink) ||
      !Number.isInteger(tasks.minimumSeconds) ||
      tasks.minimumSeconds < 0 ||
      tasks.minimumSeconds > 86400 ||
      !Number.isInteger(tasks.cooldownSeconds) ||
      tasks.cooldownSeconds < 0 ||
      tasks.cooldownSeconds > 604800 ||
      !Number.isInteger(tasks.dailyLimit) ||
      tasks.dailyLimit < 0 ||
      tasks.dailyLimit > 100 ||
      !Number.isInteger(tasks.userTotalLimit) ||
      tasks.userTotalLimit < 0 ||
      tasks.userTotalLimit > 1000000 ||
      !Number.isInteger(tasks.totalLimit) ||
      tasks.totalLimit < 0 ||
      tasks.totalLimit > 10000000 ||
      !Array.isArray(tasks.packageIds) ||
      tasks.packageIds.length > 100 ||
      tasks.packageIds.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id)) ||
      new Set(tasks.packageIds.map((id) => id.toLowerCase())).size !== tasks.packageIds.length ||
      !Array.isArray(milestones) ||
      milestones.length > 50 ||
      milestones.some((item) =>
        !item ||
        typeof item.id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,39}$/.test(item.id) ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        item.title.length > 80 ||
        !Number.isInteger(item.directConversions) ||
        item.directConversions < 0 ||
        item.directConversions > 100000 ||
        !Number.isInteger(item.indirectConversions) ||
        item.indirectConversions < 0 ||
        item.indirectConversions > 100000 ||
        !Number.isInteger(item.windowSeconds ?? 0) ||
        (item.windowSeconds ?? 0) < 0 ||
        (item.windowSeconds ?? 0) > 2592000 ||
        !Number.isSafeInteger(item.rewardMinor) ||
        item.rewardMinor < 0 ||
        item.rewardMinor > 100000000 ||
        typeof item.tier !== "string" ||
        item.tier.length > 40,
      ) ||
      new Set((milestones || []).map((item) => item.id)).size !== (milestones || []).length ||
      !Number.isSafeInteger(goals.monthlyRevenueMinor ?? 0) ||
      (goals.monthlyRevenueMinor ?? 0) < 0 ||
      (goals.monthlyRevenueMinor ?? 0) > 100000000000 ||
      !Number.isSafeInteger(goals.activeUsers ?? 0) ||
      (goals.activeUsers ?? 0) < 0 ||
      (goals.activeUsers ?? 0) > 100000000 ||
      !Number.isSafeInteger(goals.monthlyRatings ?? 0) ||
      (goals.monthlyRatings ?? 0) < 0 ||
      (goals.monthlyRatings ?? 0) > 100000000 ||
      !Number.isFinite(goals.conversionPercent ?? 0) ||
      (goals.conversionPercent ?? 0) < 0 ||
      (goals.conversionPercent ?? 0) > 100 ||
      !Number.isInteger(packagePolicy.validityDays ?? 30) ||
      (packagePolicy.validityDays ?? 30) < 1 ||
      (packagePolicy.validityDays ?? 30) > 365 ||
      !Number.isInteger(packagePolicy.renewalCooldownDays ?? 2) ||
      (packagePolicy.renewalCooldownDays ?? 2) < 0 ||
      (packagePolicy.renewalCooldownDays ?? 2) > 30 ||
      typeof (packagePolicy.requireRecommendedDuringCooldown ?? true) !== "boolean" ||
      (legalContent !== undefined &&
        (!legalContent ||
          typeof legalContent.termsVersion !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(legalContent.termsVersion) ||
          typeof legalContent.terms !== "string" ||
          legalContent.terms.trim().length < 20 ||
          legalContent.terms.length > 20000 ||
          typeof legalContent.privacy !== "string" ||
          legalContent.privacy.trim().length < 20 ||
          legalContent.privacy.length > 20000 ||
          typeof legalContent.requireReacceptance !== "boolean")) ||
      typeof news.message !== "string" ||
      news.message.length > 500 ||
      typeof news.active !== "boolean" ||
      (news.active && !news.message.trim()) ||
      (news.startsAt && !Number.isFinite(new Date(news.startsAt).getTime())) ||
      (news.endsAt && !Number.isFinite(new Date(news.endsAt).getTime())) ||
      (news.startsAt && news.endsAt && new Date(news.startsAt) >= new Date(news.endsAt));

    if (invalid) {
      console.error("Rejected invalid portal settings payload.", {
        adminId: auth.user._id.toString(),
      });
      return NextResponse.json({ error: "Invalid portal configuration. Check required fields, ranges, URLs, and date windows." }, { status: 400 });
    }

    const update = {
      ratingRewardMinor: tasks.rewardMinor,
      businessTimeZone: body.businessTimeZone || "UTC",
      referralLevels: levels,
      reviewTasks: {
        ...tasks,
        title: tasks.title.trim(),
        instructions: tasks.instructions.trim(),
        rulesText: tasks.rulesText.trim(),
        websiteUrl: tasks.websiteUrl.trim(),
        videoUrl: tasks.videoUrl.trim(),
        packageIds: tasks.packageIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
      referralMilestones: milestones.map((item) => ({
        ...item,
        windowSeconds: item.windowSeconds || 0,
        id: item.id.trim(),
        title: item.title.trim(),
        tier: item.tier.trim(),
      })),
      goals: {
        monthlyRevenueMinor: goals.monthlyRevenueMinor ?? 0,
        activeUsers: goals.activeUsers ?? 0,
        monthlyRatings: goals.monthlyRatings ?? 0,
        conversionPercent: goals.conversionPercent ?? 0,
      },
      packagePolicy: {
        validityDays: packagePolicy.validityDays ?? 30,
        renewalCooldownDays: packagePolicy.renewalCooldownDays ?? 2,
        requireRecommendedDuringCooldown: packagePolicy.requireRecommendedDuringCooldown ?? true,
      },
      ...(legalContent
        ? {
            legalContent: {
              termsVersion: legalContent.termsVersion.trim(),
              terms: legalContent.terms.trim(),
              privacy: legalContent.privacy.trim(),
              requireReacceptance: legalContent.requireReacceptance,
            },
          }
        : {}),
      marqueeNews: {
        message: news.message.trim(),
        active: news.active,
        startsAt: news.startsAt ? new Date(news.startsAt) : null,
        endsAt: news.endsAt ? new Date(news.endsAt) : null,
      },
      minimumWithdrawalMinor: body.minimumWithdrawalMinor,
      withdrawalFeeFixedMinor: body.withdrawalFeeFixedMinor ?? 0,
      withdrawalFeeBasisPoints: body.withdrawalFeeBasisPoints ?? 0,
      ...(withdrawalMethods ? { withdrawalMethods } : {}),
      maintenanceMode: body.maintenanceMode,
      updatedBy: auth.user._id,
    };

    const session = await mongoose.startSession();
    let settings;
    try {
      await session.withTransaction(async () => {
        settings = await PortalSettings.findOneAndUpdate(
          { key: "global" },
          { $set: update },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session },
        );
        await writeAdminAudit(request, auth, "portal-settings.updated", {
          type: "PortalSettings",
          id: settings._id.toString(),
          metadata: {
            ratingRewardMinor: settings.ratingRewardMinor,
            reviewTasks: settings.reviewTasks,
            referralMilestones: settings.referralMilestones,
            minimumWithdrawalMinor: settings.minimumWithdrawalMinor,
            termsVersion: settings.legalContent?.termsVersion || "",
            requireTermsReacceptance: settings.legalContent?.requireReacceptance || false,
            withdrawalMethods: withdrawalMethods || getConfiguredWithdrawalMethods(settings.withdrawalMethods),
            withdrawalMethodDetails: (withdrawalMethods || getConfiguredWithdrawalMethods(settings.withdrawalMethods))
              .map(({ provider, displayName, enabled, instructions }) => ({ provider, displayName, enabled, instructions })),
          },
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Portal settings saved." });
  } catch (error) {
    console.error("Updating portal settings failed:", {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      errors: error?.errors,
      stack: error?.stack,
    });
    const detail = error instanceof mongoose.Error.ValidationError
      ? Object.values(error.errors).map((item) => item.message).join(" ")
      : "";
    return NextResponse.json(
      { error: detail || "Could not save portal settings." },
      { status: detail ? 400 : 500 },
    );
  }
}
