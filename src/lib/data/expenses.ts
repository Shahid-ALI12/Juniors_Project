import { admin } from "@/lib/supabase/server-admin";

export interface ExpenseRow {
  id: number;
  description: string;
  amount: number;
  expense_date: string;
  entered_by: string | null;
  created_at: string;
}

export async function getExpenses(filters?: {
  expense_date?: string;
  expense_date_gte?: string;
  expense_date_lte?: string;
}): Promise<ExpenseRow[]> {
  let q = admin.from("expenses").select("*").is("voided_at", null).order("created_at", { ascending: true });
  if (filters?.expense_date) q = q.eq("expense_date", filters.expense_date);
  if (filters?.expense_date_gte) q = q.gte("expense_date", filters.expense_date_gte);
  if (filters?.expense_date_lte) q = q.lte("expense_date", filters.expense_date_lte);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ExpenseRow[];
}

export async function deleteExpense(id: number): Promise<void> {
  // Fetch the expense BEFORE voiding
  const { data: expRow } = await admin.from("expenses").select("*").eq("id", id).is("voided_at", null).maybeSingle();
  const exp = expRow as any;

  const { error: softErr } = await admin
    .from("expenses")
    .update({ voided_at: new Date().toISOString() })
    .eq("id", id)
    .is("voided_at", null);
  if (!softErr) {
    await reverseExpenseEffects(exp);
    return;
  }
  if (softErr.message?.includes("column") || softErr.message?.includes("does not exist")) {
    console.warn("voided_at column not found — falling back to hard delete for expense");
    await reverseExpenseEffects(exp);
    const { error } = await admin.from("expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error(softErr.message);
}

// Reverse cash ledger when voiding an expense
async function reverseExpenseEffects(exp: any): Promise<void> {
  if (!exp || !exp.amount) return;
  try {
    const { data: acct } = await admin.from("cash_accounts").select("id").eq("name", "Cash In Hand").limit(1).single();
    if (acct) {
      await admin.from("cash_ledger").insert({
        entry_date: exp.expense_date,
        account_id: (acct as any).id,
        direction: "in",
        amount: exp.amount,
        source_type: "expense_void",
        source_id: exp.id,
        description: "Void expense #" + exp.id + ": " + exp.description,
      });
    }
  } catch (err) {
    console.error("Error reversing expense effects (non-critical, manual fix may be needed):", err);
  }
}

// Atomic expense via RPC (also posts cash_ledger 'out')
export async function recordExpenseRPC(params: {
  description: string;
  amount: number;
  expense_date: string;
  entered_by: string | null;
}): Promise<number> {
  try {
    // Try RPC first (atomic: expense + cash ledger in one transaction)
    const { data, error } = await admin.rpc("record_expense", {
      p_description: params.description,
      p_amount: params.amount,
      p_expense_date: params.expense_date,
      p_entered_by: params.entered_by,
    });
    if (error) throw error;
    return data as number;
  } catch (rpcErr: any) {
    // If RPC function doesn't exist, fall back to direct inserts
    const msg = rpcErr?.message || "";
    if ((msg.includes("does not exist") || msg.includes("Could not find the function")) && msg.includes("function")) {
      console.warn("record_expense RPC not found — falling back to direct insert");
      return recordExpenseFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct insert without cash_ledger (non-atomic)
async function recordExpenseFallback(params: {
  description: string;
  amount: number;
  expense_date: string;
  entered_by: string | null;
}): Promise<number> {
  // Insert expense
  const { data: expData, error: expErr } = await admin
    .from("expenses")
    .insert({
      description: params.description,
      amount: params.amount,
      expense_date: params.expense_date,
      entered_by: params.entered_by,
    })
    .select("id")
    .single();
  if (expErr) throw expErr;
  const expId = (expData as any).id as number;

  // Try to insert cash_ledger entry (best effort — don't fail if it breaks)
  try {
    const { data: acctData } = await admin
      .from("cash_accounts")
      .select("id")
      .eq("name", "Cash In Hand")
      .limit(1)
      .single();
    if (acctData) {
      await admin.from("cash_ledger").insert({
        entry_date: params.expense_date,
        account_id: (acctData as any).id,
        direction: "out",
        amount: params.amount,
        source_type: "expense",
        source_id: expId,
        description: params.description,
        entered_by: params.entered_by,
      });
    }
  } catch (ledgerErr) {
    console.warn("Cash ledger insert failed (non-critical):", ledgerErr);
  }

  return expId;
}