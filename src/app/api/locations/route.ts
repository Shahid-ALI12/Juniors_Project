import { requireAdminUser } from "@/lib/auth/server-user";
import { NextResponse } from "next/server";

import { getAllLocations } from "@/lib/data/locations";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;

  try {
    const locations = await getAllLocations();
    return NextResponse.json({ locations });
  } catch (err) {
    console.error("Fetch locations error:", err);
    return NextResponse.json({ error: "Failed to fetch locations", detail: getErrorDetail(err) }, { status: 500 });
  }
}
