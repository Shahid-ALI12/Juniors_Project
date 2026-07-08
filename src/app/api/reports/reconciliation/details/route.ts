import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { admin } from "@/lib/supabase/server-admin";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const type = request.nextUrl.searchParams.get("type") || "";
  const from = request.nextUrl.searchParams.get("from") || pktToday();
  const to = request.nextUrl.searchParams.get("to") || from;

  // ── Pagination / search params (all optional, backward-compatible) ──
  const pageParam = request.nextUrl.searchParams.get("page");
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const wantsPagination = pageParam !== null || pageSizeParam !== null;
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const pageSize = pageSizeParam ? Math.max(1, parseInt(pageSizeParam, 10) || 50) : 50;

  const customerName = request.nextUrl.searchParams.get("customer_name");
  const descriptionSearch = request.nextUrl.searchParams.get("description");

  try {
    switch (type) {
      case "bags-sold": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, unit_type, rate_per_bag, customers(id,name), products(id,name)", { count: "exact" })
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "Total Bags Sold" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          qty: s.quantity,
          unit: s.unit_type || "bags",
          rate: s.rate_per_bag,
        });

        if (wantsPagination) {
          const f = (page - 1) * pageSize;
          const t = f + pageSize - 1;
          const { data, error, count } = await q.range(f, t);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Total Bags Sold",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Total Bags Sold" });
      }

      case "total-billed": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(id,name), products(id,name)", { count: "exact" })
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "Total Billed" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => {
          const bill = s.quantity * s.rate_per_bag + (s.rickshaw_fare || 0);
          return {
            id: s.id,
            date: s.sale_date,
            customer: s.customers?.name || "N/A",
            product: s.products?.name || "N/A",
            qty: s.quantity,
            unit: s.unit_type || "bags",
            bill,
            cash_paid: s.cash_received || 0,
            balance: bill - (s.cash_received || 0),
          };
        };

        if (wantsPagination) {
          const f = (page - 1) * pageSize;
          const t = f + pageSize - 1;
          const { data, error, count } = await q.range(f, t);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Total Billed",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Total Billed" });
      }

      case "cash-received": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name), products(id,name)", { count: "exact" })
          .gte("sale_date", from).lte("sale_date", to)
          .gt("cash_received", 0)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "Cash Actually Received" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          bill: s.quantity * s.rate_per_bag + (s.rickshaw_fare || 0),
          cash: s.cash_received,
        });

        if (wantsPagination) {
          const f = (page - 1) * pageSize;
          const t = f + pageSize - 1;
          const { data, error, count } = await q.range(f, t);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Cash Actually Received",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Cash Actually Received" });
      }

      case "credit-customers": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,type), products(id,name)", { count: "exact" })
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "From Credit Customers" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => {
          const bill = s.quantity * s.rate_per_bag + (s.rickshaw_fare || 0);
          return {
            id: s.id,
            date: s.sale_date,
            customer: s.customers?.name || "N/A",
            product: s.products?.name || "N/A",
            bill,
            cash_paid: s.cash_received || 0,
            balance: bill - (s.cash_received || 0),
          };
        };

        if (wantsPagination) {
          // Need to fetch all rows then filter by customer type in-memory,
          // because the customer type filter is on a joined column.
          // For typical date-range requests this is bounded and acceptable.
          const { data, error } = await q;
          if (error) throw error;
          const filtered = (data || [])
            .filter((s: any) => s.customers?.type === "credit")
            .map(mapper);
          const total = filtered.length;
          const f = (page - 1) * pageSize;
          const rows = filtered.slice(f, f + pageSize);
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "From Credit Customers",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || [])
          .filter((s: any) => s.customers?.type === "credit")
          .map(mapper);
        return NextResponse.json({ rows, label: "From Credit Customers" });
      }

      case "cash-customers": {
        let q = admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,type), products(id,name)", { count: "exact" })
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });

        const custIds = await resolveCustomerIds(customerName);
        if (customerName && customerName.trim() && custIds && custIds.length === 0) {
          return NextResponse.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: "From Cash Customers" });
        }
        if (custIds) q = q.in("customer_id", custIds);

        const mapper = (s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          bill: s.quantity * s.rate_per_bag + (s.rickshaw_fare || 0),
          cash_paid: s.cash_received || 0,
        });

        if (wantsPagination) {
          const { data, error } = await q;
          if (error) throw error;
          const filtered = (data || [])
            .filter((s: any) => s.customers?.type === "cash")
            .map(mapper);
          const total = filtered.length;
          const f = (page - 1) * pageSize;
          const rows = filtered.slice(f, f + pageSize);
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "From Cash Customers",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || [])
          .filter((s: any) => s.customers?.type === "cash")
          .map(mapper);
        return NextResponse.json({ rows, label: "From Cash Customers" });
      }

      case "expenses": {
        let q = admin
          .from("expenses")
          .select("id, expense_date, description, amount, created_at", { count: "exact" })
          .gte("expense_date", from).lte("expense_date", to)
          .order("created_at", { ascending: false });

        if (descriptionSearch && descriptionSearch.trim()) {
          q = q.ilike("description", `%${descriptionSearch.trim()}%`);
        }

        const mapper = (e: any) => ({
          id: e.id,
          date: e.expense_date,
          description: e.description || "N/A",
          category: "—",
          amount: e.amount,
        });

        if (wantsPagination) {
          const f = (page - 1) * pageSize;
          const t = f + pageSize - 1;
          const { data, error, count } = await q.range(f, t);
          if (error) throw error;
          const rows = (data || []).map(mapper);
          const total = count ?? 0;
          return NextResponse.json({
            rows, total, page, pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            label: "Total Expenses",
          });
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map(mapper);
        return NextResponse.json({ rows, label: "Total Expenses" });
      }

      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (err) {
    console.error("Reconciliation details error:", err);
    return NextResponse.json({ error: "Failed to fetch details", detail: getErrorDetail(err) }, { status: 500 });
  }
}
