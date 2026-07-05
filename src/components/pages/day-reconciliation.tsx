"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { mockSales, mockExpenses } from "@/lib/mock-data";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  Banknote,
  Package,
  Receipt,
  CreditCard,
  Wallet,
  TrendingDown,
  TrendingUp,
  Scale,
  AlertCircle,
} from "lucide-react";

function formatRs(n: number) {
  return n.toLocaleString("en-PK");
}

export default function DayReconciliation() {
  const today = new Date().toISOString().split("T")[0];
  const [mode, setMode] = useState<"single" | "range">("single");
  const [singleDate, setSingleDate] = useState(today);
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);

  const dateRange = useMemo(() => {
    if (mode === "single") return { from: singleDate, to: singleDate };
    return { from: rangeFrom, to: rangeTo };
  }, [mode, singleDate, rangeFrom, rangeTo]);

  const filteredSales = useMemo(() => {
    return mockSales.filter((s) => {
      return s.sale_date >= dateRange.from && s.sale_date <= dateRange.to;
    });
  }, [dateRange]);

  const filteredExpenses = useMemo(() => {
    return mockExpenses.filter((e) => {
      return e.expense_date >= dateRange.from && e.expense_date <= dateRange.to;
    });
  }, [dateRange]);

  // --- Calculations ---
  const totalBagsSold = useMemo(
    () =>
      filteredSales
        .filter((s) => s.unit_type === "bags")
        .reduce((acc, s) => acc + s.quantity, 0),
    [filteredSales],
  );

  const totalBilled = useMemo(
    () =>
      filteredSales.reduce(
        (acc, s) => acc + s.quantity * s.rate_per_bag + s.rickshaw_fare,
        0,
      ),
    [filteredSales],
  );

  const cashReceived = useMemo(
    () => filteredSales.reduce((acc, s) => acc + s.cash_received, 0),
    [filteredSales],
  );

  const fromCreditCustomers = useMemo(
    () =>
      filteredSales
        .filter((s) => s.customers?.type === "credit")
        .reduce(
          (acc, s) => acc + s.quantity * s.rate_per_bag + s.rickshaw_fare,
          0,
        ),
    [filteredSales],
  );

  const fromCashCustomers = useMemo(
    () =>
      filteredSales
        .filter((s) => s.customers?.type === "cash")
        .reduce(
          (acc, s) => acc + s.quantity * s.rate_per_bag + s.rickshaw_fare,
          0,
        ),
    [filteredSales],
  );

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((acc, e) => acc + e.amount, 0),
    [filteredExpenses],
  );

  const totalCashIn = cashReceived;
  const totalCashOut = totalExpenses;
  const expectedCashInHand = totalCashIn - totalCashOut;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <PageHeader
          title="Day Reconciliation"
          subtitle="End-of-day cash summary for Danish Cattle Feed — Daily Register"
        />

        {/* ── 1. View Mode ── */}
        <section
          className={cn(
            "bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6",
          )}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Select Period
          </h2>

          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "single" | "range")}
            className="flex flex-wrap gap-4 mb-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="single" id="mode-single" />
              <Label htmlFor="mode-single" className="cursor-pointer">
                Single Day
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="range" id="mode-range" />
              <Label htmlFor="mode-range" className="cursor-pointer">
                Date Range
              </Label>
            </div>
          </RadioGroup>

          <div className="flex flex-wrap gap-4">
            {mode === "single" ? (
              <div className="space-y-1.5">
                <Label htmlFor="single-date" className="text-xs text-slate-500">
                  Date
                </Label>
                <Input
                  id="single-date"
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="w-48"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="range-from" className="text-xs text-slate-500">
                    From
                  </Label>
                  <Input
                    id="range-from"
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="w-48"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="range-to" className="text-xs text-slate-500">
                    To
                  </Label>
                  <Input
                    id="range-to"
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="w-48"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── 2. Income Summary ── */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Income Summary
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Total Bags Sold"
              value={formatRs(totalBagsSold)}
              suffix=" bags"
              color="blue"
            />
            <MetricCard
              label="Total Billed"
              value={formatRs(totalBilled)}
              prefix="Rs. "
              color="purple"
            />
            <MetricCard
              label="Cash Actually Received"
              value={formatRs(cashReceived)}
              prefix="Rs. "
              color="green"
            />
          </div>
        </section>

        {/* ── 3. Credit vs Cash Breakdown ── */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Credit vs Cash Breakdown
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard
              label="From Credit Customers"
              value={formatRs(fromCreditCustomers)}
              prefix="Rs. "
              color="orange"
            />
            <MetricCard
              label="From Cash Customers"
              value={formatRs(fromCashCustomers)}
              prefix="Rs. "
              color="green"
            />
          </div>
        </section>

        {/* ── 4. Expenses Summary ── */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Expenses Summary
          </h2>

          <div className="mb-4">
            <MetricCard
              label="Total Expenses"
              value={formatRs(totalExpenses)}
              prefix="Rs. "
              color="orange"
            />
          </div>

          <div
            className={cn(
              "bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden",
            )}
          >
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right pr-4">Amount (Rs.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center py-8 text-slate-400"
                      >
                        No expenses recorded for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="pl-4 text-slate-600">
                          {e.expense_date}
                        </TableCell>
                        <TableCell className="text-slate-700 font-medium">
                          {e.description}
                        </TableCell>
                        <TableCell className="text-right pr-4 font-semibold text-slate-900">
                          {formatRs(e.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        {/* ── 5. Net Cash Position ── */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Net Cash Position
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Total Cash In"
              value={formatRs(totalCashIn)}
              prefix="Rs. "
              color="green"
            />
            <MetricCard
              label="Total Cash Out / Expenses"
              value={formatRs(totalCashOut)}
              prefix="Rs. "
              color="orange"
            />
            <MetricCard
              label="Expected Cash in Hand"
              value={formatRs(expectedCashInHand)}
              prefix="Rs. "
              color={expectedCashInHand >= 0 ? "blue" : "orange"}
            />
          </div>
        </section>

        {/* ── Note ── */}
        <div
          className={cn(
            "flex items-start gap-3 bg-amber-50 border border-amber-200/60 rounded-2xl p-4 text-sm text-amber-800",
          )}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Note:</span>{' '}
            &apos;Cash Received&apos; only counts money actually collected.
            Credit sales not yet paid stay on the customer&apos;s Khata balance.
          </p>
        </div>
      </main>
    </div>
  );
}