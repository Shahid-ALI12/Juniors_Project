import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getAllSuppliers, createSupplier } from "@/lib/data/suppliers";
import { getErrorDetail } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "true";
    const suppliers = await getAllSuppliers(activeOnly);
    return NextResponse.json({ suppliers });
  } catch (err) {
    console.error("Fetch suppliers error:", err);
    return NextResponse.json({ error: "Failed to fetch suppliers", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const supplier = await createSupplier({ name: name.trim(), is_active: true });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    console.error("Create supplier error:", err);
    return NextResponse.json({ error: "Failed to create supplier", detail: getErrorDetail(err) }, { status: 500 });
  }
}
