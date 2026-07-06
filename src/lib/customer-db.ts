// App customer data access — Supabase only (Prisma removed)
import { admin } from "@/lib/supabase/server-admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { pktToday, toPktDate } from "@/lib/pkt-date";

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

// ─── GET all ───
export async function getAllCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await admin.from("app_customers").select("*").order("created_at", { ascending: true });
  if (error) {
    if (error.message.includes("does not exist")) throw new Error("TABLE_NOT_FOUND");
    throw error;
  }
  return (data || []) as CustomerRow[];
}

// ─── GET by email ───
export async function getCustomerByEmail(email: string): Promise<CustomerRow | null> {
  const { data, error } = await admin.from("app_customers").select("*").eq("email", email).single();
  if (error) return null;
  return data as CustomerRow;
}

// ─── GET by id ───
export async function getCustomerById(id: string): Promise<CustomerRow | null> {
  const { data, error } = await admin.from("app_customers").select("*").eq("id", id).single();
  if (error) return null;
  return data as CustomerRow;
}

// ─── CREATE (password is plain text — will be hashed before storage) ───
export async function createCustomer(data: {
  id?: string;
  name: string;
  email: string;
  password: string; // plain — caller must hash, or we hash here
  subscription_type?: string;
  subscription_start?: string;
  subscription_end?: string;
  is_active?: boolean;
  hashPasswordBeforeStore?: boolean;
}): Promise<CustomerRow> {
  const hashed = data.hashPasswordBeforeStore !== false
    ? await hashPassword(data.password)
    : data.password;

  const row = {
    id: data.id || crypto.randomUUID(),
    name: data.name,
    email: data.email,
    password: hashed,
    subscription_type: data.subscription_type || "monthly",
    subscription_start: data.subscription_start || pktToday(),
    subscription_end: data.subscription_end || toPktDate(new Date(Date.now() + 30 * 86400000)),
    is_active: data.is_active !== undefined ? data.is_active : true,
  };

  const { data: created, error } = await admin.from("app_customers").insert(row).select().single();
  if (error) throw error;
  return created as CustomerRow;
}

// ─── UPDATE ───
export async function updateCustomer(id: string, data: Partial<CustomerRow>): Promise<CustomerRow> {
  // If password is being updated, hash it
  if (data.password && !data.password.startsWith("$2b$")) {
    data.password = await hashPassword(data.password);
  }

  const { data: row, error } = await admin.from("app_customers").update(data).eq("id", id).select().single();
  if (error) throw error;
  return row as CustomerRow;
}

// ─── DELETE ───
export async function deleteCustomerById(id: string): Promise<void> {
  await admin.from("app_customers").delete().eq("id", id);
}

// ─── Verify login (bcrypt) ───
export async function verifyCustomerLogin(email: string, plainPassword: string): Promise<Omit<CustomerRow, "password"> | null> {
  const customer = await getCustomerByEmail(email);
  if (!customer) return null;
  if (!customer.is_active) return null;

  const valid = await verifyPassword(plainPassword, customer.password);
  if (!valid) return null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...safe } = customer;
  return safe;
}

// ─── SQL for manual table creation ───
export const CREATE_TABLE_SQL = `-- Run supabase/schema.sql instead — it includes app_customers with proper RLS.`;
