import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import {
  getCustomerPaymentsPaginated,
  recordCustomerPayment,
  deleteCustomerPayment,
} from "@/lib/data/customer-payments";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { invalidateByTag, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────
// GET /api/customer-payments
//   Paginated list of customer payments (incoming money without a sale).
//
// Query params:
//   payment_date      — exact date filter
//   payment_date_gte  — start date (inclusive)
//   payment_date_lte  — end date (inclusive)
//   customer_id       — filter to a specific customer
//   customer_name     — case-insensitive substring search on customer name
//   page              — 1-indexed page number (default 1)
//   pageSize          — rows per page (default 50, capped at 200)
//
// Response: { rows, total, page, pageSize, totalPages }
// ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const filters: Record<string, string | number> = {};
    if (url.searchParams.get("payment_date")) filters.payment_date = url.searchParams.get("payment_date")!;
    if (url.searchParams.get("payment_date_gte")) filters.payment_date_gte = url.searchParams.get("payment_date_gte")!;
    if (url.searchParams.get("payment_date_lte")) filters.payment_date_lte = url.searchParams.get("payment_date_lte")!;
    if (url.searchParams.get("customer_id")) filters.customer_id = Number(url.searchParams.get("customer_id")!);
    if (url.searchParams.get("customer_name")) filters.customer_name = url.searchParams.get("customer_name")!;

    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    const pageSize = pageSizeParam ? Math.max(1, parseInt(pageSizeParam, 10) || 50) : 50;

    const result = await getCustomerPaymentsPaginated({
      ...(filters as any),
      page,
      pageSize,
    });

    return NextResponse.json({
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Fetch customer payments error:", err);
    return NextResponse.json(
      { error: "Failed to fetch customer payments", detail: getErrorDetail(err) },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/customer-payments
//   Record a new customer payment (incoming money without a sale).
//
// Body: { customer_id, amount, payment_date?, notes?, }
//
// The record_customer_payment() RPC atomically:
//   1. Computes balance_due (opening + bill - cash - goods - advance)
//   2. credit_offset = min(amount, max(0, balance_due))
//      → lowers customer.opening_balance
//   3. remainder = amount - credit_offset → adds to advance_payment
//   4. Inserts customer_payments row with full before/after snapshot
// ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { customer_id, amount, payment_date, notes } = body;

    if (!customer_id) {
      return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const id = await recordCustomerPayment({
      customer_id: Number(customer_id),
      amount: amt,
      payment_date: payment_date || pktToday(),
      notes: notes?.trim() || null,
      entered_by: `admin:${auth.user.id}`,
    });

    // Customer payments affect: customer balances, customers list (advance_payment),
    // dashboard, reconciliation, cash (we don't ledger these as cash yet — they're
    // customer-owed money, not cash in hand until consumed during a sale).
    invalidateByTag(
      userTag(auth.user.id, "customers"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "customer-payments"),
      userTag(auth.user.id, "dashboard"),
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Create customer payment error:", err);
    return NextResponse.json(
      { error: "Failed to create customer payment", detail: getErrorDetail(err) },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/customer-payments?id=<payment_id>
//   Delete a customer payment. The delete_customer_payment() RPC
//   atomically reverses the effect on customer.opening_balance and
//   customer.advance_payment, then deletes the row.
// ──────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await deleteCustomerPayment(id);

    invalidateByTag(
      userTag(auth.user.id, "customers"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "customer-payments"),
      userTag(auth.user.id, "dashboard"),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete customer payment error:", err);
    return NextResponse.json(
      { error: "Failed to delete customer payment", detail: getErrorDetail(err) },
      { status: 500 },
    );
  }
}
