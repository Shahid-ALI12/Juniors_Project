import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET — fetch all customers
export async function GET() {
  try {
    const customers = await db.appCustomer.findMany({
      orderBy: { created_at: "asc" },
    });
    return NextResponse.json({ customers });
  } catch (err) {
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
    const existing = await db.appCustomer.findUnique({ where: { email: email.trim() } });
    if (existing) {
      return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
    }

    const customer = await db.appCustomer.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        password,
        subscription_type: subscription_type || "monthly",
        subscription_start: subscription_start || new Date().toISOString().split("T")[0],
        subscription_end: subscription_end || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
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
      // Check duplicate email (exclude current customer)
      const existing = await db.appCustomer.findFirst({ where: { email: email.trim(), id: { not: id } } });
      if (existing) {
        return NextResponse.json({ error: "This email is already registered to another customer" }, { status: 409 });
      }
      updates.email = email.trim();
    }
    if (password !== undefined) updates.password = password;
    if (subscription_type !== undefined) updates.subscription_type = subscription_type;
    if (subscription_start !== undefined) updates.subscription_start = subscription_start;
    if (subscription_end !== undefined) updates.subscription_end = subscription_end;
    if (is_active !== undefined) updates.is_active = is_active;

    const customer = await db.appCustomer.update({
      where: { id },
      data: updates,
    });

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

    await db.appCustomer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete customer error:", err);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}