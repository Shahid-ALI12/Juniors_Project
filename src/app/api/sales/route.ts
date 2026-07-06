import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth/server-user";
import { getSales, deleteSale, deleteSalesByGroup, deleteSalesByMixOrder, createSaleRPC } from "@/lib/data/sales";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses — data changes after mutations
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const filters: Record<string, string | number> = {};
    if (url.searchParams.get("sale_date")) filters.sale_date = url.searchParams.get("sale_date")!;
    if (url.searchParams.get("sale_date_gte")) filters.sale_date_gte = url.searchParams.get("sale_date_gte")!;
    if (url.searchParams.get("sale_date_lte")) filters.sale_date_lte = url.searchParams.get("sale_date_lte")!;
    if (url.searchParams.get("customer_id")) filters.customer_id = Number(url.searchParams.get("customer_id")!);
    if (url.searchParams.get("transaction_group_id")) filters.transaction_group_id = url.searchParams.get("transaction_group_id")!;

    const sales = await getSales(filters as any);
    return NextResponse.json({ sales });
  } catch (err) {
    console.error("Fetch sales error:", err);
    return NextResponse.json({ error: "Failed to fetch sales", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// POST — atomic sale via RPC (cart → multiple sale rows + stock decrement + cash ledger)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { items, customer_id, location_id, sale_date, cash_received, rickshaw_fare, rickshaw_driver } = body;

    if (!items?.length || !customer_id || !location_id) {
      return NextResponse.json({ error: "items, customer_id, location_id are required" }, { status: 400 });
    }

    const groupId = `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await createSaleRPC({
      items,
      customer_id,
      location_id,
      sale_date: sale_date || (() => { const d = new Date(); return new Date(d.getTime() + (5 * 60 + 30) * 60000).toISOString().split("T")[0]; })(),
      cash_received: Number(cash_received) || 0,
      rickshaw_fare: Number(rickshaw_fare) || 0,
      rickshaw_driver: rickshaw_driver || null,
      transaction_group_id: groupId,
      entered_by: `${auth.type}:${auth.user.id}`,
    });

    // Fetch the created sales for the client
    const createdSales = await getSales({ transaction_group_id: groupId });
    return NextResponse.json({ sales: createdSales }, { status: 201 });
  } catch (err) {
    console.error("Create sale error:", err);
    const { getErrorDetail } = await import("@/lib/api-error");
    return NextResponse.json({ error: "Failed to create sale", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// DELETE — by id, group, or mix_order
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const groupId = url.searchParams.get("group_id");
    const mixOrderId = url.searchParams.get("mix_order_id");

    if (id) await deleteSale(Number(id));
    else if (groupId) await deleteSalesByGroup(groupId);
    else if (mixOrderId) await deleteSalesByMixOrder(Number(mixOrderId));
    else return NextResponse.json({ error: "id, group_id, or mix_order_id required" }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete sale error:", err);
    return NextResponse.json({ error: "Failed to delete sale", detail: getErrorDetail(err) }, { status: 500 });
  }
}
