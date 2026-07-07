"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { CREDIT_LIMIT } from "@/types";
import type { Customer, Sale } from "@/types";
import { AlertTriangle, Download, BookOpen, Users, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { numberToWords } from "@/lib/number-to-words";

const fmt = (n: number) => n.toLocaleString("en-PK");

/** Small helper: renders Rs. value + English words below */
function AmountWithWords({ amount, className }: { amount: number; className?: string }) {
  if (amount === 0) {
    return <span className={className}>Rs. 0</span>;
  }
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className="tabular-nums font-medium leading-tight">Rs. {fmt(amount)}</span>
      <span className="text-[0.6rem] text-slate-400 leading-tight capitalize">{numberToWords(amount)}</span>
    </span>
  );
}

interface BalanceRow {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  balance_due: number;
}

interface CustomerWithBalance extends Customer, BalanceRow {}

export default function CustomerKhataPage() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<number, BalanceRow>>({});
  const [selectedSales, setSelectedSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Load all customers + their balances
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cusRaw = await fetch("/api/customers");
        if (!cusRaw.ok) { toast.error("Failed to load customers"); return; }
        const cusRes = await cusRaw.json();
        setCustomers(cusRes.customers ?? []);
        const balRaw = await fetch("/api/reports/customer-balance");
        if (!balRaw.ok) { toast.error("Failed to load balances"); return; }
        const bal = await balRaw.json();
        setBalances(typeof bal === "object" && !Array.isArray(bal) ? bal : {});
      } catch {
        toast.error("Failed to load customer data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load selected customer's sales
  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedSales([]);
      return;
    }
    (async () => {
      setLoadingDetail(true);
      try {
        const resRaw = await fetch(`/api/sales?customer_id=${selectedCustomerId}`);
        if (!resRaw.ok) { toast.error("Failed to load sales"); return; }
        const res = await resRaw.json();
        setSelectedSales(res.sales ?? []);
      } catch {
        toast.error("Failed to load customer history");
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedCustomerId]);

  // ── All customers balance overview ──
  const allCustomerBalances = useMemo<CustomerWithBalance[]>(() => {
    return customers
      .map((c) => {
        const b = balances[c.id] ?? { opening_balance: c.opening_balance ?? 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: c.opening_balance ?? 0 };
        return { ...c, ...b };
      })
      .sort((a, b) => b.balance_due - a.balance_due);
  }, [customers, balances]);

  const totalOutstanding = useMemo(
    () => allCustomerBalances.reduce((sum, c) => sum + c.balance_due, 0),
    [allCustomerBalances]
  );

  // ── Selected customer detail ──
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === Number(selectedCustomerId)),
    [customers, selectedCustomerId]
  );

  const selectedBalance = useMemo<BalanceRow | null>(
    () => (selectedCustomerId ? balances[Number(selectedCustomerId)] ?? null : null),
    [selectedCustomerId, balances]
  );

  // Group by transaction_group_id for bill numbers
  const groupedSales = useMemo(() => {
    const groupMap = new Map<string, Sale[]>();
    selectedSales.forEach((s) => {
      const key = s.transaction_group_id ?? `solo-${s.id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    });

    const sortedGroups: { billNumber: number; groupId: string; sales: Sale[] }[] = [];
    let billNum = 1;
    groupMap.forEach((sales, groupId) => {
      sortedGroups.push({ billNumber: billNum, groupId, sales });
      billNum++;
    });

    return { sortedGroups };
  }, [selectedSales]);

  // ── Download Bill Handler ──
  const handleDownloadBill = async () => {
    if (!selectedCustomer || selectedSales.length === 0) {
      toast.error("No sales data to generate bill");
      return;
    }
    setDownloading(true);
    try {
      const { generateCustomerBillPDF } = await import("@/lib/generate-customer-bill");
      const bal = selectedBalance ?? { opening_balance: selectedCustomer?.opening_balance ?? 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: selectedCustomer?.opening_balance ?? 0 };
      await generateCustomerBillPDF({
        customer: selectedCustomer,
        sales: selectedSales,
        openingBalance: bal.opening_balance,
        totalBill: bal.total_bill,
        totalCashPaid: bal.total_cash_paid,
        balanceDue: bal.balance_due,
        generatedAt: new Date().toLocaleString("en-PK"),
      });
      toast.success("Bill downloaded successfully!");
    } catch (err) {
      console.error("Bill download error:", err);
      toast.error("Failed to generate bill. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Khata"
        subtitle="Running ledger — balances & transaction history"
      />

      {/* ─── Section 1: All Customers Balance Overview ─── */}
      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-slate-500" />
            <h2 className="text-lg font-bold text-slate-900">
              All Customers — Balance Overview
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Customer
                </th>
                <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Type
                </th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Opening Balance
                </th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Total Billed
                </th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Cash Paid
                </th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Paid in Goods
                </th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">
                  Balance Due
                </th>
              </tr>
            </thead>
            <tbody>
              {allCustomerBalances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No customers found.
                  </td>
                </tr>
              ) : (
                allCustomerBalances.map((c) => {
                  const isOverLimit = c.balance_due >= CREDIT_LIMIT;
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-slate-50 last:border-b-0 transition-colors",
                        isOverLimit
                          ? "bg-red-50 text-red-700"
                          : "hover:bg-slate-50/80"
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={c.type === "credit" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {c.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.opening_balance > 0 ? (
                          <span className="inline-flex flex-col items-end">
                            <span className="tabular-nums font-medium text-amber-700">Rs. {fmt(c.opening_balance)}</span>
                            <span className="text-[0.6rem] text-slate-400 capitalize">{numberToWords(c.opening_balance)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.total_bill} className="items-end" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.total_cash_paid} className="items-end" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.total_goods_value} className="items-end" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountWithWords amount={c.balance_due} className="items-end font-bold" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-sm font-semibold text-slate-500">
              Total Outstanding Across All Customers
            </span>
            <div className="flex flex-col items-end">
              <span className="text-xl font-extrabold text-slate-900">
                Rs. {fmt(totalOutstanding)}
              </span>
              <span className="text-[0.65rem] text-slate-400 capitalize">
                {numberToWords(totalOutstanding)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 2: Individual Customer History ─── */}
      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">
                Customer History
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={selectedCustomerId}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedCustomerId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={handleDownloadBill}
                  disabled={downloading || selectedSales.length === 0}
                >
                  {downloading ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-2" />
                  )}
                  {downloading ? "Generating..." : "Download Bill"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {!selectedCustomerId ? (
          <div className="p-12 text-center text-slate-400">
            <BookOpen className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a customer to view their ledger.</p>
          </div>
        ) : loadingDetail ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Credit limit alert */}
            {selectedBalance && selectedBalance.balance_due >= CREDIT_LIMIT && (
              <Alert className="border-red-200 bg-red-50 text-red-700">
                <AlertTriangle className="size-4 text-red-600" />
                <AlertDescription className="font-semibold">
                  {selectedCustomer?.name} has crossed the credit limit of
                  Rs. {fmt(CREDIT_LIMIT)} ({numberToWords(CREDIT_LIMIT)}).
                </AlertDescription>
              </Alert>
            )}

            {/* Sales table */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                Sales (charges added to their tab)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Bill #</th>
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Date</th>
                      <th className="text-left text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Product</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Qty</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Rate</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Rickshaw</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Bill Amount</th>
                      <th className="text-right text-xs uppercase text-slate-500 font-semibold px-3 py-2.5">Cash Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening Balance — first row, highlighted in amber */}
                    {selectedBalance && selectedBalance.opening_balance > 0 && (
                      <tr className="bg-amber-50/70 border-b border-amber-200">
                        <td className="px-3 py-2.5 font-bold text-amber-800 align-top">—</td>
                        <td className="px-3 py-2.5 text-amber-700 align-top italic text-xs">
                          {selectedCustomer?.created_at?.slice(0, 10) ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-amber-900 font-semibold italic">
                          Opening Balance (purana balance)
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">—</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex flex-col items-end">
                            <span className="tabular-nums font-bold text-amber-800">Rs. {fmt(selectedBalance.opening_balance)}</span>
                            <span className="text-[0.6rem] text-amber-600 capitalize">{numberToWords(selectedBalance.opening_balance)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-700">—</td>
                      </tr>
                    )}
                    {groupedSales.sortedGroups.map((group) =>
                      group.sales.map((sale, idx) => {
                        const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
                        const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
                        return (
                          <tr
                            key={sale.id}
                            className={cn(
                              "border-b border-slate-50 last:border-b-0",
                              idx === group.sales.length - 1 &&
                                group !== groupedSales.sortedGroups[groupedSales.sortedGroups.length - 1] &&
                                "border-b-slate-200"
                            )}
                          >
                            {idx === 0 && (
                              <td className="px-3 py-2.5 font-bold text-slate-700 align-top" rowSpan={group.sales.length}>
                                #{group.billNumber}
                              </td>
                            )}
                            {idx === 0 && (
                              <td className="px-3 py-2.5 text-slate-600 align-top" rowSpan={group.sales.length}>
                                {sale.sale_date}
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-slate-800">
                              {sale.products?.name ?? `Product #${sale.product_id}`}
                              {sale.mix_order_id && (
                                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                                  MIX
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {fmt(sale.quantity)} {unitLabel}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {fmt(sale.rate_per_bag)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {sale.rickshaw_fare > 0 ? fmt(sale.rickshaw_fare) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <AmountWithWords amount={billAmount} className="items-end" />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {sale.cash_received > 0 ? (
                                <AmountWithWords amount={sale.cash_received} className="items-end" />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {selectedSales.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    {selectedBalance && selectedBalance.opening_balance > 0
                      ? "No sales recorded yet — only opening balance is on this customer's tab."
                      : "No sales recorded for this customer."}
                  </div>
                )}
              </div>
            </div>

            {/* Paid in Goods */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                Paid in Goods (reduces their tab)
              </h3>
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-6 text-center text-slate-400 text-sm">
                {selectedBalance && selectedBalance.total_goods_value > 0 ? (
                  <div className="flex flex-col items-center">
                    <span className="text-slate-700 font-medium">Rs. {fmt(selectedBalance.total_goods_value)} in goods settlements recorded.</span>
                    <span className="text-[0.65rem] text-slate-400 capitalize mt-0.5">{numberToWords(selectedBalance.total_goods_value)}</span>
                  </div>
                ) : (
                  "No goods settlements recorded."
                )}
              </div>
            </div>

            {/* Metric Cards */}
            {selectedBalance && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard label="Opening Balance" value={fmt(selectedBalance.opening_balance)} color="amber" prefix="Rs. " words={numberToWords(selectedBalance.opening_balance)} />
                <MetricCard label="Total Billed" value={fmt(selectedBalance.total_bill)} color="blue" prefix="Rs. " words={numberToWords(selectedBalance.total_bill)} />
                <MetricCard label="Cash Paid" value={fmt(selectedBalance.total_cash_paid)} color="green" prefix="Rs. " words={numberToWords(selectedBalance.total_cash_paid)} />
                <MetricCard label="Paid in Goods" value={fmt(selectedBalance.total_goods_value)} color="purple" prefix="Rs. " words={numberToWords(selectedBalance.total_goods_value)} />
                <MetricCard label="Balance Due" value={fmt(selectedBalance.balance_due)} color="orange" prefix="Rs. " words={numberToWords(selectedBalance.balance_due)} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}