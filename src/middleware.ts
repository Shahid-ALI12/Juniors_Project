import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "@/lib/auth/cookie-sign";

const isPlaceholder = (url: string | undefined) =>
  !url || url.includes("placeholder");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF protection: for state-changing API requests, the Origin (or Referer)
 * header must match the request's own host. Browsers always send Origin on
 * cross-site POST/PUT/PATCH/DELETE, so a mismatch means a cross-site request.
 */
function isCsrfSafe(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return true;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (!host) return false;

  const source = origin ?? referer;
  // Same-origin requests from non-browser clients (curl, server-to-server)
  // may omit both headers — allow those (they can't carry browser cookies cross-site).
  if (!source) return true;

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Static assets — skip ───
  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // ─── API routes — CSRF check on mutating requests, then skip ───
  if (pathname.startsWith("/api")) {
    if (!isCsrfSafe(request)) {
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // ─── Root — always redirect to admin login ───
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
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

    // Server-side subscription check
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
    // Admin login page
    if (pathname === "/admin/login") {
      // If Supabase not configured, allow (dev mode — no auth available)
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

    // All other /admin/* routes — MUST be authenticated
    if (!supabaseConfigured) {
      // Dev mode with no Supabase — redirect to login (shows login page, can't auth)
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
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