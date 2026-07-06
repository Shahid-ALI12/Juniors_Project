"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  FileText, FlaskConical, BookOpen, CheckCircle,
  Package, Settings, Loader2, ChevronDown, ChevronUp, X, Download,
} from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const quickLinks = [
  { label: "Add a Sale / Expense", page: "daily-entry", icon: FileText },
  { label: "Build a Custom Mix Bill", page: "custom-mix", icon: FlaskConical },
  { label: "Check Customer's Khata", page: "customer-khata", icon: BookOpen },
  { label: "Reconcile the Day", page: "reconciliation", icon: CheckCircle },
  { label: "Record a Purchase", page: "purchases-stock", icon: Package },
  { label: "Manage Products & Rates", page: "manage-products", icon: Settings },
];

function formatRs(n: number) {
  return n.toLocaleString("en-PK");
}

interface Metrics {
  salesTodayCount: number;
  billedToday: number;
  cashCollectedToday: number;
  expensesToday: number;
  totalCustomers: number;
  totalOutstanding: number;
  overCreditLimitCount: number;
}

const defaultMetrics: Metrics = {
  salesTodayCount: 0, billedToday: 0, cashCollectedToday: 0, expensesToday: 0,
  totalCustomers: 0, totalOutstanding: 0, overCreditLimitCount: 0,
};

type CardKey = "sales-today" | "billed-today" | "cash-collected" | "expenses-today" | "customers" | "outstanding" | "over-credit";

/* ─── Column definitions for each card type ─── */
type Col = { key: string; label: string; align?: "left" | "right"; fmt?: (v: any) => string };

const columnsMap: Record<CardKey, Col[]> = {
  "sales-today": [
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "location", label: "Location" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "rate", label: "Rate", align: "right", fmt: (v) => formatRs(v) },
    { key: "fare", label: "Fare", align: "right", fmt: (v) => formatRs(v) },
    { key: "amount", label: "Amount", align: "right", fmt: (v) => formatRs(v) },
  ],
  "billed-today": [
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "bill", label: "Bill", align: "right", fmt: (v) => formatRs(v) },
    { key: "cash_paid", label: "Cash Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance", align: "right", fmt: (v) => formatRs(v) },
  ],
  "cash-collected": [
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "cash", label: "Cash (Rs.)", align: "right", fmt: (v) => formatRs(v) },
  ],
  "expenses-today": [
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", align: "right", fmt: (v) => formatRs(v) },
  ],
  "customers": [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "phone", label: "Phone" },
    { key: "active", label: "Status", fmt: (v) => v ? "Active" : "Inactive" },
    { key: "credit_limit", label: "Credit Limit", align: "right", fmt: (v) => v ? formatRs(v) : "N/A" },
    { key: "since", label: "Since" },
  ],
  "outstanding": [
    { key: "customer", label: "Customer" },
    { key: "phone", label: "Phone" },
    { key: "type", label: "Type" },
    { key: "total_bill", label: "Total Bill", align: "right", fmt: (v) => formatRs(v) },
    { key: "paid", label: "Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance Due", align: "right", fmt: (v) => formatRs(v) },
  ],
  "over-credit": [
    { key: "customer", label: "Customer" },
    { key: "phone", label: "Phone" },
    { key: "credit_limit", label: "Limit", align: "right", fmt: (v) => formatRs(v) },
    { key: "total_bill", label: "Total Bill", align: "right", fmt: (v) => formatRs(v) },
    { key: "paid", label: "Paid", align: "right", fmt: (v) => formatRs(v) },
    { key: "balance", label: "Balance Due", align: "right", fmt: (v) => formatRs(v) },
  ],
};

