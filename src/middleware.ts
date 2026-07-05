import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const isPlaceholder = (url: string | undefined) =>
  !url || url.includes("placeholder");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Customer routes — no Supabase auth needed ───
  if (pathname.startsWith("/customer")) {
    return NextResponse.next();
  }

  // ─── Public / landing routes ───
  if (pathname === "/" || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  // If Supabase not configured, skip admin auth (dev/preview mode)
  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseKey)) {
    return NextResponse.next();
  }

  // ─── Admin routes — require Supabase auth ───
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

  // Admin login page — if already authenticated, redirect to /admin
  if (user && pathname === "/admin/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  // Admin pages (except /admin/login) — if NOT authenticated, redirect to /admin/login
  if (!user && pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};