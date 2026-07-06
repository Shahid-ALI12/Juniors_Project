import { requireAdminUser, requireAdmin } from "@/lib/auth/server-user";
import { NextRequest, NextResponse } from "next/server";

import { getCashAccounts, createCashAccount } from "@/lib/data/cash";
import { getErrorDetail } from "@/lib/api-error";

export async function GET() {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;

  try {
    const accounts = await getCashAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("Fetch cash accounts error:", err);
    return NextResponse.json({ error: "Failed to fetch cash accounts", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const account = await createCashAccount(name.trim());
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("Create cash account error:", err);
    return NextResponse.json({ error: "Failed to create cash account", detail: getErrorDetail(err) }, { status: 500 });
  }
}