/* ─── Color mapping ─── */
const cardColors: Record<string, { border: string; text: string; bg: string; badge: string }> = {
  blue: { border: "border-t-blue-500", text: "text-blue-600", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700" },
  purple: { border: "border-t-purple-500", text: "text-purple-600", bg: "bg-purple-50", badge: "bg-purple-100 text-purple-700" },
  green: { border: "border-t-green-500", text: "text-green-600", bg: "bg-green-50", badge: "bg-green-100 text-green-700" },
  orange: { border: "border-t-orange-500", text: "text-orange-600", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-700" },
};

/* ─── Card label lookup (outside component to avoid reference issues) ─── */
const cardLabels: Record<CardKey, string> = {
  "sales-today": "Sales Today",
  "billed-today": "Billed Today",
  "cash-collected": "Cash Collected",
  "expenses-today": "Expenses Today",
  "customers": "Customers",
  "outstanding": "Total Outstanding / Khata",
  "over-credit": "Over Credit Limit",
};

/* ─── Excel download helper ─── */
function downloadExcel(rows: Record<string, any>[], cols: Col[], fileName: string) {
  const headers = cols.map(c => c.label);
  const data = rows.map(row => cols.map(c => {
    const raw = row[c.key];
    return c.fmt ? c.fmt(raw) : String(raw ?? "");
  }));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  XLSX.writeFile(wb, `${fileName.replace(/\s+/g, "_")}.xlsx`);
}

export default function Dashboard() {
  const setActivePage = useAppStore((s) => s.setActivePage);
  const [metrics, setMetrics] = useState<Metrics>(defaultMetrics);
  const [loading, setLoading] = useState(true);

  // Detail panel state
  const [activeCard, setActiveCard] = useState<CardKey | null>(null);
  const [detailRows, setDetailRows] = useState<Record<string, any>[]>([]);
  const [detailLabel, setDetailLabel] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  // Use PKT (Asia/Karachi) date so it matches what the user sees
  const pktDate = useMemo(() => {
    const d = new Date();
    return new Date(d.getTime() + (5 * 60 + 30) * 60000).toISOString().split("T")[0];
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/reports/dashboard");
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch {
        // silently fail — shows zeros
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const fetchDetails = useCallback(async (cardKey: CardKey) => {
    // If same card clicked, close panel
    if (activeCard === cardKey) {
      setActiveCard(null);
      setDetailRows([]);
      setDetailLabel("");
      return;
    }

    setActiveCard(cardKey);
    setDetailLoading(true);
    setDetailRows([]);
    // Set label immediately from card definition (not API) to prevent stale label
    setDetailLabel(cardLabels[cardKey] || cardKey);
    try {
      const res = await fetch(`/api/reports/dashboard/details?type=${cardKey}&date=${pktDate}`);
      if (res.ok) {
        const data = await res.json();
        setDetailRows(data.rows || []);
        if (data.label) setDetailLabel(data.label);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Dashboard details API error:", err);
      }
    } catch (err) {
      console.error("Dashboard details fetch error:", err);
      setDetailRows([]);
    } finally {
      setDetailLoading(false);
    }
  }, [activeCard, pktDate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const cards: { key: CardKey; label: string; value: string; color: string }[] = [
    { key: "sales-today", label: "Sales Today", value: `${metrics.salesTodayCount} txns`, color: "blue" },
    { key: "billed-today", label: "Billed Today", value: formatRs(metrics.billedToday), color: "purple" },
    { key: "cash-collected", label: "Cash Collected", value: formatRs(metrics.cashCollectedToday), color: "green" },
    { key: "expenses-today", label: "Expenses Today", value: formatRs(metrics.expensesToday), color: "orange" },
    { key: "customers", label: "Customers", value: `${metrics.totalCustomers}`, color: "blue" },
    { key: "outstanding", label: "Total Outstanding / Khata", value: formatRs(metrics.totalOutstanding), color: "purple" },
    { key: "over-credit", label: "Over Credit Limit", value: `${metrics.overCreditLimitCount} cust.`, color: "orange" },
  ];

  const cols = activeCard ? columnsMap[activeCard] : [];

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              Daily Register — {new Date().toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>

        {/* ── Primary Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.slice(0, 4).map((card) => (
            <DashboardCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
          ))}
        </div>

        {/* ── Secondary Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.slice(4).map((card) => (
            <DashboardCard key={card.key} card={card} isActive={activeCard === card.key} onClick={() => fetchDetails(card.key)} />
          ))}
        </div>

        {/* ── Detail Panel ── */}
        {activeCard && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-8 rounded-full", cardColors[cards.find(c => c.key === activeCard)?.color || "blue"]?.bg)} />
                <div>
                  <h3 className="text-base font-bold text-slate-800">{detailLabel}</h3>
                  <p className="text-xs text-slate-400">{detailRows.length} records</p>
                </div>
              </div>
              <button
                onClick={() => { setActiveCard(null); setDetailRows([]); }}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Panel Body */}
            <div className="max-h-[420px] overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="ml-2 text-sm text-slate-400">Loading...</span>
                </div>
              ) : detailRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <FileText className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No records found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      {cols.map((col) => (
                        <TableHead
                          key={col.key}
                          className={cn(
                            "text-xs uppercase text-slate-500 font-semibold",
                            col.align === "right" ? "text-right" : "text-left"
                          )}
                        >
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((row, idx) => (
                      <TableRow key={row.id || idx} className="text-sm">
                        {cols.map((col) => (
                          <TableCell
                            key={col.key}
                            className={cn(
                              "text-slate-700",
                              col.align === "right" ? "text-right font-medium" : "",
                              col.key === "balance" && row.balance > 0 ? "text-red-600 font-semibold" : "",
                              col.key === "balance" && row.balance <= 0 ? "text-green-600" : "",
                            )}
                          >
                            {col.fmt ? col.fmt(row[col.key]) : String(row[col.key] ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Download Excel button */}
            {!detailLoading && detailRows.length > 0 && (
              <div className="flex justify-end px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                <button
                  onClick={() => downloadExcel(detailRows, cols, detailLabel)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-600 bg-white border border-slate-200 rounded-lg px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Excel ({detailRows.length} records)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Quick Links ── */}
        <section>
          <h2 className="text-lg font-bold text-slate-700 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.page}
                  onClick={() => setActivePage(link.page)}
                  className="group flex items-center gap-4 bg-white rounded-xl p-4 border border-slate-200
                             hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer text-left w-full"
                >
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-slate-50 group-hover:bg-primary/10 transition-colors shrink-0">
                    <Icon className="w-5 h-5 text-slate-500 group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">{link.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Clickable Metric Card ─── */
function DashboardCard({
  card,
  isActive,
  onClick,
}: {
  card: { key: CardKey; label: string; value: string; color: string };
  isActive: boolean;
  onClick: () => void;
}) {
  const colors = cardColors[card.color] || cardColors.blue;

  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl p-5 border border-slate-100 border-t-[3px] shadow-sm text-left w-full transition-all duration-200 cursor-pointer group",
        colors.border,
        isActive
          ? "ring-2 ring-emerald-400 ring-offset-1 shadow-md scale-[1.02]"
          : "hover:shadow-md hover:scale-[1.01]"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-600 transition-colors truncate">
            {card.label}
          </div>
          <div className={cn("text-2xl font-extrabold text-slate-900 mt-1 truncate", colors.text)}>
            {card.value}
          </div>
        </div>
        <div className={cn(
          "flex-shrink-0 ml-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200",
          isActive ? "bg-emerald-100 text-emerald-600 rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-500"
        )}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {isActive && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", colors.badge)}>
            Showing details
          </span>
        </div>
      )}
    </button>
  );
}