import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getAllProducts, createProduct, updateProduct, deleteProduct, restoreProduct } from "@/lib/data/products";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const products = await getAllProducts();
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
    return NextResponse.json({ product });
  } catch (err) {
    console.error("Update product error:", err);
    return NextResponse.json({ error: "Failed to update product", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// DELETE — soft-delete (mark is_active=false) if product has sales/purchases
// references; otherwise hard-delete. Use ?restore=true to reactivate.
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const restore = url.searchParams.get("restore") === "true";

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (restore) {
      const product = await restoreProduct(id);
      return NextResponse.json({ product, restored: true });
    }

    const result = await deleteProduct(id);
    return NextResponse.json({ deleted: true, ...result });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Failed to delete product", detail: getErrorDetail(err) }, { status: 500 });
  }
}
