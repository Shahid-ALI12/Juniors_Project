import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-user";
import { getAllCustomers, createCustomer, updateCustomer, deleteCustomerById, getCustomerByEmail } from "@/lib/customer-db";

// GET — fetch all app_customers
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const customers = await getAllCustomers();
    // Strip passwords from response
    const safe = customers.map(({ password: _pw, ...rest }) => rest);
    return NextResponse.json({ customers: safe });
  } catch (err) {
    if (err instanceof Error && err.message === "TABLE_NOT_FOUND") {
      return NextResponse.json(
        { error: "TABLE_NOT_FOUND", message: "app_customers table not found. Run supabase/schema.sql in Supabase SQL Editor." },
        { status: 503 }
      );
    }
    console.error("Fetch customers error:", err);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

// POST — create a new app_customer
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, email, password, subscription_type, subscription_start, subscription_end } = body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
    }

    // Check duplicate email
    const existing = await getCustomerByEmail(email.trim());
    if (existing) {
      return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
    }

    const customer = await createCustomer({
      name: name.trim(),
      email: email.trim(),
      password,
      subscription_type: subscription_type || "monthly",
      subscription_start: subscription_start || new Date().toISOString().split("T")[0],
      subscription_end: subscription_end || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      is_active: true,
    });

    const { password: _pw, ...safe } = customer;
    return NextResponse.json({ customer: safe }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "TABLE_NOT_FOUND") {
      return NextResponse.json({ error: "TABLE_NOT_FOUND", message: "app_customers table not found. Run supabase/schema.sql." }, { status: 503 });
    }
    console.error("Create customer error:", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

// PUT — update a customer
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, name, email, password, subscription_type, subscription_start, subscription_end, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) {
      const existing = await getCustomerByEmail(email.trim());
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "This email is already registered to another customer" }, { status: 409 });
      }
      updates.email = email.trim();
    }
    if (password !== undefined && password !== "") updates.password = password; // will be hashed in updateCustomer
    if (subscription_type !== undefined) updates.subscription_type = subscription_type;
    if (subscription_start !== undefined) updates.subscription_start = subscription_start;
    if (subscription_end !== undefined) updates.subscription_end = subscription_end;
    if (is_active !== undefined) updates.is_active = is_active;

    const customer = await updateCustomer(id, updates);
    const { password: _pw, ...safe } = customer;
    return NextResponse.json({ customer: safe });
  } catch (err) {
    console.error("Update customer error:", err);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

// DELETE — remove a customer
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    await deleteCustomerById(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete customer error:", err);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
