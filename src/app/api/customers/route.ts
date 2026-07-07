import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getAllCustomers, createCustomer as createBizCustomer, updateCustomer as updateBizCustomer, deleteCustomer } from "@/lib/data/customers";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "true";
    const customers = await getAllCustomers(activeOnly);
    return NextResponse.json({ customers });
  } catch (err) {
    console.error("Fetch customers error:", err);
    return NextResponse.json({ error: "Failed to fetch customers", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, type, phone, opening_balance } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    // opening_balance is optional — defaults to 0 if not provided
    const obRaw = typeof opening_balance === "string" ? parseFloat(opening_balance) : opening_balance;
    const ob = Number.isFinite(obRaw) && obRaw! > 0 ? obRaw! : 0;

    const customer = await createBizCustomer({
      name: name.trim(),
      type: type || "credit",
      phone: phone?.trim() || null,
      is_active: true,
      opening_balance: ob,
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    console.error("Create customer error:", err);
    return NextResponse.json({ error: "Failed to create customer", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, opening_balance, ...restUpdates } = body;
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    // Normalize opening_balance if provided (string from form input → number)
    const updates: Record<string, unknown> = { ...restUpdates };
    if (opening_balance !== undefined) {
      const obRaw = typeof opening_balance === "string" ? parseFloat(opening_balance) : opening_balance;
      updates.opening_balance = Number.isFinite(obRaw) && obRaw > 0 ? obRaw : 0;
    }

    const customer = await updateBizCustomer(id, updates);
    return NextResponse.json({ customer });
  } catch (err) {
    console.error("Update customer error:", err);
    return NextResponse.json({ error: "Failed to update customer", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await deleteCustomer(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete customer error:", err);
    return NextResponse.json({ error: "Failed to delete customer", detail: getErrorDetail(err) }, { status: 500 });
  }
}
