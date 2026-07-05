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

const fmt = (n: number) => n.toLocaleString("en-PK");

interface BalanceRow {
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

  // Load all customers + their balances
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cus = await fetch("/api/customers").then((r) => r.json());
        setCustomers(cus ?? []);
        const bal = await fetch("/api/reports/customer-balance").then((r) => r.json());
        setBalances(bal ?? {});
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
        const res = await fetch(`/api/sales?customer_id=${selectedCustomerId}`).then((r) => r.json());
        setSelectedSales(res ?? []);
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
        const b = balances[c.id] ?? { total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
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
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
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
                      <td className="px-4 py-3 text-right tabular-nums">
                        Rs. {fmt(c.total_bill)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        Rs. {fmt(c.total_cash_paid)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        Rs. {fmt(c.total_goods_value)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">
                        Rs. {fmt(c.balance_due)}
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
            <span className="text-xl font-extrabold text-slate-900">
              Rs. {fmt(totalOutstanding)}
            </span>
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
                <Button variant="outline" size="sm" className="shrink-0">
                  <Download className="size-4 mr-2" />
                  Download Bill
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
                  ⚠️ {selectedCustomer?.name} has crossed the credit limit of
                  Rs. {fmt(CREDIT_LIMIT)}.
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
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                              Rs. {fmt(billAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {sale.cash_received > 0 ? `Rs. ${fmt(sale.cash_received)}` : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {selectedSales.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    No sales recorded for this customer.
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
                {selectedBalance && selectedBalance.total_goods_value > 0
                  ? `Rs. ${fmt(selectedBalance.total_goods_value)} in goods settlements recorded.`
                  : "No goods settlements recorded."}
              </div>
            </div>

            {/* Metric Cards */}
            {selectedBalance && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Total Billed" value={fmt(selectedBalance.total_bill)} color="blue" prefix="Rs. " />
                <MetricCard label="Cash Paid" value={fmt(selectedBalance.total_cash_paid)} color="green" prefix="Rs. " />
                <MetricCard label="Paid in Goods" value={fmt(selectedBalance.total_goods_value)} color="purple" prefix="Rs. " />
                <MetricCard label="Balance Due" value={fmt(selectedBalance.balance_due)} color="orange" prefix="Rs. " />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
