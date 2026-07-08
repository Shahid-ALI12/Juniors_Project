import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import {
  getAllCustomers,
  createCustomer as createBizCustomer,
  updateCustomer as updateBizCustomer,
  deactivateCustomer,
  restoreCustomer,
  permanentDeleteCustomer,
  deleteCustomer,
} from "@/lib/data/customers";
import { getErrorDetail } from "@/lib/api-error";
import { cachedGet, invalidateByTag, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Customer list changes rarely (admin adds/edits occasionally) — 30s TTL
const CUSTOMERS_TTL = 30_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "true";
    const suffix = activeOnly ? "active" : "all";

    const customers = await cachedGet(
      userKey(auth.user.id, "customers", suffix),
      [userTag(auth.user.id, "customers"), userTag(auth.user.id, "customer-balance")],
      CUSTOMERS_TTL,
      () => getAllCustomers(activeOnly),
    );
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
    invalidateByTag(userTag(auth.user.id, "customers"));
    invalidateByTag(userTag(auth.user.id, "customer-balance"));
    invalidateByTag(userTag(auth.user.id, "dashboard"));
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
    invalidateByTag(userTag(auth.user.id, "customers"));
    invalidateByTag(userTag(auth.user.id, "customer-balance"));
    invalidateByTag(userTag(auth.user.id, "dashboard"));
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

    const mode = searchParams.get("mode"); // undefined | "soft" | "permanent" | "restore"

    if (mode === "restore") {
      await restoreCustomer(id);
      invalidateByTag(userTag(auth.user.id, "customers"));
      invalidateByTag(userTag(auth.user.id, "customer-balance"));
      invalidateByTag(userTag(auth.user.id, "dashboard"));
      return NextResponse.json({ success: true, action: "restored" });
    }

    if (mode === "permanent") {
      await permanentDeleteCustomer(id);
      invalidateByTag(userTag(auth.user.id, "customers"));
      invalidateByTag(userTag(auth.user.id, "customer-balance"));
      invalidateByTag(userTag(auth.user.id, "dashboard"));
      return NextResponse.json({ success: true, action: "permanent_deleted" });
    }

    // Default behavior: try hard-delete (works only if no FK references).
    // If FK restrict blocks it, fall back to soft-delete so the user
    // still sees the customer on the Manage page (with restore option).
    try {
      await deleteCustomer(id);
      invalidateByTag(userTag(auth.user.id, "customers"));
      invalidateByTag(userTag(auth.user.id, "customer-balance"));
      invalidateByTag(userTag(auth.user.id, "dashboard"));
      return NextResponse.json({ success: true, action: "hard_deleted" });
    } catch (fkErr: any) {
      // FK restrict — fall back to soft-delete
      console.warn("Hard delete failed (likely FK restrict), falling back to soft-delete:", fkErr?.message);
      await deactivateCustomer(id);
      invalidateByTag(userTag(auth.user.id, "customers"));
      invalidateByTag(userTag(auth.user.id, "customer-balance"));
      invalidateByTag(userTag(auth.user.id, "dashboard"));
      return NextResponse.json({
        success: true,
        action: "soft_deleted",
        note: "Customer has historical sales — soft-deleted instead. Use 'Delete Permanently' to tombstone.",
      });
    }
  } catch (err) {
    console.error("Delete customer error:", err);
    return NextResponse.json({ error: "Failed to delete customer", detail: getErrorDetail(err) }, { status: 500 });
  }
}
