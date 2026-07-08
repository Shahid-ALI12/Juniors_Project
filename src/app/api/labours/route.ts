import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getErrorDetail } from "@/lib/api-error";
import {
  getAllLabours,
  createLabour,
  updateLabour,
  deleteLabour,
} from "@/lib/data/labours";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Labours list changes rarely — 60s TTL
const LABOURS_TTL = 60_000;

/**
 * GET /api/labours?active=true
 *   Returns all labours (or only active ones if ?active=true).
 *   Response: { labours: [...] }
 *
 * POST /api/labours
 *   Body: { name, phone?, role?, daily_wage? }
 *   Response: { labour: {...} } with status 201
 *
 * PATCH /api/labours
 *   Body: { id, name?, phone?, role?, daily_wage?, is_active? }
 *   Response: { labour: {...} }
 *
 * DELETE /api/labours?id=<id>
 *   Soft-deletes (deactivates) the labour.
 *   Response: { success: true }
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "true";
    const suffix = activeOnly ? "active" : "all";

    const labours = await cachedGet(
      userKey(auth.user.id, "labours", suffix),
      [userTag(auth.user.id, "labours")],
      LABOURS_TTL,
      () => getAllLabours(activeOnly),
    );
    return NextResponse.json({ labours });
  } catch (err) {
    console.error("Fetch labours error:", err);
    return NextResponse.json(
      { error: "Failed to fetch labours", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    // Validation
    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const dailyWage = body.daily_wage != null
      ? Number(body.daily_wage)
      : 0;
    if (!Number.isFinite(dailyWage) || dailyWage < 0) {
      return NextResponse.json(
        { error: "daily_wage must be a non-negative number" },
        { status: 400 }
      );
    }

    const labour = await createLabour({
      name: body.name,
      phone: body.phone ?? null,
      role: body.role ?? null,
      daily_wage: dailyWage,
    });

    invalidateByTag(userTag(auth.user.id, "labours"));
    return NextResponse.json({ labour }, { status: 201 });
  } catch (err) {
    console.error("Create labour error:", err);
    return NextResponse.json(
      { error: "Failed to create labour", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    if (!body?.id || typeof body.id !== "number") {
      return NextResponse.json(
        { error: "id (number) is required" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (body.name != null) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.name = body.name.trim();
    }
    if (body.phone != null) updates.phone = body.phone?.trim() || null;
    if (body.role != null)  updates.role  = body.role?.trim()  || null;
    if (body.daily_wage != null) {
      const w = Number(body.daily_wage);
      if (!Number.isFinite(w) || w < 0) {
        return NextResponse.json(
          { error: "daily_wage must be a non-negative number" },
          { status: 400 }
        );
      }
      updates.daily_wage = w;
    }
    if (body.is_active != null) updates.is_active = Boolean(body.is_active);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const labour = await updateLabour(body.id, updates);
    invalidateByTag(userTag(auth.user.id, "labours"));
    return NextResponse.json({ labour });
  } catch (err) {
    console.error("Update labour error:", err);
    return NextResponse.json(
      { error: "Failed to update labour", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const idStr = url.searchParams.get("id");
    if (!idStr) {
      return NextResponse.json(
        { error: "?id=<number> is required" },
        { status: 400 }
      );
    }
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { error: "id must be a number" },
        { status: 400 }
      );
    }

    await deleteLabour(id);
    invalidateByTag(userTag(auth.user.id, "labours"));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete labour error:", err);
    return NextResponse.json(
      { error: "Failed to delete labour", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}
