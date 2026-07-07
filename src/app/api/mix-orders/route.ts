import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getMixOrders, createMixOrderRPC, deleteMixOrder } from "@/lib/data/mix-orders";
import { deleteSalesByMixOrder } from "@/lib/data/sales";
import { admin } from "@/lib/supabase/server-admin";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const orders = await getMixOrders();
    const orderIds = orders.map(o => o.id);
    const salesByMix: Record<number, any[]> = {};
    if (orderIds.length > 0) {
      const { data: allMixSales, error } = await admin
        .from("sales")
        .select("*, products(id,name), customers(id,name)")
        .in("mix_order_id", orderIds);
      if (!error && allMixSales) {
        for (const s of allMixSales) {
          if (s.mix_order_id) {
            if (!salesByMix[s.mix_order_id]) salesByMix[s.mix_order_id] = [];
            salesByMix[s.mix_order_id].push(s);
          }
        }
      }
    }
    return NextResponse.json({ orders, salesByMix });
  } catch (err) {
    console.error("Fetch mix orders error:", err);
    return NextResponse.json({ error: "Failed to fetch mix orders", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// POST — atomic mix order via RPC (parent + sale lines)
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      customer_id,
      order_date,
      target_weight_kg,
      cash_received,
      items,
      driver_name,
      driver_rent,
      location_id,
    } = body;

    if (!customer_id || !items?.length) {
      return NextResponse.json({ error: "customer_id, items required" }, { status: 400 });
    }

    const id = await createMixOrderRPC({
      customer_id,
      location_id: location_id ?? null,
      order_date: order_date || pktToday(),
      target_weight_kg: target_weight_kg || null,
      cash_received: Number(cash_received) || 0,
      entered_by: `admin:${auth.user.id}`,
      items: items.map((i: any) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        rate_per_kg: i.rate_per_kg,
      })),
      driver_name: driver_name?.trim() || null,
      driver_rent: Number(driver_rent) || 0,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Create mix order error:", err);
    const { getErrorDetail } = await import("@/lib/api-error");
    return NextResponse.json({ error: "Failed to create mix order", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await deleteSalesByMixOrder(id);
    await deleteMixOrder(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete mix order error:", err);
    return NextResponse.json({ error: "Failed to delete mix order", detail: getErrorDetail(err) }, { status: 500 });
  }
}
