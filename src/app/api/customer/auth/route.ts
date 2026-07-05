import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signCustomerToken, CUSTOMER_COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth/cookie-sign";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const supabase = createClient();
    const { data: customers, error } = await supabase
      .from("app_customers")
      .select("*")
      .eq("email", email.trim())
      .eq("password", password)
      .eq("is_active", true);

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
    }

    if (!customers || customers.length === 0) {
      // Check if user exists but blocked/expired
      const { data: allCustomers } = await supabase
        .from("app_customers")
        .select("id, name, email, is_active, subscription_end")
        .eq("email", email.trim());

      if (!allCustomers || allCustomers.length === 0) {
        return NextResponse.json({ error: "EMAIL_NOT_FOUND" }, { status: 401 });
      }

      const found = allCustomers[0];
      if (!found.is_active) {
        return NextResponse.json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
      }
      if (new Date(found.subscription_end) <= new Date()) {
        return NextResponse.json({ error: "SUBSCRIPTION_EXPIRED" }, { status: 403 });
      }

      return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });
    }

    const customer = customers[0];

    // Check subscription
    if (new Date(customer.subscription_end) <= new Date()) {
      return NextResponse.json({ error: "SUBSCRIPTION_EXPIRED" }, { status: 403 });
    }

    // Create signed token
    const token = await signCustomerToken({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      subscription_end: customer.subscription_end,
      is_active: customer.is_active,
    });

    const response = NextResponse.json({
      success: true,
      customer: { name: customer.name, email: customer.email },
    });

    // Set httpOnly cookie
    response.cookies.set(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Customer login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Logout — clear cookie
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(CUSTOMER_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}