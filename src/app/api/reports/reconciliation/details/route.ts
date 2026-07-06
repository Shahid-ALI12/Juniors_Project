import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { admin } from "@/lib/supabase/server-admin";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const type = request.nextUrl.searchParams.get("type") || "";
  const from = request.nextUrl.searchParams.get("from") || pktToday();
  const to = request.nextUrl.searchParams.get("to") || from;

  try {
    switch (type) {
      case "bags-sold": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, unit_type, rate_per_bag, customers(id,name), products(id,name), locations(id,name)")
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          location: s.locations?.name || "N/A",
          qty: s.quantity,
          unit: s.unit_type || "bags",
          rate: s.rate_per_bag,
        }));
        return NextResponse.json({ rows, label: "Total Bags Sold" });
      }

      case "total-billed": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(id,name), products(id,name)")
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((s: any) => {
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
        });
        return NextResponse.json({ rows, label: "Total Billed" });
      }

      case "cash-received": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name), products(id,name)")
          .gte("sale_date", from).lte("sale_date", to)
          .gt("cash_received", 0)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((s: any) => ({
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "N/A",
          product: s.products?.name || "N/A",
          bill: s.quantity * s.rate_per_bag + (s.rickshaw_fare || 0),
          cash: s.cash_received,
        }));
        return NextResponse.json({ rows, label: "Cash Actually Received" });
      }

      case "credit-customers": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,type), products(id,name)")
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || [])
          .filter((s: any) => s.customers?.type === "credit")
          .map((s: any) => {
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
          });
        return NextResponse.json({ rows, label: "From Credit Customers" });
      }

      case "cash-customers": {
        const { data, error } = await admin
          .from("sales")
          .select("id, sale_date, quantity, rate_per_bag, rickshaw_fare, cash_received, customers(id,name,type), products(id,name)")
          .gte("sale_date", from).lte("sale_date", to)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || [])
          .filter((s: any) => s.customers?.type === "cash")
          .map((s: any) => ({
            id: s.id,
            date: s.sale_date,
            customer: s.customers?.name || "N/A",
            product: s.products?.name || "N/A",
            bill: s.quantity * s.rate_per_bag + (s.rickshaw_fare || 0),
            cash_paid: s.cash_received || 0,
          }));
        return NextResponse.json({ rows, label: "From Cash Customers" });
      }

      case "expenses": {
        const { data, error } = await admin
          .from("expenses")
          .select("id, expense_date, description, amount, created_at")
          .gte("expense_date", from).lte("expense_date", to)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((e: any) => ({
          id: e.id,
          date: e.expense_date,
          description: e.description || "N/A",
          amount: e.amount,
        }));
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