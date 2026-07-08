import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getAllProducts, createProduct, updateProduct, deleteProduct, restoreProduct, permanentDeleteProduct } from "@/lib/data/products";
import { getErrorDetail } from "@/lib/api-error";
import { admin } from "@/lib/supabase/server-admin";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Products change rarely — 30s TTL
const PRODUCTS_TTL = 30_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const onlyActive = url.searchParams.get("active") === "true";
    const suffix = onlyActive ? "active" : "all";

    const products = await cachedGet(
      userKey(auth.user.id, "products", suffix),
      [userTag(auth.user.id, "products")],
      PRODUCTS_TTL,
      async () => {
        let q = admin.from("products").select("*").is("deleted_at", null);
        if (onlyActive) q = q.eq("is_active", true);
        q = q.order("name", { ascending: true });
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      },
    );
    return NextResponse.json({ products });
  } catch (err) {
    console.error("Fetch products error:", err);
    return NextResponse.json({ error: "Failed to fetch products", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, default_rate } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const product = await createProduct({
      name: name.trim(),
      default_rate: Number(default_rate) || 0,
      is_active: true,
    });
    invalidateByTag(userTag(auth.user.id, "products"));
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    console.error("Create product error:", err);
    return NextResponse.json({ error: "Failed to create product", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const product = await updateProduct(id, updates);
    invalidateByTag(userTag(auth.user.id, "products"));
    return NextResponse.json({ product });
  } catch (err) {
    console.error("Update product error:", err);
    return NextResponse.json({ error: "Failed to update product", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// DELETE — soft-delete (mark is_active=false) if product has sales/purchases
// references; otherwise hard-delete.
//   ?restore=true     → reactivate a soft-deleted (is_active=false) product
//   ?permanent=true   → tombstone: remove product from ALL UI surfaces but
//                       keep the row in DB so historical sales/purchases
//                       keep their product_id link and product name.
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const restore = url.searchParams.get("restore") === "true";
    const permanent = url.searchParams.get("permanent") === "true";

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (restore) {
      const product = await restoreProduct(id);
      invalidateByTag(userTag(auth.user.id, "products"));
      return NextResponse.json({ product, restored: true });
    }

    if (permanent) {
      const result = await permanentDeleteProduct(id);
      invalidateByTag(userTag(auth.user.id, "products"));
      return NextResponse.json({ deleted: true, permanent: true, ...result });
    }

    const result = await deleteProduct(id);
    invalidateByTag(userTag(auth.user.id, "products"));
    return NextResponse.json({ deleted: true, ...result });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Failed to delete product", detail: getErrorDetail(err) }, { status: 500 });
  }
}
