import { NextRequest, NextResponse } from "next/server";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "@/lib/auth/cookie-sign";
import { getCustomerById } from "@/lib/customer-db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyCustomerToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  try {
    const customer = await getCustomerById(payload.id);

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 401 });
    }

    if (!customer.is_active) {
      return NextResponse.json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
    }
    if (new Date(customer.subscription_end) <= new Date()) {
      return NextResponse.json({ error: "SUBSCRIPTION_EXPIRED" }, { status: 403 });
    }

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        subscription_type: customer.subscription_type,
        subscription_start: customer.subscription_start,
        subscription_end: customer.subscription_end,
        is_active: customer.is_active,
      },
    });
  } catch (err) {
    console.error("Customer me error:", err);
    return NextResponse.json({ customer: payload });
  }
}