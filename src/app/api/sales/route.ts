import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getSales, getSalesPaginated, deleteSale, deleteSalesByGroup, deleteSalesByMixOrder, createSaleRPC } from "@/lib/data/sales";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses — data changes after mutations
export const dynamic = "force-dynamic";

// Sales list changes very frequently — short TTL
const SALES_TTL = 5_000;

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
    if (url.searchParams.get("location_id")) filters.location_id = Number(url.searchParams.get("location_id")!);

    // ── Pagination (optional, backward-compat) ──
    // If `page` and `pageSize` query params are present, return paginated response:
    //   { sales, total, page, pageSize, totalPages }
    // Otherwise, return the original shape: { sales } (all rows)
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");
    const wantsPagination = pageParam !== null || pageSizeParam !== null;

    if (wantsPagination) {
      const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
      const pageSize = pageSizeParam ? Math.max(1, parseInt(pageSizeParam, 10) || 50) : 50;

      // Cache key includes filter + pagination
      const cacheSuffix = `${new URLSearchParams(filters as Record<string, string>).toString()}:p${page}:ps${pageSize}`;
      const result = await cachedGet(
        userKey(auth.user.id, "sales", cacheSuffix),
        [userTag(auth.user.id, "sales")],
        SALES_TTL,
        () => getSalesPaginated({ ...filters, page, pageSize }),
      );
      return NextResponse.json({
        sales: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      });
    }

    // ── Original (non-paginated) path — preserved for existing callers ──
    const filterSuffix = new URLSearchParams(filters as Record<string, string>).toString();
    const sales = await cachedGet(
      userKey(auth.user.id, "sales", filterSuffix),
      [userTag(auth.user.id, "sales")],
      SALES_TTL,
      () => getSales(filters as any),
    );
    return NextResponse.json({ sales });
  } catch (err) {
    console.error("Fetch sales error:", err);
    return NextResponse.json({ error: "Failed to fetch sales", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// POST — atomic sale via RPC (cart → multiple sale rows + stock decrement + cash ledger)
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { items, customer_id, location_id, sale_date, cash_received, rickshaw_fare, rickshaw_driver } = body;

    if (!items?.length || !customer_id) {
      return NextResponse.json({ error: "items, customer_id are required" }, { status: 400 });
    }

    const groupId = `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await createSaleRPC({
      items,
      customer_id,
      location_id: location_id ?? 1, // default to Farmhouse
      sale_date: sale_date || pktToday(),
      cash_received: Number(cash_received) || 0,
      rickshaw_fare: Number(rickshaw_fare) || 0,
      rickshaw_driver: rickshaw_driver || null,
      transaction_group_id: groupId,
      entered_by: `admin:${auth.user.id}`,
    });

    // Sale affects: sales list, customer balances, dashboard, stock, reconciliation, cash
    invalidateByTag(
      userTag(auth.user.id, "sales"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "stock"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
      userTag(auth.user.id, "mix-orders"),
    );

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
  const auth = await requireUser();
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

    // Same domains as POST — sale deletion affects everything
    invalidateByTag(
      userTag(auth.user.id, "sales"),
      userTag(auth.user.id, "customer-balance"),
      userTag(auth.user.id, "dashboard"),
      userTag(auth.user.id, "stock"),
      userTag(auth.user.id, "reconciliation"),
      userTag(auth.user.id, "cash"),
      userTag(auth.user.id, "mix-orders"),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete sale error:", err);
    return NextResponse.json({ error: "Failed to delete sale", detail: getErrorDetail(err) }, { status: 500 });
  }
}
