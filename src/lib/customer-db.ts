// Shared customer data access layer
// Vercel: uses Supabase  |  Local dev: uses Prisma/SQLite

import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";

const isSupaReady = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  return !!(url && key && !url.includes("placeholder") && !key.includes("placeholder"));
};

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  );
}

// ─── Types ───
export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  password: string;
  subscription_type: string;
  subscription_start: string;
  subscription_end: string;
  is_active: boolean;
  created_at: string;
}

type Backend = "supabase" | "prisma";

export function getBackend(): Backend {
  return isSupaReady() ? "supabase" : "prisma";
}

// ─── GET all customers ───
export async function getAllCustomers(): Promise<CustomerRow[]> {
  if (isSupaReady()) {
    const { data, error } = await supa().from("app_customers").select("*").order("created_at", { ascending: true });
    if (error) {
      if (error.message.includes("does not exist")) {
        throw new Error("TABLE_NOT_FOUND");
      }
      throw error;
    }
    return (data || []) as CustomerRow[];
  }
  const rows = await db.appCustomer.findMany({ orderBy: { created_at: "asc" } });
  return rows.map(r => ({
    id: r.id, name: r.name, email: r.email, password: r.password,
    subscription_type: r.subscription_type, subscription_start: r.subscription_start,
    subscription_end: r.subscription_end, is_active: r.is_active,
    created_at: r.created_at.toISOString(),
  }));
}

// ─── GET single by email ───
export async function getCustomerByEmail(email: string): Promise<CustomerRow | null> {
  if (isSupaReady()) {
    const { data, error } = await supa().from("app_customers").select("*").eq("email", email).single();
    if (error) return null;
    return data as CustomerRow;
  }
  const row = await db.appCustomer.findUnique({ where: { email } });
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, password: row.password,
    subscription_type: row.subscription_type, subscription_start: row.subscription_start,
    subscription_end: row.subscription_end, is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

// ─── GET single by id ───
export async function getCustomerById(id: string): Promise<CustomerRow | null> {
  if (isSupaReady()) {
    const { data, error } = await supa().from("app_customers").select("*").eq("id", id).single();
    if (error) return null;
    return data as CustomerRow;
  }
  const row = await db.appCustomer.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, password: row.password,
    subscription_type: row.subscription_type, subscription_start: row.subscription_start,
    subscription_end: row.subscription_end, is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

// ─── CREATE ─── generates id + created_at automatically
export async function createCustomer(data: {
  name: string;
  email: string;
  password: string;
  subscription_type: string;
  subscription_start: string;
  subscription_end: string;
  is_active: boolean;
}): Promise<CustomerRow> {
  const id = "cust_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const created_at = new Date().toISOString();

  if (isSupaReady()) {
    const { data: row, error } = await supa()
      .from("app_customers")
      .insert({ ...data, id, created_at })
      .select()
      .single();
    if (error) throw error;
    return row as CustomerRow;
  }
  const row = await db.appCustomer.create({ data: { ...data, id, created_at } });
  return {
    id: row.id, name: row.name, email: row.email, password: row.password,
    subscription_type: row.subscription_type, subscription_start: row.subscription_start,
    subscription_end: row.subscription_end, is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

// ─── UPDATE ───
export async function updateCustomer(id: string, data: Partial<CustomerRow>): Promise<CustomerRow> {
  if (isSupaReady()) {
    const { data: row, error } = await supa().from("app_customers").update(data).eq("id", id).select().single();
    if (error) throw error;
    return row as CustomerRow;
  }
  const row = await db.appCustomer.update({ where: { id }, data });
  return {
    id: row.id, name: row.name, email: row.email, password: row.password,
    subscription_type: row.subscription_type, subscription_start: row.subscription_start,
    subscription_end: row.subscription_end, is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

// ─── DELETE ───
export async function deleteCustomerById(id: string): Promise<void> {
  if (isSupaReady()) {
    await supa().from("app_customers").delete().eq("id", id);
    return;
  }
  await db.appCustomer.delete({ where: { id } });
}

// ─── SQL to create the table (PostgreSQL / Supabase) ───
export const CREATE_TABLE_SQL = `-- Run this in Supabase SQL Editor
-- Drop old table if needed (wipes data) and recreate with proper defaults:
DROP TABLE IF EXISTS app_customers CASCADE;

CREATE TABLE app_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  subscription_type TEXT NOT NULL DEFAULT 'monthly',
  subscription_start TEXT NOT NULL,
  subscription_end TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE app_customers ENABLE ROW LEVEL SECURITY;

-- Allow all operations
CREATE POLICY "Allow all operations on app_customers" ON app_customers
  FOR ALL USING (true) WITH CHECK (true);
`;