import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getCashBalances } from "@/lib/data/cash";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const balances = await getCashBalances();
    return NextResponse.json({ balances });
  } catch (err) {
    console.error("Fetch cash balances error:", err);
    return NextResponse.json({ error: "Failed to fetch cash balances" }, { status: 500 });
  }
}
