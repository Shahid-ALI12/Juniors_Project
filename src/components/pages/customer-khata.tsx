"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { CREDIT_LIMIT } from "@/types";
import type { Customer, Sale } from "@/types";
import {
  AlertTriangle,
  Download,
  BookOpen,
  Users,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  FileJson,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { numberToWords } from "@/lib/number-to-words";
import {
  useCustomers,
  useCustomersPaginated,
  useCustomerBalance,
  useSalesPaginated,
} from "@/hooks/queries";
import { downloadJson, downloadAllJson } from "@/lib/download-json";

const fmt = (n: number) => n.toLocaleString("en-PK");
const PAGE_SIZE = 10;

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
  const [expandedMixOrders, setExpandedMixOrders] = useState<Set<string>>(new Set());

  // ── Section 1: All Customers list (paginated + server-side search) ──
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [customerPage, setCustomerPage] = useState(1);

  // Debounce search input by 350ms so we don't hammer the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(searchInput);
      setCustomerPage(1); // reset to page 1 on new search
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Paginated + searchable customers list for Section 1 table
  const customersQ = useCustomersPaginated(
    { activeOnly: false, search: searchDebounced },
    customerPage,
    PAGE_SIZE,
  );

  // All active customers — used for the Section 2 dropdown (small, OK to fetch all)
  const allActiveQ = useCustomers(true);

  // Customer balances map (customerId → BalanceRow) — fetched once
  const balancesQ = useCustomerBalance();
  const balances: Record<number, BalanceRow> = useMemo(() => {
    const d = balancesQ.data;
    if (!d) return {};
    return typeof d === "object" && !Array.isArray(d) ? (d as Record<number, BalanceRow>) : {};
  }, [balancesQ.data]);

  // ── Section 2: Per-customer sales history (paginated) ──
  const [salesPage, setSalesPage] = useState(1);
  useEffect(() => { setSalesPage(1); }, [selectedCustomerId]);

  const salesQ = useSalesPaginated(
    selectedCustomerId ? { customer_id: Number(selectedCustomerId) } : {},
    salesPage,
    PAGE_SIZE,
  );

  const [downloadingBill, setDownloadingBill] = useState(false);
  const [downloadingCustomers, setDownloadingCustomers] = useState(false);
  const [downloadingSales, setDownloadingSales] = useState(false);

  // Toggle expand/collapse for a mix order group
  const toggleMixOrder = (mixOrderId: string) => {
    setExpandedMixOrders((prev) => {
      const next = new Set(prev);
      if (next.has(mixOrderId)) next.delete(mixOrderId);
      else next.add(mixOrderId);
      return next;
    });
  };

  // ── Section 1: paginated customers merged with balances ──
  const pagedCustomers: CustomerWithBalance[] = useMemo(() => {
    const list = customersQ.data?.customers ?? [];
    return list.map((c: any) => {
      const b = balances[c.id] ?? {
        opening_balance: c.opening_balance ?? 0,
        total_bill: 0,
        total_cash_paid: 0,
        total_goods_value: 0,
        balance_due: c.opening_balance ?? 0,
      };
      return { ...c, ...b } as CustomerWithBalance;
    })
    .sort((a, b) => b.balance_due - a.balance_due);
  }, [customersQ.data, balances]);

  // Total outstanding across ALL customers (computed from balances map, not paged list)
  const totalOutstanding = useMemo(
    () => Object.values(balances).reduce((sum, b) => sum + (b?.balance_due ?? 0), 0),
    [balances],
  );

  // ── Section 2: selected customer detail ──
  const allActiveCustomers: Customer[] = useMemo(
    () => (allActiveQ.data?.customers ?? []) as Customer[],
    [allActiveQ.data],
  );

  const selectedCustomer = useMemo(
    () => allActiveCustomers.find((c) => c.id === Number(selectedCustomerId)),
    [allActiveCustomers, selectedCustomerId],
  );

  const selectedBalance = useMemo<BalanceRow | null>(
    () => (selectedCustomerId ? balances[Number(selectedCustomerId)] ?? null : null),
    [selectedCustomerId, balances],
  );

  const pagedSales: Sale[] = useMemo(
    () => (salesQ.data?.sales ?? []) as Sale[],
    [salesQ.data],
  );

  // Group by transaction_group_id for bill numbers
  const groupedSales = useMemo(() => {
    const groupMap = new Map<string, Sale[]>();
    pagedSales.forEach((s) => {
      const key = s.transaction_group_id ?? `solo-${s.id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    });

    const sortedGroups: { billNumber: number; groupId: string; sales: Sale[] }[] = [];
    let billNum = 1;
    // Sort groups by earliest sale date in each group (oldest first) for stable bill numbers
    const groupsArr = Array.from(groupMap.entries());
    groupsArr.sort((a, b) => {
      const aDate = a[1][0]?.sale_date ?? "";
      const bDate = b[1][0]?.sale_date ?? "";
      return aDate.localeCompare(bDate);
    });
    for (const [groupId, sales] of groupsArr) {
      sortedGroups.push({ billNumber: billNum, groupId, sales });
      billNum++;
    }

    return { sortedGroups };
  }, [pagedSales]);

  // ── Download Bill Handler (single PDF for selected customer) ──
  const handleDownloadBill = async () => {
    if (!selectedCustomer) {
      toast.error("Select a customer first");
      return;
    }
    setDownloadingBill(true);
    try {
      // Fetch ALL sales for the bill (not just current page) — bill should be complete
      const allSalesRes = await fetch(`/api/sales?customer_id=${selectedCustomerId}`);
      if (!allSalesRes.ok) { toast.error("Failed to fetch sales for bill"); return; }
      const allSalesJson = await allSalesRes.json();
      const allSales: Sale[] = allSalesJson.sales ?? [];
      if (allSales.length === 0) {
        toast.error("No sales data to generate bill");
        return;
      }
      const { generateCustomerBillPDF } = await import("@/lib/generate-customer-bill");
      const bal = selectedBalance ?? {
        opening_balance: selectedCustomer?.opening_balance ?? 0,
        total_bill: 0,
        total_cash_paid: 0,
        total_goods_value: 0,
        balance_due: selectedCustomer?.opening_balance ?? 0,
      };
      await generateCustomerBillPDF({
        customer: selectedCustomer,
        sales: allSales,
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
      setDownloadingBill(false);
    }
  };

  // ── Download ALL customers + balances as JSON ──
  const handleDownloadAllCustomersJson = async () => {
    setDownloadingCustomers(true);
    try {
      // Walk all pages of /api/customers (no search filter = all records)
      const allCustomers = await downloadAllJson(
        "/api/customers",
        {},
        "tmp-customers", // placeholder, we'll re-download merged below
        "customers",
      );
      // Merge with balances
      const merged = allCustomers.map((c: any) => ({
        ...c,
        ...(balances[c.id] ?? {
          opening_balance: c.opening_balance ?? 0,
          total_bill: 0,
          total_cash_paid: 0,
          total_goods_value: 0,
          balance_due: c.opening_balance ?? 0,
        }),
      }));
      downloadJson(
        {
          generatedAt: new Date().toISOString(),
          totalRecords: merged.length,
          totalOutstanding,
          customers: merged,
        },
        "all-customers-with-balances.json",
      );
      toast.success(`Downloaded ${merged.length} customers`);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error(err?.message || "Failed to download customers");
    } finally {
      setDownloadingCustomers(false);
    }
  };

  // ── Download ALL sales for selected customer as JSON ──
  const handleDownloadSalesJson = async () => {
    if (!selectedCustomerId) {
      toast.error("Select a customer first");
      return;
    }
    setDownloadingSales(true);
    try {
      await downloadAllJson(
        "/api/sales",
        { customer_id: selectedCustomerId },
        `customer-${selectedCustomerId}-sales.json`,
        "sales",
      );
      toast.success("Sales JSON downloaded");
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error(err?.message || "Failed to download sales");
    } finally {
      setDownloadingSales(false);
    }
  };

  const loadingCustomers = customersQ.isLoading && !customersQ.data;
  const loadingSales = salesQ.isLoading && !salesQ.data;
  const isSearchActive = searchDebounced.trim().length > 0;
  const noCustomersMatch = isSearchActive && (customersQ.data?.customers?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Khata"
        subtitle="Running ledger — balances & transaction history"
      />

      {/* ─── Section 1: All Customers Balance Overview ─── */}
      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">
                All Customers — Balance Overview
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by customer name or phone..."
                  className="pl-8 w-full sm:w-72 h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllCustomersJson}
                disabled={downloadingCustomers}
                className="shrink-0"
              >
                {downloadingCustomers ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <FileJson className="size-4 mr-1.5" />
                )}
                {downloadingCustomers ? "Downloading..." : "Download JSON"}
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Customer</th>
                <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Type</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Opening Balance</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Total Billed</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Cash Paid</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Paid in Goods</th>
                <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {loadingCustomers ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2 className="size-5 animate-spin text-slate-400 inline-block mr-2" />
                    <span className="text-slate-400">Loading customers...</span>
                  </td>
                </tr>
              ) : noCustomersMatch ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    <Search className="size-8 mx-auto mb-2 opacity-30" />
                    No record for the customer &quot;{searchDebounced}&quot;.
                  </td>
                </tr>
              ) : pagedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No customers found.
                  </td>
                </tr>
              ) : (
                pagedCustomers.map((c) => {
                  const isOverLimit = c.balance_due >= CREDIT_LIMIT;
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-slate-50 last:border-b-0 transition-colors",
                        isOverLimit ? "bg-red-50 text-red-700" : "hover:bg-slate-50/80",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.type === "credit" ? "default" : "secondary"} className="text-xs">
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

        {/* Pagination footer */}
        {!noCustomersMatch && (customersQ.data?.total ?? 0) > 0 && (
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-500">
                  Total Outstanding Across All Customers
                </span>
                <div className="flex flex-col">
                  <span className="text-xl font-extrabold text-slate-900">
                    Rs. {fmt(totalOutstanding)}
                  </span>
                  <span className="text-[0.65rem] text-slate-400 capitalize">
                    {numberToWords(totalOutstanding)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  Page {customersQ.data?.page ?? 1} of {customersQ.data?.totalPages ?? 1}
                  {" · "}
                  {customersQ.data?.total ?? 0} customers
                  {isSearchActive ? ` matching "${searchDebounced}"` : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(customersQ.data?.page ?? 1) <= 1 || customersQ.isFetching}
                    onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      (customersQ.data?.page ?? 1) >= (customersQ.data?.totalPages ?? 1) ||
                      customersQ.isFetching
                    }
                    onClick={() => setCustomerPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
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
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {allActiveCustomers
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
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleDownloadSalesJson}
                    disabled={downloadingSales}
                  >
                    {downloadingSales ? (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    ) : (
                      <FileJson className="size-4 mr-1.5" />
                    )}
                    {downloadingSales ? "Downloading..." : "Download JSON"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleDownloadBill}
                    disabled={downloadingBill}
                  >
                    {downloadingBill ? (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-1.5" />
                    )}
                    {downloadingBill ? "Generating..." : "Download Bill"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {!selectedCustomerId ? (
          <div className="p-12 text-center text-slate-400">
            <BookOpen className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a customer to view their ledger.</p>
          </div>
        ) : loadingSales ? (
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
                    {selectedBalance && selectedBalance.opening_balance > 0 && salesPage === 1 && (
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
                    {groupedSales.sortedGroups.map((group, groupIdx) => {
                      const firstSale = group.sales[0];
                      const isMixOrder = group.sales.some((s) => s.mix_order_id);
                      const isLastGroup = groupIdx === groupedSales.sortedGroups.length - 1;

                      // ─── Mix Order: collapsed summary row + expandable sub-rows ───
                      if (isMixOrder) {
                        const mixOrderId = String(firstSale.mix_order_id);
                        const isExpanded = expandedMixOrders.has(mixOrderId);
                        const totalRickshaw = group.sales.reduce((sum, s) => sum + s.rickshaw_fare, 0);
                        const totalBillAmount = group.sales.reduce(
                          (sum, s) => sum + (s.quantity * s.rate_per_bag + s.rickshaw_fare),
                          0,
                        );
                        const totalCashReceived = group.sales.reduce((sum, s) => sum + s.cash_received, 0);
                        return (
                          <Fragment key={group.groupId}>
                            <tr
                              className={cn(
                                "border-b border-slate-50 cursor-pointer hover:bg-slate-50/80 transition-colors",
                                !isLastGroup && "border-b-slate-200",
                              )}
                              onClick={() => toggleMixOrder(mixOrderId)}
                            >
                              <td className="px-3 py-2.5 font-bold text-slate-700 align-top">#{group.billNumber}</td>
                              <td className="px-3 py-2.5 text-slate-600 align-top">{firstSale.sale_date}</td>
                              <td className="px-3 py-2.5 text-slate-800">
                                <span className="inline-flex items-center gap-1.5">
                                  <ChevronDown
                                    className={cn(
                                      "size-4 text-slate-400 transition-transform",
                                      isExpanded && "rotate-180",
                                    )}
                                  />
                                  <span className="font-semibold">Mix Order</span>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    MIX
                                  </Badge>
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">—</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">—</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {totalRickshaw > 0 ? fmt(totalRickshaw) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <AmountWithWords amount={totalBillAmount} className="items-end" />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {totalCashReceived > 0 ? (
                                  <AmountWithWords amount={totalCashReceived} className="items-end" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                            {isExpanded &&
                              group.sales.map((sale) => {
                                const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
                                const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
                                return (
                                  <tr key={sale.id} className="border-b border-slate-50 bg-slate-50/40">
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2 text-slate-600">
                                      <span className="inline-flex items-center gap-1.5 pl-6">
                                        <span className="text-slate-300">↳</span>
                                        {sale.products?.name ?? `Product #${sale.product_id}`}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                      {fmt(sale.quantity)} {unitLabel}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                      {fmt(sale.rate_per_bag)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                      {sale.rickshaw_fare > 0 ? fmt(sale.rickshaw_fare) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <AmountWithWords amount={billAmount} className="items-end" />
                                    </td>
                                    <td className="px-3 py-2 text-right text-slate-300">—</td>
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      }

                      // ─── Solo Sale: single row (no expansion) ───
                      const sale = firstSale;
                      const billAmount = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
                      const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
                      return (
                        <tr
                          key={sale.id}
                          className={cn(
                            "border-b border-slate-50 last:border-b-0",
                            !isLastGroup && "border-b-slate-200",
                          )}
                        >
                          <td className="px-3 py-2.5 font-bold text-slate-700 align-top">#{group.billNumber}</td>
                          <td className="px-3 py-2.5 text-slate-600 align-top">{sale.sale_date}</td>
                          <td className="px-3 py-2.5 text-slate-800">
                            {sale.products?.name ?? `Product #${sale.product_id}`}
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
                    })}
                  </tbody>
                </table>
                {pagedSales.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    {selectedBalance && selectedBalance.opening_balance > 0
                      ? "No sales recorded yet — only opening balance is on this customer's tab."
                      : "No sales recorded for this customer."}
                  </div>
                )}
              </div>

              {/* Pagination controls for sales history */}
              {(salesQ.data?.total ?? 0) > 0 && (
                <div className="mt-3 flex items-center justify-end gap-3">
                  <span className="text-xs text-slate-500">
                    Page {salesQ.data?.page ?? 1} of {salesQ.data?.totalPages ?? 1}
                    {" · "}
                    {salesQ.data?.total ?? 0} sales total
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(salesQ.data?.page ?? 1) <= 1 || salesQ.isFetching}
                      onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        (salesQ.data?.page ?? 1) >= (salesQ.data?.totalPages ?? 1) ||
                        salesQ.isFetching
                      }
                      onClick={() => setSalesPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
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
