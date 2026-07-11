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
 * GET /api/labours?active=true&location_id=<n>&include_location=true
 *   Returns all labours (optionally filtered by active / location).
 *   Response: { labours: [...] }
 *
 * POST /api/labours
 *   Body: { name, phone?, role?, daily_wage?, location_id? }
 *   Response: { labour: {...} } with status 201
 *
 * PATCH /api/labours
 *   Body: { id, name?, phone?, role?, daily_wage?, is_active?, location_id? }
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
    const includeLocation = url.searchParams.get("include_location") === "true";
    const locStr = url.searchParams.get("location_id");
    let location_id: number | null | undefined = undefined;
    if (locStr !== null) {
      const n = Number(locStr);
      // Accept "0" or "all" as "no filter"
      if (Number.isFinite(n) && n > 0) location_id = n;
      else location_id = null;
    }

    // Cache key suffix must distinguish every filter combination so
    // different location filters don't share a cached response.
    const suffix = [
      activeOnly ? "active" : "all",
      includeLocation ? "withloc" : "noloc",
      location_id == null ? "all-loc" : `loc-${location_id}`,
    ].join(":");

    const labours = await cachedGet(
      userKey(auth.user.id, "labours", suffix),
      [userTag(auth.user.id, "labours")],
      LABOURS_TTL,
      () => getAllLabours(activeOnly, { location_id, includeLocation }),
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

    // location_id (optional). Accept null / 0 / undefined → null.
    // Otherwise must be a positive integer referencing locations.id.
    let location_id: number | null = null;
    if (body.location_id != null && body.location_id !== "") {
      const locN = Number(body.location_id);
      if (!Number.isFinite(locN) || locN <= 0) {
        return NextResponse.json(
          { error: "location_id must be a positive number (or null)" },
          { status: 400 }
        );
      }
      location_id = locN;
    }

    const labour = await createLabour({
      name: body.name,
      phone: body.phone ?? null,
      role: body.role ?? null,
      daily_wage: dailyWage,
      location_id,
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

    // location_id (optional in PATCH). Explicitly accepts null to clear.
    if (body.location_id !== undefined) {
      if (body.location_id === null || body.location_id === "") {
        updates.location_id = null;
      } else {
        const locN = Number(body.location_id);
        if (!Number.isFinite(locN) || locN <= 0) {
          return NextResponse.json(
            { error: "location_id must be a positive number (or null)" },
            { status: 400 }
          );
        }
        updates.location_id = locN;
      }
    }

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
