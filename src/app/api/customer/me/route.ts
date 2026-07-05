import { NextRequest, NextResponse } from "next/server";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "@/lib/auth/cookie-sign";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyCustomerToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // Re-verify from Supabase (subscription might have been changed by admin)
  try {
    const supabase = createClient();
    const { data: customer, error } = await supabase
      .from("app_customers")
      .select("id, name, email, subscription_type, subscription_start, subscription_end, is_active")
      .eq("id", payload.id)
      .single();

    if (error || !customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 401 });
    }

    // Check if admin blocked or subscription expired
    if (!customer.is_active) {
      return NextResponse.json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
    }
    if (new Date(customer.subscription_end) <= new Date()) {
      return NextResponse.json({ error: "SUBSCRIPTION_EXPIRED" }, { status: 403 });
    }

    return NextResponse.json({ customer });
  } catch {
    // If Supabase is not available, return cookie data (dev mode)
    return NextResponse.json({ customer: payload });
  }
}