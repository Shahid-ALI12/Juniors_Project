import { NextRequest, NextResponse } from "next/server";
import { getAllCustomers, createCustomer, updateCustomer, deleteCustomerById, getBackend, CREATE_TABLE_SQL } from "@/lib/customer-db";

// GET — fetch all customers (+ setup check)
export async function GET() {
  try {
    const customers = await getAllCustomers();
    return NextResponse.json({ customers, backend: getBackend() });
  } catch (err) {
    if (err instanceof Error && err.message === "TABLE_NOT_FOUND") {
      return NextResponse.json({
        error: "TABLE_NOT_FOUND",
        sql: CREATE_TABLE_SQL,
        message: "app_customers table not found in Supabase. Run the SQL below in Supabase SQL Editor to create it.",
        backend: getBackend(),
      }, { status: 503 });
    }
    console.error("Fetch customers error:", err);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

// POST — create a new customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, subscription_type, subscription_start, subscription_end } = body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
    }

    // Check duplicate email
    const { getCustomerByEmail } = await import("@/lib/customer-db");
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

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "TABLE_NOT_FOUND") {
      return NextResponse.json({ error: "TABLE_NOT_FOUND", sql: CREATE_TABLE_SQL, message: "app_customers table not found. Create it first." }, { status: 503 });
    }
    console.error("Create customer error:", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

// PUT — update a customer
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, email, password, subscription_type, subscription_start, subscription_end, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) {
      const { getCustomerByEmail } = await import("@/lib/customer-db");
      const existing = await getCustomerByEmail(email.trim());
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "This email is already registered to another customer" }, { status: 409 });
      }
      updates.email = email.trim();
    }
    if (password !== undefined) updates.password = password;
    if (subscription_type !== undefined) updates.subscription_type = subscription_type;
    if (subscription_start !== undefined) updates.subscription_start = subscription_start;
    if (subscription_end !== undefined) updates.subscription_end = subscription_end;
    if (is_active !== undefined) updates.is_active = is_active;

    const customer = await updateCustomer(id, updates);

    return NextResponse.json({ customer });
  } catch (err) {
    console.error("Update customer error:", err);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

// DELETE — remove a customer
export async function DELETE(request: NextRequest) {
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