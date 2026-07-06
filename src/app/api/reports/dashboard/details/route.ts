import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { admin } from "@/lib/supabase/server-admin";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

const CREDIT_LIMIT = 3_000_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const type = request.nextUrl.searchParams.get("type");
  const today = request.nextUrl.searchParams.get("date") || pktToday();

  try {
    switch (type) {
      case "sales-today": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(id,name), products(id,name), locations(id,name)")
          .eq("sale_date", today)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          location: s.locations?.name || "N/A",
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
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(id,name), products(id,name)")
          .eq("sale_date", today)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((s: any) => ({
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
        }));
        return NextResponse.json({ rows, label: "Billed Today" });
      }

      case "cash-collected": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, cash_received, customers(id,name), products(id,name)")
          .eq("sale_date", today)
          .gt("cash_received", 0)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((s: any) => ({
          id: s.id,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          cash: s.cash_received,
          date: s.sale_date,
        }));
        return NextResponse.json({ rows, label: "Cash Collected Today" });
      }

      case "expenses-today": {
        const { data, error } = await admin
          .from("expenses")
          .select("id, expense_date, description, amount, expense_category, created_at")
          .eq("expense_date", today)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((e: any) => ({
          id: e.id,
          date: e.expense_date,
          description: e.description || "N/A",
          category: e.expense_category || "N/A",
          amount: e.amount,
        }));
        return NextResponse.json({ rows, label: "Expenses Today" });
      }

      case "customers": {
        const { data, error } = await admin
          .from("customers")
          .select("*")
          .order("name", { ascending: true });
        if (error) throw error;
        const rows = (data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          phone: c.phone || "N/A",
          active: c.is_active,
          credit_limit: c.credit_limit ?? null,
          since: c.created_at?.split("T")[0],
        }));
        return NextResponse.json({ rows, label: "All Customers" });
      }

      case "outstanding": {
        const { data: sales } = await admin
          .from("sales")
          .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,phone,type)");
        if (!sales) return NextResponse.json({ rows: [], label: "Outstanding / Khata" });

        const balances: Record<number, { name: string; phone: string; type: string; total_bill: number; paid: number }> = {};
        for (const s of sales) {
          const cid = s.customer_id as number;
          const bill = (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
          if (!balances[cid]) balances[cid] = { name: (s.customers as any)?.name || "N/A", phone: (s.customers as any)?.phone || "N/A", type: (s.customers as any)?.type || "N/A", total_bill: 0, paid: 0 };
          balances[cid].total_bill += bill;
          balances[cid].paid += (s.cash_received as number);
        }

        const rows = Object.entries(balances)
          .map(([cid, b]) => ({ id: Number(cid), customer: b.name, phone: b.phone, type: b.type, total_bill: b.total_bill, paid: b.paid, balance: b.total_bill - b.paid }))
          .filter((r) => r.balance > 0)
          .sort((a, b) => b.balance - a.balance);
        return NextResponse.json({ rows, label: "Total Outstanding / Khata" });
      }

      case "over-credit": {
        const { data: sales } = await admin
          .from("sales")
          .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,phone)");
        if (!sales) return NextResponse.json({ rows: [], label: "Over Credit Limit" });

        const balances: Record<number, { name: string; phone: string; credit_limit: number; total_bill: number; paid: number }> = {};
        for (const s of sales) {
          const cid = s.customer_id as number;
          const bill = (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
          if (!balances[cid]) balances[cid] = { name: (s.customers as any)?.name || "N/A", phone: (s.customers as any)?.phone || "N/A", credit_limit: (s.customers as any)?.credit_limit || CREDIT_LIMIT, total_bill: 0, paid: 0 };
          balances[cid].total_bill += bill;
          balances[cid].paid += (s.cash_received as number);
        }

        const rows = Object.entries(balances)
          .map(([cid, b]) => ({ id: Number(cid), customer: b.name, phone: b.phone, credit_limit: b.credit_limit, total_bill: b.total_bill, paid: b.paid, balance: b.total_bill - b.paid }))
          .filter((r) => r.balance > r.credit_limit)
          .sort((a, b) => b.balance - a.balance);
        return NextResponse.json({ rows, label: "Over Credit Limit" });
      }

      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (err) {
    console.error("Dashboard details error:", err);
    return NextResponse.json({ error: "Failed to fetch details", detail: getErrorDetail(err) }, { status: 500 });
  }
}