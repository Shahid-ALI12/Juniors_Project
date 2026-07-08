import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getExpenses, recordExpenseRPC, deleteExpense } from "@/lib/data/expenses";
import { pktToday } from "@/lib/pkt-date";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Expenses change frequently — short TTL
const EXPENSES_TTL = 5_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const filters: Record<string, string> = {};
    if (url.searchParams.get("expense_date")) filters.expense_date = url.searchParams.get("expense_date")!;
    if (url.searchParams.get("expense_date_gte")) filters.expense_date_gte = url.searchParams.get("expense_date_gte")!;
    if (url.searchParams.get("expense_date_lte")) filters.expense_date_lte = url.searchParams.get("expense_date_lte")!;

    const filterSuffix = new URLSearchParams(filters).toString();
    const expenses = await cachedGet(
      userKey(auth.user.id, "expenses", filterSuffix),
      [userTag(auth.user.id, "expenses")],
      EXPENSES_TTL,
      () => getExpenses(filters as any),
    );
    return NextResponse.json({ expenses });
  } catch (err) {
    console.error("Fetch expenses error:", err);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

// POST — atomic expense via RPC (also posts cash_ledger 'out')
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { description, amount, expense_date } = body;

    if (!description?.trim() || !amount) {
      return NextResponse.json({ error: "description and amount are required" }, { status: 400 });
    }

    const id = await recordExpenseRPC({
      description: description.trim(),
      amount: Number(amount),
      expense_date: expense_date || pktToday(),
      entered_by: `admin:${auth.user.id}`,
    });

    // Expense affects: expenses list, dashboard, reconciliation, cash (ledger)
    invalidateByTag(
      userTag(auth.user.id, "expenses"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Create expense error:", err);
    const { getErrorDetail } = await import("@/lib/api-error");
    return NextResponse.json({ error: "Failed to create expense", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await deleteExpense(id);

    invalidateByTag(
      userTag(auth.user.id, "expenses"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete expense error:", err);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
