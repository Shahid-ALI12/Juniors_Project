import { createClient } from "@supabase/supabase-js";

// Server-only service-role client — bypasses RLS.
// NEVER import this in client components or anything that ships to browser.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
}
if (!supabaseServiceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

export const admin = createClient(supabaseUrl, supabaseServiceKey);
