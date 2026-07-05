"use client";

import { useMemo, useEffect, useState } from "react";
import {
  FileText, FlaskConical, BookOpen, CheckCircle,
  Package, Settings, Loader2,
} from "lucide-react";
import { useAppStore } from "@/store";
import { PageHeader, MetricCard } from "@/components/shared/page-header";

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

export default function Dashboard() {
  const setActivePage = useAppStore((s) => s.setActivePage);
  const [metrics, setMetrics] = useState<Metrics>(defaultMetrics);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <PageHeader
          title="Dashboard"
          subtitle={`Daily Register — ${new Date().toLocaleDateString("en-PK", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}`}
        />

        {/* ── Primary Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Sales Today" value={metrics.salesTodayCount} color="blue" suffix=" txns" />
          <MetricCard label="Billed Today" value={formatRs(metrics.billedToday)} color="purple" prefix="Rs. " />
          <MetricCard label="Cash Collected" value={formatRs(metrics.cashCollectedToday)} color="green" prefix="Rs. " />
          <MetricCard label="Expenses Today" value={formatRs(metrics.expensesToday)} color="orange" prefix="Rs. " />
        </div>

        {/* ── Secondary Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard label="Customers" value={metrics.totalCustomers} color="blue" />
          <MetricCard label="Total Outstanding / Khata" value={formatRs(metrics.totalOutstanding)} color="purple" prefix="Rs. " />
          <MetricCard label="Over Credit Limit" value={metrics.overCreditLimitCount} color="orange" suffix=" cust." />
        </div>

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
