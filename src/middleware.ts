import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const isPlaceholder = (url: string | undefined) =>
  !url || url.includes("placeholder");

// Routes that don't need admin auth
const publicRoutes = ["/customer-login", "/customer"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Customer routes - no admin auth needed
  if (pathname.startsWith("/customer")) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  // If Supabase not configured, skip admin auth (dev/preview)
  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseKey)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect admin routes
  if (!user && !pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};