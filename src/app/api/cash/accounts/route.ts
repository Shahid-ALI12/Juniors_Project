import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getCashAccounts, createCashAccount } from "@/lib/data/cash";
import { getErrorDetail } from "@/lib/api-error";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Cash accounts rarely change — 60s TTL is safe
const ACCOUNTS_TTL = 60_000;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const accounts = await cachedGet(
      userKey(auth.user.id, "cash-accounts"),
      [userTag(auth.user.id, "cash"), userTag(auth.user.id, "cash-accounts")],
      ACCOUNTS_TTL,
      () => getCashAccounts(),
    );
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("Fetch cash accounts error:", err);
    return NextResponse.json({ error: "Failed to fetch cash accounts", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const account = await createCashAccount(name.trim());
    // New account → balances + accounts cache stale
    invalidateByTag(userTag(auth.user.id, "cash"));
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("Create cash account error:", err);
    return NextResponse.json({ error: "Failed to create cash account", detail: getErrorDetail(err) }, { status: 500 });
  }
}
