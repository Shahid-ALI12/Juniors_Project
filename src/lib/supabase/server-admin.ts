import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only service-role client — bypasses RLS.
// NEVER import this in client components or anything that ships to browser.

let _admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  _admin = createClient(supabaseUrl, supabaseServiceKey);
  return _admin;
}

// Use a Proxy so that `admin.from(...)` lazily initializes the client
export const admin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getAdmin();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});