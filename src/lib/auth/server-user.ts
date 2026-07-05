import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "./cookie-sign";

// ─── Admin check: requires valid Supabase Auth session ───
export async function requireAdmin(): Promise<
  { ok: true; user: { id: string; email: string } } | { ok: false; response: NextResponse }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("placeholder")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }),
    };
  }

  const cookieStore = await cookies();
  let res = NextResponse.next({ req: { cookies: cookieStore } } as any);
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => cookieStore.set(name, value));
        res = NextResponse.next({ req: { cookies: cookieStore } } as any);
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  return { ok: true, user: { id: user.id, email: user.email ?? "" } };
}

// ─── General auth: admin session OR valid active customer cookie ───
export async function requireUser(): Promise<
  | { ok: true; type: "admin"; user: { id: string; email: string } }
  | { ok: true; type: "customer"; user: { id: string; name: string; email: string } }
  | { ok: false; response: NextResponse }
> {
  // Try admin first
  const admin = await requireAdmin();
  if (admin.ok) {
    return { ok: true, type: "admin", user: admin.user };
  }

  // Try customer cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyCustomerToken(token);
    if (payload && payload.is_active && new Date(payload.subscription_end) > new Date()) {
      return {
        ok: true,
        type: "customer",
        user: { id: payload.id, name: payload.name, email: payload.email },
      };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
  };
}
