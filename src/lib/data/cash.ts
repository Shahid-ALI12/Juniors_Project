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
    .select("id, transfer_date, from_account_id, to_account_id, amount, notes, entered_by, created_at, from_account:cash_accounts!cash_transfers_from_account_id_fkey(id,name), to_account:cash_accounts!cash_transfers_to_account_id_fkey(id,name)")
    .order("created_at", { ascending: false });

  if (filters?.transfer_date) q = q.eq("transfer_date", filters.transfer_date);
  if (filters?.transfer_date_gte) q = q.gte("transfer_date", filters.transfer_date_gte);
  if (filters?.transfer_date_lte) q = q.lte("transfer_date", filters.transfer_date_lte);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as CashTransferRow[];
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
  try {
    // Try RPC first (atomic: transfer + 2 ledger entries)
    const { data, error } = await admin.rpc("transfer_cash", {
      p_from_account_id: params.from_account_id,
      p_to_account_id: params.to_account_id,
      p_amount: params.amount,
      p_date: params.transfer_date,
      p_notes: params.notes,
      p_entered_by: params.entered_by,
    });
    if (error) throw error;
    // RPC returns TABLE(id bigint) — extract first row's id
    return Array.isArray(data) ? (data as any)[0]?.id as number : data as number;
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (msg.includes("does not exist") || msg.includes("Could not find the function") || msg.includes("cannot extract elements from a scalar")) {
      console.warn("transfer_cash RPC not found or scalar error — falling back to direct insert");
      return transferCashFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct inserts (non-atomic)
async function transferCashFallback(params: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  transfer_date: string;
  notes: string | null;
  entered_by: string | null;
}): Promise<number> {
  // Insert transfer row
  const { data: trData, error: trErr } = await admin
    .from("cash_transfers")
    .insert({
      transfer_date: params.transfer_date,
      from_account_id: params.from_account_id,
      to_account_id: params.to_account_id,
      amount: params.amount,
      notes: params.notes,
      entered_by: params.entered_by,
    })
    .select("id")
    .single();
  if (trErr) throw trErr;
  const trId = (trData as any).id as number;

  // Insert ledger entries (best effort)
  try {
    await admin.from("cash_ledger").insert([
      {
        entry_date: params.transfer_date,
        account_id: params.from_account_id,
        direction: "out",
        amount: params.amount,
        source_type: "transfer",
        source_id: trId,
        description: "Transfer out #" + trId,
        entered_by: params.entered_by,
      },
      {
        entry_date: params.transfer_date,
        account_id: params.to_account_id,
        direction: "in",
        amount: params.amount,
        source_type: "transfer",
        source_id: trId,
        description: "Transfer in #" + trId,
        entered_by: params.entered_by,
      },
    ]);
  } catch (ledgerErr) {
    console.warn("Cash ledger insert failed (non-critical):", ledgerErr);
  }

  return trId;
}

// Balance correction via RPC
export async function correctBalanceRPC(params: {
  account_id: number;
  target: number;
  correction_date: string;
  entered_by: string | null;
}): Promise<number | null> {
  try {
    // Try RPC first (atomic: calculates diff + single ledger entry)
    const { data, error } = await admin.rpc("correct_cash_balance", {
      p_account_id: params.account_id,
      p_target: params.target,
      p_date: params.correction_date,
      p_entered_by: params.entered_by,
    });
    if (error) throw error;
    // RPC returns TABLE(id bigint) — extract first row's id or null
    if (data == null) return null;
    return Array.isArray(data) ? (data as any)[0]?.id as number : data as number;
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (msg.includes("does not exist") || msg.includes("Could not find the function") || msg.includes("cannot extract elements from a scalar")) {
      console.warn("correct_cash_balance RPC not found or scalar error — falling back to manual calculation");
      return correctBalanceFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: manual balance calculation + ledger insert (non-atomic)
async function correctBalanceFallback(params: {
  account_id: number;
  target: number;
  correction_date: string;
  entered_by: string | null;
}): Promise<number | null> {
  // Calculate current balance
  const { data: ledger, error } = await admin
    .from("cash_ledger")
    .select("direction, amount")
    .eq("account_id", params.account_id);
  if (error) throw error;

  const current = (ledger || []).reduce(
    (sum, e) => sum + (e.direction === "in" ? e.amount : -e.amount),
    0
  );

  const diff = params.target - current;
  if (diff === 0) return null;

  const direction = diff > 0 ? "in" : "out";

  const { data: corrData, error: corrErr } = await admin
    .from("cash_ledger")
    .insert({
      entry_date: params.correction_date,
      account_id: params.account_id,
      direction,
      amount: Math.abs(diff),
      source_type: "correction",
      source_id: null,
      description: "Manual balance correction",
      entered_by: params.entered_by,
    })
    .select("id")
    .single();
  if (corrErr) throw corrErr;
  return (corrData as any).id as number;
}