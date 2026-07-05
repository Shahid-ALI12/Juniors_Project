import { admin } from "@/lib/supabase/server-admin";

export interface CashAccountRow {
  id: number;
  name: string;
  created_at: string;
}

export interface CashLedgerRow {
  id: number;
  entry_date: string;
  account_id: number;
  direction: "in" | "out";
  amount: number;
  source_type: string | null;
  source_id: number | null;
  description: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface CashTransferRow {
  id: number;
  transfer_date: string;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  from_account?: CashAccountRow | null;
  to_account?: CashAccountRow | null;
}

export async function getCashAccounts(): Promise<CashAccountRow[]> {
  const { data, error } = await admin.from("cash_accounts").select("*").order("id");
  if (error) throw error;
  return (data || []) as CashAccountRow[];
}

export async function createCashAccount(name: string): Promise<CashAccountRow> {
  const { data, error } = await admin.from("cash_accounts").insert({ name }).select().single();
  if (error) throw error;
  return data as CashAccountRow;
}

export async function getCashBalances(): Promise<Record<string, number>> {
  const { data, error } = await admin.from("cash_accounts").select("*");
  if (error) throw error;
  const accounts = (data || []) as CashAccountRow[];
  const result: Record<string, number> = {};

  for (const acct of accounts) {
    const { data: ledger, error: lErr } = await admin
      .from("cash_ledger")
      .select("direction, amount")
      .eq("account_id", acct.id);
    if (lErr) continue;
    const entries = ledger || [];
    result[acct.name] = entries.reduce(
      (sum, e) => sum + (e.direction === "in" ? e.amount : -e.amount),
      0
    );
  }
  return result;
}

export async function getCashTransfers(filters?: {
  transfer_date?: string;
  transfer_date_gte?: string;
  transfer_date_lte?: string;
}): Promise<CashTransferRow[]> {
  let q = admin
    .from("cash_transfers")
    .select("*, from_account:cash_accounts!cash_transfers_from_account_id_fkey(id,name), to_account:cash_accounts!cash_transfers_to_account_id_fkey(id,name)")
    .order("created_at", { ascending: false });

  if (filters?.transfer_date) q = q.eq("transfer_date", filters.transfer_date);
  if (filters?.transfer_date_gte) q = q.gte("transfer_date", filters.transfer_date_gte);
  if (filters?.transfer_date_lte) q = q.lte("transfer_date", filters.transfer_date_lte);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as CashTransferRow[];
}

// Atomic transfer via RPC
export async function transferCashRPC(params: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  transfer_date: string;
  notes: string | null;
  entered_by: string | null;
}): Promise<number> {
  const { data, error } = await admin.rpc("transfer_cash", {
    p_from_account_id: params.from_account_id,
    p_to_account_id: params.to_account_id,
    p_amount: params.amount,
    p_date: params.transfer_date,
    p_notes: params.notes,
    p_entered_by: params.entered_by,
  });
  if (error) throw error;
  return data as number;
}

// Balance correction via RPC
export async function correctBalanceRPC(params: {
  account_id: number;
  target: number;
  correction_date: string;
  entered_by: string | null;
}): Promise<number | null> {
  const { data, error } = await admin.rpc("correct_cash_balance", {
    p_account_id: params.account_id,
    p_target: params.target,
    p_date: params.correction_date,
    p_entered_by: params.entered_by,
  });
  if (error) throw error;
  return data as number | null;
}
