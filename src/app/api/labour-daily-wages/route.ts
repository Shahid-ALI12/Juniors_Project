import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getErrorDetail } from "@/lib/api-error";
import {
  getLabourDailyWages,
  createLabourDailyWage,
  upsertLabourDailyWage,
  deleteLabourDailyWage,
} from "@/lib/data/labour-daily-wages";

export const dynamic = "force-dynamic";

/**
 * GET /api/labour-daily-wages
 *   Query params (all optional):
 *     labour_id=<number>
 *     wage_date=<YYYY-MM-DD>
 *     from=<YYYY-MM-DD>      (alias: wage_date_gte)
 *     to=<YYYY-MM-DD>        (alias: wage_date_lte)
 *     include_labour=true
 *   Response: { wages: [...] }
 *
 * POST /api/labour-daily-wages
 *   Body: { labour_id, wage_date, amount, notes?, upsert? }
 *     • If upsert=true and an entry already exists for (labour_id, wage_date),
 *       update it instead of erroring.
 *   Response: { wage: {...} } with status 201
 *
 * DELETE /api/labour-daily-wages?id=<id>
 *   Response: { success: true }
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const sp = url.searchParams;

    const labourIdStr = sp.get("labour_id");
    const labour_id = labourIdStr ? Number(labourIdStr) : undefined;
    if (labourIdStr && (!labour_id || !Number.isFinite(labour_id))) {
      return NextResponse.json(
        { error: "labour_id must be a number" },
        { status: 400 }
      );
    }

    const wage_date     = sp.get("wage_date") || undefined;
    const wage_date_gte = sp.get("from") || sp.get("wage_date_gte") || undefined;
    const wage_date_lte = sp.get("to")   || sp.get("wage_date_lte") || undefined;
    const includeLabour = sp.get("include_labour") === "true";

    const wages = await getLabourDailyWages({
      labour_id,
      wage_date,
      wage_date_gte,
      wage_date_lte,
      includeLabour,
    });

    return NextResponse.json({ wages });
  } catch (err) {
    console.error("Fetch labour daily wages error:", err);
    return NextResponse.json(
      { error: "Failed to fetch labour daily wages", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    // ── Validation ──
    const labour_id = Number(body?.labour_id);
    if (!Number.isFinite(labour_id) || labour_id <= 0) {
      return NextResponse.json(
        { error: "labour_id (number) is required" },
        { status: 400 }
      );
    }

    if (!body?.wage_date || typeof body.wage_date !== "string") {
      return NextResponse.json(
        { error: "wage_date (YYYY-MM-DD) is required" },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.wage_date)) {
      return NextResponse.json(
        { error: "wage_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: "amount must be a non-negative number" },
        { status: 400 }
      );
    }

    const notes = body?.notes ?? null;
    const useUpsert = body?.upsert === true;

    const entered_by = auth.type === "admin"
      ? `admin:${auth.user.id}`
      : `customer:${auth.user.id}`;

    const wage = useUpsert
      ? await upsertLabourDailyWage({
          labour_id,
          wage_date: body.wage_date,
          amount,
          notes,
          entered_by,
        })
      : await createLabourDailyWage({
          labour_id,
          wage_date: body.wage_date,
          amount,
          notes,
          entered_by,
        });

    return NextResponse.json({ wage }, { status: 201 });
  } catch (err) {
    console.error("Create labour daily wage error:", err);
    return NextResponse.json(
      { error: "Failed to create labour daily wage", detail: getErrorDetail(err) },
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

    await deleteLabourDailyWage(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete labour daily wage error:", err);
    return NextResponse.json(
      { error: "Failed to delete labour daily wage", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}
