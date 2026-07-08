import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { admin } from "@/lib/supabase/server-admin";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

const CREDIT_LIMIT = 3_000_000;

/**
 * Resolve customer_name (case-insensitive substring) → list of customer IDs.
 * Returns null when no search term was provided.
 * Returns [] when a search term was given but matched no customer.
 */
async function resolveCustomerIds(name: string | null): Promise<number[] | null> {
  if (!name || !name.trim()) return null;
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .ilike("name", `%${name.trim()}%`);
  if (error) throw error;
  return (data || []).map((c: any) => c.id as number);
}

/**
 * Helper — apply pagination to an already-fetched array (in-memory slicing).
 * Used for "computed" cards (outstanding, over-credit) where the rows are
 * aggregated client-side of the DB.
 */
function paginate<T>(rows: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize;
  const slice = rows.slice(from, to);
  const total = rows.length;
  return {
    rows: slice,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const type = request.nextUrl.searchParams.get("type");
  const today = request.nextUrl.searchParams.get("date") || pktToday();

  // ── Pagination / search params (all optional, backward-compatible) ──
  // If `page` or `pageSize` is present, response shape becomes:
  //   { rows, total, page, pageSize, totalPages, label }
  // Otherwise, original shape is preserved:
  //   { rows, label }
  const pageParam = request.nextUrl.searchParams.get("page");
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const wantsPagination = pageParam !== null || pageSizeParam !== null;
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const pageSize = pageSizeParam ? Math.max(1, parseInt(pageSizeParam, 10) || 50) : 50;

  // Customer-name search (case-insensitive substring). Used by all customer-bearing cards.
  const customerName = request.nextUrl.searchParams.get("customer_name");
  // Description search (case-insensitive substring). Used by expenses card.
  const descriptionSearch = request.nextUrl.searchParams.get("description");

  try {
    switch (type) {
      case "sales-today": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(id,name), products(id,name)", { count: "exact" })
          .eq("sale_date", today)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          // search term given but no matching customer → empty result
          return NextResponse.json({
            rows: [], total: 0, page, pageSize, totalPages: 1, label: "Sales Today",
          });
        }
        if (custIds) q = q.in("customer_id", custIds);

        if (wantsPagination) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await q.range(from, to);
          if (error) throw error;
          const rows = (data || []).map((s: any) => ({
            id: s.id,
            date: s.sale_date,
            customer: s.customers?.name || "N/A",
            product: s.products?.name || "N/A",
            qty: s.quantity,
            rate: s.rate_per_bag,
            fare: s.rickshaw_fare,
            cash: s.cash_received,
            unit: s.unit_type || "bags",
            amount: s.quantity * s.rate_per_bag + s.rickshaw_fare,
          }));
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Sales Today",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map((s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          qty: s.quantity,
          rate: s.rate_per_bag,
          fare: s.rickshaw_fare,
          cash: s.cash_received,
          unit: s.unit_type || "bags",
          amount: s.quantity * s.rate_per_bag + s.rickshaw_fare,
        }));
        return NextResponse.json({ rows, label: "Sales Today" });
      }

      case "billed-today": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(id,name), products(id,name)", { count: "exact" })
          .eq("sale_date", today)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({
            rows: [], total: 0, page, pageSize, totalPages: 1, label: "Billed Today",
          });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => ({
          id: s.id,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          qty: s.quantity,
          unit: s.unit_type || "bags",
          rate: s.rate_per_bag,
          fare: s.rickshaw_fare,
          bill: s.quantity * s.rate_per_bag + s.rickshaw_fare,
          cash_paid: s.cash_received,
          balance: s.quantity * s.rate_per_bag + s.rickshaw_fare - s.cash_received,
        });

        if (wantsPagination) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await q.range(from, to);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Billed Today",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Billed Today" });
      }

      case "cash-collected": {
        let q = admin
          .from("sales")
          .select("id, sale_date, cash_received, customers(id,name), products(id,name)", { count: "exact" })
          .eq("sale_date", today)
          .gt("cash_received", 0)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({
            rows: [], total: 0, page, pageSize, totalPages: 1, label: "Cash Collected Today",
          });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => ({
          id: s.id,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          cash: s.cash_received,
          date: s.sale_date,
        });

        if (wantsPagination) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await q.range(from, to);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Cash Collected Today",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Cash Collected Today" });
      }

      case "expenses-today": {
        let q = admin
          .from("expenses")
          .select("id, expense_date, description, amount, created_at", { count: "exact" })
          .eq("expense_date", today)
          .order("created_at", { ascending: false });

        if (descriptionSearch && descriptionSearch.trim()) {
          q = q.ilike("description", `%${descriptionSearch.trim()}%`);
        }

        const mapper = (e: any) => ({
          id: e.id,
          date: e.expense_date,
          description: e.description || "N/A",
          amount: e.amount,
        });

        if (wantsPagination) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await q.range(from, to);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Expenses Today",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Expenses Today" });
      }

      case "customers": {
        let q = admin
          .from("customers")
          .select("*", { count: "exact" })
          .order("name", { ascending: true });

        if (customerName && customerName.trim()) {
          q = q.ilike("name", `%${customerName.trim()}%`);
        }

        const mapper = (c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          phone: c.phone || "N/A",
          active: c.is_active,
          credit_limit: c.credit_limit ?? null,
          since: c.created_at?.split("T")[0],
        });

        if (wantsPagination) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          const { data, error, count } = await q.range(from, to);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "All Customers",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "All Customers" });
      }

      case "outstanding": {
        // Aggregated card — fetch all matching sales, compute balances, then paginate in-memory.
        let q = admin
          .from("sales")
          .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,phone,type)");

        const custIds = await resolveCustomerIds(customerName);
        if (custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "Outstanding / Khata" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const { data: sales, error } = await q;
        if (error) throw error;
        if (!sales) return NextResponse.json({ rows: [], label: "Outstanding / Khata" });

        const balances: Record<number, { name: string; phone: string; type: string; total_bill: number; paid: number }> = {};
        for (const s of sales) {
          const cid = s.customer_id as number;
          const bill = (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
          if (!balances[cid]) balances[cid] = { name: (s.customers as any)?.name || "N/A", phone: (s.customers as any)?.phone || "N/A", type: (s.customers as any)?.type || "N/A", total_bill: 0, paid: 0 };
          balances[cid].total_bill += bill;
          balances[cid].paid += (s.cash_received as number);
        }

        const allRows = Object.entries(balances)
          .map(([cid, b]) => ({ id: Number(cid), customer: b.name, phone: b.phone, type: b.type, total_bill: b.total_bill, paid: b.paid, balance: b.total_bill - b.paid }))
          .filter((r) => r.balance > 0)
          .sort((a, b) => b.balance - a.balance);

        if (wantsPagination) {
          const p = paginate(allRows, page, pageSize);
          return NextResponse.json({ ...p, label: "Total Outstanding / Khata" });
        }
        return NextResponse.json({ rows: allRows, label: "Total Outstanding / Khata" });
      }

      case "over-credit": {
        let q = admin
          .from("sales")
          .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,phone)");

        const custIds = await resolveCustomerIds(customerName);
        if (custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "Over Credit Limit" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const { data: sales, error } = await q;
        if (error) throw error;
        if (!sales) return NextResponse.json({ rows: [], label: "Over Credit Limit" });

        const balances: Record<number, { name: string; phone: string; credit_limit: number; total_bill: number; paid: number }> = {};
        for (const s of sales) {
          const cid = s.customer_id as number;
          const bill = (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
          if (!balances[cid]) balances[cid] = { name: (s.customers as any)?.name || "N/A", phone: (s.customers as any)?.phone || "N/A", credit_limit: (s.customers as any)?.credit_limit || CREDIT_LIMIT, total_bill: 0, paid: 0 };
          balances[cid].total_bill += bill;
          balances[cid].paid += (s.cash_received as number);
        }

        const allRows = Object.entries(balances)
          .map(([cid, b]) => ({ id: Number(cid), customer: b.name, phone: b.phone, credit_limit: b.credit_limit, total_bill: b.total_bill, paid: b.paid, balance: b.total_bill - b.paid }))
          .filter((r) => r.balance > r.credit_limit)
          .sort((a, b) => b.balance - a.balance);

        if (wantsPagination) {
          const p = paginate(allRows, page, pageSize);
          return NextResponse.json({ ...p, label: "Over Credit Limit" });
        }
        return NextResponse.json({ rows: allRows, label: "Over Credit Limit" });
      }

      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (err) {
    console.error("Dashboard details error:", err);
    return NextResponse.json({ error: "Failed to fetch details", detail: getErrorDetail(err) }, { status: 500 });
  }
}
