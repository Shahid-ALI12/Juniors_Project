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
  let q = admin.from("expenses").select("*").order("created_at", { ascending: true });
  if (filters?.expense_date) q = q.eq("expense_date", filters.expense_date);
  if (filters?.expense_date_gte) q = q.gte("expense_date", filters.expense_date_gte);
  if (filters?.expense_date_lte) q = q.lte("expense_date", filters.expense_date_lte);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ExpenseRow[];
}

export async function deleteExpense(id: number): Promise<void> {
  await admin.from("expenses").delete().eq("id", id);
}

// Atomic expense via RPC (also posts cash_ledger)
export async function recordExpenseRPC(params: {
  description: string;
  amount: number;
  expense_date: string;
  entered_by: string | null;
}): Promise<number> {
  const { data, error } = await admin.rpc("record_expense", {
    p_description: params.description,
    p_amount: params.amount,
    p_expense_date: params.expense_date,
    p_entered_by: params.entered_by,
  });
  if (error) throw error;
  return data as number;
}
