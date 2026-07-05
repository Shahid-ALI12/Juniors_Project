import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getAllLocations } from "@/lib/data/locations";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const locations = await getAllLocations();
    return NextResponse.json({ locations });
  } catch (err) {
    console.error("Fetch locations error:", err);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
