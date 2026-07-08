import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getPurchases, recordPurchaseRPC, deletePurchase } from "@/lib/data/purchases";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Purchases list — short TTL (frequently changes)
const PURCHASES_TTL = 5_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const filters: Record<string, string | number> = {};
    if (url.searchParams.get("purchase_date_gte")) filters.purchase_date_gte = url.searchParams.get("purchase_date_gte")!;
    if (url.searchParams.get("purchase_date_lte")) filters.purchase_date_lte = url.searchParams.get("purchase_date_lte")!;
    if (url.searchParams.get("location_id")) filters.location_id = Number(url.searchParams.get("location_id")!);

    const filterSuffix = new URLSearchParams(filters as Record<string, string>).toString();
    const purchases = await cachedGet(
      userKey(auth.user.id, "purchases", filterSuffix),
      [userTag(auth.user.id, "purchases")],
      PURCHASES_TTL,
      () => getPurchases(filters as any),
    );
    return NextResponse.json({ purchases });
  } catch (err) {
    console.error("Fetch purchases error:", err);
    return NextResponse.json({ error: "Failed to fetch purchases", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// POST — atomic purchase via RPC (stock increment + cash ledger)
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, unit_type, bag_weight_kg } = body;

    if (!product_id || !quantity) {
      return NextResponse.json({ error: "product_id, quantity are required" }, { status: 400 });
    }

    const id = await recordPurchaseRPC({
      purchase_date: purchase_date || pktToday(),
      product_id,
      quantity: Number(quantity),
      rate_per_bag: Number(rate_per_bag) || 0,
      supplier_id: supplier_id || null,
      settled_by_customer_id: settled_by_customer_id || null,
      cash_paid: Number(cash_paid) || 0,
      location_id: location_id ?? 1, // default to Farmhouse
      notes: notes?.trim() || null,
      unit_type: unit_type || "bags",
      bag_weight_kg: bag_weight_kg ? Number(bag_weight_kg) : null,
      entered_by: `admin:${auth.user.id}`,
    });

    // Purchase affects: purchases list, stock, customer balances (if settled_by_customer_id), dashboard, reconciliation, cash
    invalidateByTag(
      userTag(auth.user.id, "purchases"),
      userTag(auth.user.id, "stock"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Create purchase error:", err);
    const { getErrorDetail } = await import("@/lib/api-error");
    return NextResponse.json({ error: "Failed to create purchase", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await deletePurchase(id);

    // Same domains as POST
    invalidateByTag(
      userTag(auth.user.id, "purchases"),
      userTag(auth.user.id, "stock"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete purchase error:", err);
    return NextResponse.json({ error: "Failed to delete purchase", detail: getErrorDetail(err) }, { status: 500 });
  }
}
