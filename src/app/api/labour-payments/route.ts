import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getErrorDetail } from "@/lib/api-error";
import {
  getLabourPayments,
  createLabourPayment,
  deleteLabourPayment,
} from "@/lib/data/labours";
import type { LabourPaymentType } from "@/types";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

export const dynamic = "force-dynamic";

const VALID_TYPES: LabourPaymentType[] = ["salary", "advance", "expense"];

// Payments list — short TTL (creates happen often)
const PAYMENTS_TTL = 5_000;

/**
 * GET /api/labour-payments
 *   Query params (all optional):
 *     labour_id=<number>
 *     payment_date=<YYYY-MM-DD>
 *     from=<YYYY-MM-DD>     (alias: payment_date_gte)
 *     to=<YYYY-MM-DD>       (alias: payment_date_lte)
 *     type=<salary|advance|expense>
 *     include_labour=true
 *   Response: { payments: [...] }
 *
 * POST /api/labour-payments
 *   Body: { labour_id, payment_date, amount, payment_type?, description? }
 *   Response: { payment: {...} } with status 201
 *
 * DELETE /api/labour-payments?id=<id>
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

    const payment_date    = sp.get("payment_date") || undefined;
    const payment_date_gte = sp.get("from") || sp.get("payment_date_gte") || undefined;
    const payment_date_lte = sp.get("to")   || sp.get("payment_date_lte") || undefined;
    const typeParam       = sp.get("type") as LabourPaymentType | null;
    const payment_type    = typeParam && VALID_TYPES.includes(typeParam) ? typeParam : undefined;
    const includeLabour   = sp.get("include_labour") === "true";

    // Build cache key from filter combination
    const filterKey = JSON.stringify({
      labour_id, payment_date, payment_date_gte, payment_date_lte, payment_type, includeLabour,
    });

    const payments = await cachedGet(
      userKey(auth.user.id, "labour-payments", filterKey),
      [userTag(auth.user.id, "labour-payments")],
      PAYMENTS_TTL,
      () => getLabourPayments({
        labour_id,
        payment_date,
        payment_date_gte,
        payment_date_lte,
        payment_type,
        includeLabour,
      }),
    );

    return NextResponse.json({ payments });
  } catch (err) {
    console.error("Fetch labour payments error:", err);
    return NextResponse.json(
      { error: "Failed to fetch labour payments", detail: getErrorDetail(err) },
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

    if (!body?.payment_date || typeof body.payment_date !== "string") {
      return NextResponse.json(
        { error: "payment_date (YYYY-MM-DD) is required" },
        { status: 400 }
      );
    }
    // Quick date shape check — Supabase will validate further
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.payment_date)) {
      return NextResponse.json(
        { error: "payment_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    let payment_type: LabourPaymentType = "salary";
    if (body?.payment_type) {
      if (!VALID_TYPES.includes(body.payment_type)) {
        return NextResponse.json(
          { error: `payment_type must be one of: ${VALID_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      payment_type = body.payment_type;
    }

    const description = body?.description ?? null;

    const entered_by = auth.type === "admin"
      ? `admin:${auth.user.id}`
      : `customer:${auth.user.id}`;

    const payment = await createLabourPayment({
      labour_id,
      payment_date: body.payment_date,
      amount,
      payment_type,
      description,
      entered_by,
    });

    // Payment affects: labour-payments list, cash (if expense type), dashboard
    invalidateByTag(userTag(auth.user.id, "labour-payments"));
    if (payment_type === "expense") {
      invalidateByTag(
        userTag(auth.user.id, "cash"),
        userTag(auth.user.id, "dashboard"),
        userTag(auth.user.id, "reconciliation"),
      );
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    console.error("Create labour payment error:", err);
    return NextResponse.json(
      { error: "Failed to create labour payment", detail: getErrorDetail(err) },
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

    await deleteLabourPayment(id);
    // We don't know payment type without fetching — invalidate all affected domains to be safe
    invalidateByTag(
      userTag(auth.user.id, "labour-payments"),
      userTag(auth.user.id, "cash"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "reconciliation"),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete labour payment error:", err);
    return NextResponse.json(
      { error: "Failed to delete labour payment", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}
