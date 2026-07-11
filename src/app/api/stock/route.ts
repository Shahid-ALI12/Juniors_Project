import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getAllStock, upsertStock } from "@/lib/data/stock";
import { getErrorDetail } from "@/lib/api-error";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Stock changes on every sale/purchase — short TTL
const STOCK_TTL = 5_000;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const stock = await cachedGet(
      userKey(auth.user.id, "stock"),
      [userTag(auth.user.id, "stock")],
      STOCK_TTL,
      () => getAllStock(),
    );
    return NextResponse.json({ stock });
  } catch (err) {
    console.error("Fetch stock error:", err);
    return NextResponse.json({ error: "Failed to fetch stock", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { product_id, location_id, stock_quantity, last_bag_weight_kg } = body;

    if (!product_id) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 });
    }

    // location_id defaults to Shop (id=2) if not provided
    const locId =
      location_id === null || location_id === undefined || location_id === ""
        ? 2 // default to Shop
        : Number(location_id);

    const stock = await upsertStock({
      product_id: Number(product_id),
      location_id: locId,
      stock_quantity: Number(stock_quantity) || 0,
      last_bag_weight_kg: last_bag_weight_kg ? Number(last_bag_weight_kg) : null,
    });

    invalidateByTag(userTag(auth.user.id, "stock"));
    return NextResponse.json({ stock }, { status: 201 });
  } catch (err) {
    console.error("Upsert stock error:", err);
    return NextResponse.json({ error: "Failed to update stock", detail: getErrorDetail(err) }, { status: 500 });
  }
}
