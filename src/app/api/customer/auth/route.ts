import { NextRequest, NextResponse } from "next/server";
import { verifyCustomerLogin, getCustomerByEmail } from "@/lib/customer-db";
import { signCustomerToken, CUSTOMER_COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth/cookie-sign";
import { checkLoginRateLimit, rateLimitResponseInit } from "@/lib/rate-limit";

const IS_PROD = process.env.NODE_ENV === "production";

export async function POST(request: NextRequest) {
  try {
    // Brute-force protection: 5 attempts per minute per IP
    const rl = await checkLoginRateLimit(request);
    if (!rl.success) {
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        rateLimitResponseInit(rl)
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    let customer: Awaited<ReturnType<typeof verifyCustomerLogin>> = null;

    try {
      customer = await verifyCustomerLogin(email.trim(), password);
    } catch (err) {
      if (err instanceof Error && err.message === "TABLE_NOT_FOUND") {
        return NextResponse.json({ error: "TABLE_NOT_FOUND" }, { status: 503 });
      }
      throw err;
    }

    if (!customer) {
      // Security: use a generic error to avoid revealing whether email exists.
      // In production, always return the same message regardless of reason.
      if (IS_PROD) {
        return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
      }
      // Development only: detailed error for debugging
      const exists = await getCustomerByEmail(email.trim());
      if (!exists) {
        return NextResponse.json({ error: "EMAIL_NOT_FOUND" }, { status: 401 });
      }
      if (!exists.is_active) {
        return NextResponse.json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
      }
      return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });
    }

    if (new Date(customer.subscription_end) <= new Date()) {
      if (IS_PROD) {
        return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
      }
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
