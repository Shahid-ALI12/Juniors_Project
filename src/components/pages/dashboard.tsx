"use client";

import { useMemo } from "react";
import {
  FileText,
  FlaskConical,
  BookOpen,
  CheckCircle,
  Package,
  Settings,
} from "lucide-react";
import { useAppStore } from "@/store";
import { mockSales, mockExpenses, mockCustomers } from "@/lib/mock-data";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { CREDIT_LIMIT } from "@/types";

function formatRs(n: number) {
  return n.toLocaleString("en-PK");
}

function getCustomerBalances() {
  const balances: Record<number, number> = {};
  for (const sale of mockSales) {
    const bill = sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
    if (!balances[sale.customer_id]) balances[sale.customer_id] = 0;
    balances[sale.customer_id] += bill - sale.cash_received;
  }
  return balances;
}

const quickLinks = [
  { label: "Add a Sale / Expense", page: "daily-entry", icon: FileText },
  { label: "Build a Custom Mix Bill", page: "custom-mix", icon: FlaskConical },
  { label: "Check Customer's Khata", page: "customer-khata", icon: BookOpen },
  { label: "Reconcile the Day", page: "reconciliation", icon: CheckCircle },
  { label: "Record a Purchase", page: "purchases-stock", icon: Package },
  { label: "Manage Products & Rates", page: "manage-products", icon: Settings },
];

export default function Dashboard() {
  const setActivePage = useAppStore((s) => s.setActivePage);

  const metrics = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todaySales = mockSales.filter((s) => s.sale_date === today);
    const todayExpenses = mockExpenses.filter((e) => e.expense_date === today);

    const salesCount = todaySales.length;
    const totalBilled = todaySales.reduce(
      (sum, s) => sum + s.quantity * s.rate_per_bag + s.rickshaw_fare,
      0
    );
    const cashCollected = todaySales.reduce((sum, s) => sum + s.cash_received, 0);
    const totalExpenses = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    const balances = getCustomerBalances();
    const totalOutstanding = Object.values(balances).reduce((a, b) => a + b, 0);
    const overCreditLimit = Object.values(balances).filter(
      (b) => b > CREDIT_LIMIT
    ).length;

    return {
      salesCount,
      totalBilled,
      cashCollected,
      totalExpenses,
      customerCount: mockCustomers.length,
      totalOutstanding,
      overCreditLimit,
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <PageHeader
          title="Dashboard"
          subtitle={`Daily Register — ${new Date().toLocaleDateString("en-PK", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`}
        />

        {/* ── Primary Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Sales Today"
            value={metrics.salesCount}
            color="blue"
            suffix=" txns"
          />
          <MetricCard
            label="Billed Today"
            value={formatRs(metrics.totalBilled)}
            color="purple"
            prefix="Rs. "
          />
          <MetricCard
            label="Cash Collected"
            value={formatRs(metrics.cashCollected)}
            color="green"
            prefix="Rs. "
          />
          <MetricCard
            label="Expenses Today"
            value={formatRs(metrics.totalExpenses)}
            color="orange"
            prefix="Rs. "
          />
        </div>

        {/* ── Secondary Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            label="Customers"
            value={metrics.customerCount}
            color="blue"
          />
          <MetricCard
            label="Total Outstanding / Khata"
            value={formatRs(metrics.totalOutstanding)}
            color="purple"
            prefix="Rs. "
          />
          <MetricCard
            label="Over Credit Limit"
            value={metrics.overCreditLimit}
            color="orange"
            suffix=" cust."
          />
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
                             hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer
                             text-left w-full"
                >
                  <div
                    className="flex items-center justify-center w-11 h-11 rounded-lg
                                bg-slate-50 group-hover:bg-primary/10 transition-colors duration-200 shrink-0"
                  >
                    <Icon className="w-5 h-5 text-slate-500 group-hover:text-primary transition-colors duration-200" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors duration-200">
                    {link.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}