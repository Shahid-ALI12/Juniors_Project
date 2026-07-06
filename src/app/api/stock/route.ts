import { requireAdminUser, requireAdmin } from "@/lib/auth/server-user";
import { NextRequest, NextResponse } from "next/server";

import { getAllStock, upsertStock } from "@/lib/data/stock";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;

  try {
    const stock = await getAllStock();
    return NextResponse.json({ stock });
  } catch (err) {
    console.error("Fetch stock error:", err);
    return NextResponse.json({ error: "Failed to fetch stock", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { product_id, location_id, stock_quantity, last_bag_weight_kg } = body;

    if (!product_id || !location_id) {
      return NextResponse.json({ error: "product_id and location_id are required" }, { status: 400 });
    }

    const stock = await upsertStock({
      product_id,
      location_id,
      stock_quantity: Number(stock_quantity) || 0,
      last_bag_weight_kg: last_bag_weight_kg ? Number(last_bag_weight_kg) : null,
    });

    return NextResponse.json({ stock }, { status: 201 });
  } catch (err) {
    console.error("Upsert stock error:", err);
    return NextResponse.json({ error: "Failed to update stock", detail: getErrorDetail(err) }, { status: 500 });
  }
}
