import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase/server-admin";

// Diagnostic endpoint — tests specific queries that Purchases & Stock page makes.
// Call: GET /api/debug/db-check
// No auth required — debugging only.

const TABLES = [
  "app_customers", "products", "locations", "customers", "suppliers",
  "product_stock", "sales", "expenses", "purchases",
  "cash_accounts", "cash_ledger", "cash_transfers", "mix_orders",
] as const;

export async function GET() {
  const queryTests: { name: string; ok: boolean; error?: string; rows?: number }[] = [];

  // ─── Test 1: Purchases with explicit columns + joins + order ───
  try {
    const { data, error } = await admin
      .from("purchases")
      .select("id, purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, entered_by, unit_type, bag_weight_kg, created_at, products(id,name), suppliers(id,name), customers(id,name), locations(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    queryTests.push({ name: "purchases (explicit cols + 4 joins + order created_at)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "purchases (explicit cols + 4 joins + order created_at)", ok: false, error: e.message || String(e) });
  }

  // ─── Test 2: Purchases with NO order ───
  try {
    const { data, error } = await admin
      .from("purchases")
      .select("id, purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, entered_by, unit_type, bag_weight_kg, created_at, products(id,name), suppliers(id,name), customers(id,name), locations(id,name)");
    if (error) throw error;
    queryTests.push({ name: "purchases (explicit cols + 4 joins, NO order)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "purchases (explicit cols + 4 joins, NO order)", ok: false, error: e.message || String(e) });
  }

  // ─── Test 3: Stock with explicit columns + joins + order ───
  try {
    const { data, error } = await admin
      .from("product_stock")
      .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name), locations(id,name)")
      .order("product_id", { ascending: true });
    if (error) throw error;
    queryTests.push({ name: "stock (explicit cols + 2 joins + order product_id)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "stock (explicit cols + 2 joins + order product_id)", ok: false, error: e.message || String(e) });
  }

  // ─── Test 4: Stock with NO order ───
  try {
    const { data, error } = await admin
      .from("product_stock")
      .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name), locations(id,name)");
    if (error) throw error;
    queryTests.push({ name: "stock (explicit cols + 2 joins, NO order)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "stock (explicit cols + 2 joins, NO order)", ok: false, error: e.message || String(e) });
  }

  // ─── Test 5: Purchases with * + joins + order (THE OLD BUGGY QUERY) ───
  try {
    const { data, error } = await admin
      .from("purchases")
      .select("*, products(id,name), suppliers(id,name), customers(id,name), locations(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    queryTests.push({ name: "purchases (* + 4 joins + order created_at) — OLD BUGGY", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "purchases (* + 4 joins + order created_at) — OLD BUGGY", ok: false, error: e.message || String(e) });
  }

  // ─── Test 6: Stock with * + joins + order (THE OLD BUGGY QUERY) ───
  try {
    const { data, error } = await admin
      .from("product_stock")
      .select("*, products(id,name), locations(id,name)")
      .order("product_id", { ascending: true });
    if (error) throw error;
    queryTests.push({ name: "stock (* + 2 joins + order product_id) — OLD BUGGY", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "stock (* + 2 joins + order product_id) — OLD BUGGY", ok: false, error: e.message || String(e) });
  }

  // ─── Test 7: Simple selects (no joins) ───
  try {
    const { data, error } = await admin.from("products").select("*").order("name", { ascending: true });
    if (error) throw error;
    queryTests.push({ name: "products (select * + order name)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "products (select * + order name)", ok: false, error: e.message || String(e) });
  }

  try {
    const { data, error } = await admin.from("customers").select("*").order("name", { ascending: true });
    if (error) throw error;
    queryTests.push({ name: "customers (select * + order name)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "customers (select * + order name)", ok: false, error: e.message || String(e) });
  }

  try {
    const { data, error } = await admin.from("suppliers").select("*").order("name");
    if (error) throw error;
    queryTests.push({ name: "suppliers (select * + order name)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "suppliers (select * + order name)", ok: false, error: e.message || String(e) });
  }

  try {
    const { data, error } = await admin.from("locations").select("*").order("name");
    if (error) throw error;
    queryTests.push({ name: "locations (select * + order name)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "locations (select * + order name)", ok: false, error: e.message || String(e) });
  }

  // ─── Test 8: Sales with explicit cols + joins (used on other pages) ───
  try {
    const { data, error } = await admin
      .from("sales")
      .select("id, customer_id, product_id, location_id, quantity, rate_per_bag, rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg, mix_order_id, transaction_group_id, rickshaw_driver_name, entered_by, created_at, customers(id,name,type), products(id,name), locations(id,name)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    queryTests.push({ name: "sales (explicit cols + 3 joins + order created_at)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "sales (explicit cols + 3 joins + order created_at)", ok: false, error: e.message || String(e) });
  }

  // ─── Test 9: Check for any VIEWS that might shadow tables ───
  try {
    const { data, error } = await admin
      .from("purchases")
      .select("id")
      .limit(1);
    if (error) throw error;
    queryTests.push({ name: "purchases (simple select id, no joins)", ok: true, rows: (data || []).length });
  } catch (e: any) {
    queryTests.push({ name: "purchases (simple select id, no joins)", ok: false, error: e.message || String(e) });
  }

  const failing = queryTests.filter(t => !t.ok);
  const passing = queryTests.filter(t => t.ok);

  return NextResponse.json({
    status: failing.length === 0 ? "ALL QUERIES PASS" : `${failing.length} QUERY(IES) FAIL`,
    passing: passing.length,
    failing: failing.length,
    tests: queryTests,
  });
}