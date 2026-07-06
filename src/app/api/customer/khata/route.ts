import { NextRequest, NextResponse } from "next/server";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "@/lib/auth/cookie-sign";
import { admin } from "@/lib/supabase/server-admin";

/**
 * Customer-scoped khata endpoint.
 * Only returns data for the authenticated portal customer's linked business customer.
 * Admin users are blocked from this endpoint.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyCustomerToken(token);
  if (!payload || !payload.is_active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Get the portal customer's linked business customer ID
    const { data: appCus, error: appErr } = await admin
      .from("app_customers")
      .select("id, name, email, linked_customer_id, subscription_end, subscription_type, is_active")
      .eq("id", payload.id)
      .single();

    if (appErr || !appCus) {
      return NextResponse.json({ error: "Customer not found" }, { status: 401 });
    }

    // linked_customer_id is the business customers.id this portal user can see
    const linkedCustomerId = (appCus as any).linked_customer_id;

    if (!linkedCustomerId) {
      // No linked customer — return empty data, not an error
      return NextResponse.json({
        customer: {
          id: appCus.id,
          name: appCus.name,
          email: appCus.email,
          subscription_type: appCus.subscription_type,
          subscription_start: (appCus as any).subscription_start,
          subscription_end: appCus.subscription_end,
          is_active: appCus.is_active,
        },
        linked_customer_id: null,
        sales: [],
        balance: { total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 },
      });
    }

    // Fetch only THIS customer's sales (non-voided)
    const { data: salesData, error: salesErr } = await admin
      .from("sales")
      .select("*, customers(id,name,type), products(id,name), locations(id,name)")
      .eq("customer_id", linkedCustomerId)
      .is("voided_at", null)
      .order("sale_date", { ascending: false });

    if (salesErr) throw salesErr;

    // Calculate balance
    const sales = salesData || [];
    let totalBill = 0;
    let totalCashPaid = 0;
    for (const s of sales) {
      const row = s as any;
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate_per_bag) || 0;
      const fare = Number(row.rickshaw_fare) || 0;
      totalBill += qty * rate + fare;
      totalCashPaid += Number(row.cash_received) || 0;
    }
    const balanceDue = totalBill - totalCashPaid;

    return NextResponse.json({
      customer: {
        id: appCus.id,
        name: appCus.name,
        email: appCus.email,
        subscription_type: appCus.subscription_type,
        subscription_start: (appCus as any).subscription_start,
        subscription_end: appCus.subscription_end,
        is_active: appCus.is_active,
      },
      linked_customer_id: linkedCustomerId,
      sales,
      balance: {
        total_bill: totalBill,
        total_cash_paid: totalCashPaid,
        total_goods_value: 0,
        balance_due: balanceDue,
      },
    });
  } catch (err) {
    console.error("Customer khata error:", err);
    return NextResponse.json({ error: "Failed to load khata data" }, { status: 500 });
  }
}