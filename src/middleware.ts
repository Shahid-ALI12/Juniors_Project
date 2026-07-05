import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "@/lib/auth/cookie-sign";

const isPlaceholder = (url: string | undefined) =>
  !url || url.includes("placeholder");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Static assets / API — skip ───
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ─── Root — redirect to admin login ───
  if (pathname === "/") {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const supabaseConfigured = !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseKey);

  // ═══════════════════════════════════════════════════
  // CUSTOMER ROUTES — /customer/login, /customer
  // ═══════════════════════════════════════════════════
  if (pathname.startsWith("/customer")) {
    // Customer login page — always allow
    if (pathname === "/customer/login") {
      return NextResponse.next();
    }

    // All other /customer/* routes require customer auth cookie
    const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      return NextResponse.redirect(url);
    }

    // Verify token signature + check subscription
    const payload = await verifyCustomerToken(token);
    if (!payload) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      url.searchParams.set("reason", "invalid_session");
      return NextResponse.redirect(url);
    }

    // Server-side subscription check (Fix #3)
    if (!payload.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      url.searchParams.set("reason", "blocked");
      return NextResponse.redirect(url);
    }

    if (new Date(payload.subscription_end) <= new Date()) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      url.searchParams.set("reason", "expired");
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // ═══════════════════════════════════════════════════
  // ADMIN ROUTES — /admin/login, /admin
  // ═══════════════════════════════════════════════════
  if (pathname.startsWith("/admin")) {
    // Admin login page — always allow
    if (pathname === "/admin/login") {
      // If Supabase not configured, skip redirect
      if (!supabaseConfigured) {
        return NextResponse.next();
      }
      // If already authenticated, redirect to /admin
      let supabaseResponse = NextResponse.next({ request });
      const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // All other /admin/* routes require admin auth
    if (!supabaseConfigured) {
      // Dev mode — allow without protection
      console.warn("⚠️ Admin routes are UNPROTECTED — Supabase not configured");
      return NextResponse.next();
    }

    let supabaseResponse = NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};