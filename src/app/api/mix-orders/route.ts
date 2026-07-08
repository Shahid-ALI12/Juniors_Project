import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getMixOrders, getMixOrdersPaginated, createMixOrderRPC, deleteMixOrder } from "@/lib/data/mix-orders";
import { deleteSalesByMixOrder } from "@/lib/data/sales";
import { admin } from "@/lib/supabase/server-admin";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Mix orders list — short TTL (creates/deletes happen frequently)
const MIX_ORDERS_TTL = 10_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const locationIdParam = url.searchParams.get("location_id");
    const locationId = locationIdParam ? Number(locationIdParam) : undefined;
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");
    const wantsPagination = pageParam !== null || pageSizeParam !== null;

    // ── Pagination (optional, backward-compat) ──
    if (wantsPagination) {
      const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
      const pageSize = pageSizeParam ? Math.max(1, parseInt(pageSizeParam, 10) || 50) : 50;

      const cacheSuffix = `s=${search.trim()}:loc=${locationId ?? "all"}:p${page}:ps${pageSize}`;
      const result = await cachedGet(
        userKey(auth.user.id, "mix-orders", cacheSuffix),
        [userTag(auth.user.id, "mix-orders")],
        MIX_ORDERS_TTL,
        async () => {
          const result = await getMixOrdersPaginated({ search, location_id: locationId, page, pageSize });
          // Fetch sales for the current page's mix-orders only
          const orderIds = result.rows.map(o => o.id);
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
          return { ...result, salesByMix };
        },
      );
      return NextResponse.json({
        orders: result.rows,
        salesByMix: result.salesByMix,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      });
    }

    // ── Original (non-paginated) path — preserved for existing callers ──
    const { orders, salesByMix } = await cachedGet(
      userKey(auth.user.id, "mix-orders"),
      [userTag(auth.user.id, "mix-orders")],
      MIX_ORDERS_TTL,
      async () => {
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
        return { orders, salesByMix };
      },
    );
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

    // Mix order = sale lines → affects same domains as Sale POST
    invalidateByTag(
      userTag(auth.user.id, "mix-orders"),
      userTag(auth.user.id, "sales"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "stock"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
    );

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

    invalidateByTag(
      userTag(auth.user.id, "mix-orders"),
      userTag(auth.user.id, "sales"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "stock"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete mix order error:", err);
    return NextResponse.json({ error: "Failed to delete mix order", detail: getErrorDetail(err) }, { status: 500 });
  }
}
