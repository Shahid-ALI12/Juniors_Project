"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuthStore } from "@/store";
import type { AppCustomer } from "@/types";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  CheckCircle,
  Package,
  Settings,
  FlaskConical,
  Landmark,
  LogOut,
  Milk,
  User,
  CalendarDays,
  Clock,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Dashboard = dynamic(() => import("@/components/pages/dashboard"), { ssr: false });
const DailyEntry = dynamic(() => import("@/components/pages/daily-entry"), { ssr: false });
const CustomerKhata = dynamic(() => import("@/components/pages/customer-khata"), { ssr: false });
const DayReconciliation = dynamic(() => import("@/components/pages/day-reconciliation"), { ssr: false });
const CashManagement = dynamic(() => import("@/components/pages/cash-management"), { ssr: false });
const ManageProducts = dynamic(() => import("@/components/pages/manage-products"), { ssr: false });
const PurchasesStock = dynamic(() => import("@/components/pages/purchases-stock"), { ssr: false });
const CustomMixOrder = dynamic(() => import("@/components/pages/custom-mix-order"), { ssr: false });

const pageMap: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  "daily-entry": DailyEntry,
  "customer-khata": CustomerKhata,
  reconciliation: DayReconciliation,
  "cash-mgmt": CashManagement,
  "manage-products": ManageProducts,
  "purchases-stock": PurchasesStock,
  "custom-mix": CustomMixOrder,
};

const navSections = [
  {
    label: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Daily Operations",
    items: [
      { id: "daily-entry", label: "Daily Entry", icon: FileText },
      { id: "custom-mix", label: "Custom Mix Order", icon: FlaskConical },
      { id: "reconciliation", label: "Day Reconciliation", icon: CheckCircle },
      { id: "cash-mgmt", label: "Cash Management", icon: Landmark },
    ],
  },
  {
    label: "Customers",
    items: [{ id: "customer-khata", label: "Customer Khata", icon: BookOpen }],
  },
  {
    label: "Inventory",
    items: [
      { id: "purchases-stock", label: "Purchases & Stock", icon: Package },
      { id: "manage-products", label: "Manage Products", icon: Settings },
    ],
  },
];

export default function CustomerPortal() {
  const [customer, setCustomer] = useState<AppCustomer | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { logoutCustomer } = useCustomerAuthStore();
  const { activePage, setActivePage } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    const session = localStorage.getItem("customer_session");
    if (!session) {
      router.replace("/customer/login");
      return;
    }
    const parsed = JSON.parse(session) as AppCustomer;
    if (new Date(parsed.subscription_end) <= new Date() || !parsed.is_active) {
      toast.error("Aapki subscription expire/block ho gayi hai");
      localStorage.removeItem("customer_session");
      router.replace("/customer/login");
      return;
    }
    setCustomer(parsed);
  }, [router]);

  const handleLogout = () => {
    setLoggingOut(true);
    logoutCustomer();
    localStorage.removeItem("customer_session");
    toast.success("Logout ho gaye");
    router.replace("/customer/login");
  };

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const daysRemaining = Math.ceil(
    (new Date(customer.subscription_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const progressPercent = (() => {
    const total = new Date(customer.subscription_end).getTime() - new Date(customer.subscription_start).getTime();
    const elapsed = Date.now() - new Date(customer.subscription_start).getTime();
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  })();

  const PageComponent = pageMap[activePage] || Dashboard;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Mobile hamburger ─── */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white text-slate-800 p-2.5 rounded-xl shadow-lg border border-slate-200 cursor-pointer"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ─── Mobile overlay ─── */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ─── Sidebar ─── */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 transition-transform duration-200 lg:translate-x-0",
          "bg-gradient-to-b from-[#101a2e] to-[#0b1322] border-r border-white/[0.06]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 h-screen flex flex-col overflow-hidden">
          {/* Brand */}
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.08] shrink-0">
            <div className="w-10 h-10 min-w-[2.5rem] rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg shadow-lg shadow-emerald-500/30">
              🐄
            </div>
            <div>
              <div className="text-white font-extrabold text-sm leading-tight">Danish Cattle Feed</div>
              <div className="text-slate-500 text-xs font-medium">Daily Register</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-5 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="text-[0.68rem] font-bold tracking-wider uppercase text-slate-600 mb-1.5 ml-2">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActivePage(item.id); setMobileOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                          isActive
                            ? "bg-emerald-600/20 text-white font-medium"
                            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                        )}
                      >
                        <Icon size={18} className={isActive ? "text-emerald-400" : ""} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer - Customer Info + Logout */}
          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 min-w-[2rem] rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-semibold truncate">{customer.name}</div>
                <div className="text-slate-500 text-[0.65rem]">Customer</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              <LogOut size={18} />
              {loggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 pt-6 lg:p-8 lg:pt-8 max-w-[1400px] mx-auto">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 sm:p-6 text-white mb-6 shadow-lg shadow-emerald-500/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-100 text-sm mb-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Subscription Active
                </div>
                <h1 className="text-xl sm:text-2xl font-bold">
                  Welcome, {customer.name}!
                </h1>
                <p className="text-emerald-100 mt-0.5 text-sm">
                  Aap ka account active hai. Aap apna data dekh sakte hain.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center">
                  <div className="text-2xl font-bold">{daysRemaining}</div>
                  <div className="text-emerald-100 text-[0.65rem] mt-0.5">Days Left</div>
                </div>
                {daysRemaining <= 7 && (
                  <div className="hidden sm:flex items-center gap-2 bg-amber-500/20 backdrop-blur rounded-xl px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-300" />
                    <span className="text-xs text-amber-200">Jaldi expire hogi</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Page Content */}
          <PageComponent />
        </div>
      </main>
    </div>
  );
}