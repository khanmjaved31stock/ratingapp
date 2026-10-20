import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAdmin, requireStaff } from "@/lib/admin";
import { writeAdminAudit } from "@/lib/audit";
import { ensureHelpCategories, slugify } from "@/lib/help-center";
import { isSameOriginRequest, readJsonBody } from "@/lib/request";
import HelpCenterCategory from "@/models/HelpCenterCategory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await requireStaff(request, ["superAdmin", "helpAdmin"]);
    if (auth.response) return auth.response;
    await connectDB();
    await ensureHelpCategories();
    const categories = await HelpCenterCategory.find().sort({ sortOrder: 1, name: 1 }).lean();
    return NextResponse.json({ categories: categories.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      slug: item.slug,
      active: item.active,
      sortOrder: item.sortOrder,
    })) });
  } catch (error) {
    console.error("Loading Help Center categories failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not load Help Center categories." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : "";
  const slug = slugify(parsed.body.slug || name);
  const sortOrder = Number(parsed.body.sortOrder ?? 100);
  if (!name || name.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
    return NextResponse.json({ error: "Enter a valid category name, URL slug, and display order." }, { status: 400 });
  }
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    await connectDB();
    const session = await mongoose.startSession();
    let category;
    try {
      await session.withTransaction(async () => {
        [category] = await HelpCenterCategory.create([{ name, slug, sortOrder }], { session });
        await writeAdminAudit(request, auth, "help-category.created", {
          type: "HelpCenterCategory",
          id: category._id.toString(),
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ category: { id: category._id.toString(), name, slug, active: true, sortOrder } }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ error: "That category URL is already in use." }, { status: 409 });
    console.error("Creating Help Center category failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not create the Help Center category." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = await readJsonBody(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, active } = parsed.body;
  const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : "";
  const slug = slugify(parsed.body.slug || name);
  const sortOrder = Number(parsed.body.sortOrder);
  if (
    !mongoose.isValidObjectId(id) ||
    !name || name.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    typeof active !== "boolean" ||
    !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000
  ) return NextResponse.json({ error: "Invalid Help Center category update." }, { status: 400 });
  try {
    const auth = await requireAdmin(request, "superAdmin");
    if (auth.response) return auth.response;
    await connectDB();
    const session = await mongoose.startSession();
    let category;
    try {
      await session.withTransaction(async () => {
        category = await HelpCenterCategory.findByIdAndUpdate(
          id,
          { $set: { name, slug, active, sortOrder } },
          { new: true, runValidators: true, session },
        );
        if (!category) throw Object.assign(new Error("Category not found."), { status: 404 });
        await writeAdminAudit(request, auth, "help-category.updated", {
          type: "HelpCenterCategory",
          id,
          metadata: { name, active, sortOrder },
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ message: "Category updated." });
  } catch (error) {
    if (error?.status === 404) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error?.code === 11000) return NextResponse.json({ error: "That category URL is already in use." }, { status: 409 });
    console.error("Updating Help Center category failed:", error?.name || "UnknownError");
    return NextResponse.json({ error: "Could not update the Help Center category." }, { status: 500 });
  }
}
