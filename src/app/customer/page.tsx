"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AppCustomer } from "@/types";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useAppStore, masterCache } from "@/store";
import {
  LayoutDashboard, FileText, BookOpen, CheckCircle,
  Package, Settings, FlaskConical, Landmark, LogOut, User, Info, Database,
  HardHat, UserPen, Users,
} from "lucide-react";
import { toast } from "sonner";

const Dashboard = dynamic(() => import("@/components/pages/dashboard"), { ssr: false, loading: () => <PageLoader /> });
const DailyEntry = dynamic(() => import("@/components/pages/daily-entry"), { ssr: false, loading: () => <PageLoader /> });
const CustomerKhata = dynamic(() => import("@/components/pages/customer-khata"), { ssr: false, loading: () => <PageLoader /> });
const EditCustomer = dynamic(() => import("@/components/pages/edit-customer"), { ssr: false, loading: () => <PageLoader /> });
const ManageCustomers = dynamic(() => import("@/components/pages/manage-customers"), { ssr: false, loading: () => <PageLoader /> });
const DayReconciliation = dynamic(() => import("@/components/pages/day-reconciliation"), { ssr: false, loading: () => <PageLoader /> });
const CashManagement = dynamic(() => import("@/components/pages/cash-management"), { ssr: false, loading: () => <PageLoader /> });
const ManageProducts = dynamic(() => import("@/components/pages/manage-products"), { ssr: false, loading: () => <PageLoader /> });
const PurchasesStock = dynamic(() => import("@/components/pages/purchases-stock"), { ssr: false, loading: () => <PageLoader /> });
const CustomMixOrder = dynamic(() => import("@/components/pages/custom-mix-order"), { ssr: false, loading: () => <PageLoader /> });
const CustomerAbout = dynamic(() => import("@/components/pages/customer-about"), { ssr: false, loading: () => <PageLoader /> });
const DatabaseManagement = dynamic(() => import("@/components/pages/database-management"), { ssr: false, loading: () => <PageLoader /> });
const LabourKhata = dynamic(() => import("@/components/pages/labour-khata"), { ssr: false, loading: () => <PageLoader /> });

function PageLoader() {
  return <div className="flex items-center justify-center py-20"><div className="animate-spin w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>;
}

const pageMap: Record<string, React.ComponentType<{ customer?: AppCustomer }>> = {
  about: CustomerAbout,
  dashboard: Dashboard,
  "daily-entry": DailyEntry,
  "customer-khata": CustomerKhata,
  "edit-customer": EditCustomer,
  "manage-customers": ManageCustomers,
  reconciliation: DayReconciliation,
  "cash-mgmt": CashManagement,
  "manage-products": ManageProducts,
  "purchases-stock": PurchasesStock,
  "custom-mix": CustomMixOrder,
  "database-mgmt": DatabaseManagement,
  "labour-khata": LabourKhata,
};

const navSections = [
  { label: "Account", items: [{ id: "about", label: "About", icon: Info }] },
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Daily Operations",
    items: [
      { id: "daily-entry", label: "Daily Entry", icon: FileText },
      { id: "custom-mix", label: "Custom Mix Order", icon: FlaskConical },
      { id: "reconciliation", label: "Day Reconciliation", icon: CheckCircle },
      { id: "cash-mgmt", label: "Cash Management", icon: Landmark },
    ],
  },
  { label: "Customers", items: [
    { id: "customer-khata", label: "Customer Khata", icon: BookOpen },
    { id: "manage-customers", label: "Manage Customers", icon: Users },
    { id: "edit-customer", label: "Edit Customer (OB)", icon: UserPen },
  ] },
  {
    label: "Labours",
    items: [
      { id: "labour-khata", label: "Labours Khata", icon: HardHat },
    ],
  },
  {
    label: "Inventory",
    items: [
      { id: "purchases-stock", label: "Purchases & Stock", icon: Package },
      { id: "manage-products", label: "Manage Products", icon: Settings },
    ],
  },
  {
    label: "System",
    items: [
      { id: "database-mgmt", label: "Database Management", icon: Database },
    ],
  },
];

export default function CustomerPortal() {
  const [customer, setCustomer] = useState<AppCustomer | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { activePage, setActivePage } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    fetchCustomer();
  }, []);

  const fetchCustomer = async () => {
    try {
      const res = await fetch("/api/customer/me");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ACCOUNT_BLOCKED") toast.error("Your account has been blocked by admin.");
        else if (data.error === "SUBSCRIPTION_EXPIRED") toast.error("Your subscription has expired.");
        router.replace("/customer/login");
        return;
      }
      const data = await res.json();
      setCustomer(data.customer);
    } catch {
      router.replace("/customer/login");
    }
  };

  // Prefetch master data in background after auth check
  useEffect(() => {
    // Trigger background prefetch of commonly used data
    Promise.all([
      fetch("/api/products").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([p]) => {
      if (p?.products) masterCache.products = { data: p.products, fetchedAt: Date.now() };
    });
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/customer/auth", { method: "DELETE" });
    } catch {}
    toast.success("Logged out successfully");
    router.replace("/customer/login");
  };

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const PageComponent = pageMap[activePage] || CustomerAbout;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white text-slate-800 p-2.5 rounded-xl shadow-lg border border-slate-200 cursor-pointer"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-screen w-64 transition-transform duration-200 lg:translate-x-0",
        "bg-gradient-to-b from-[#101a2e] to-[#0b1322] border-r border-white/[0.06]",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 h-screen flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.08] shrink-0">
            <div className="w-10 h-10 min-w-[2.5rem] rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg shadow-lg shadow-emerald-500/30">🐄</div>
            <div>
              <div className="text-white font-extrabold text-sm leading-tight">Danish Cattle Feed</div>
              <div className="text-slate-500 text-xs font-medium">Daily Register</div>
            </div>
          </div>

          <nav className="space-y-5 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="text-[0.68rem] font-bold tracking-wider uppercase text-slate-600 mb-1.5 ml-2">{section.label}</div>
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
                          isActive ? "bg-emerald-600/20 text-white font-medium" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
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

          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 min-w-[2rem] rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-semibold truncate">{customer.name}</div>
                <div className="text-emerald-400/70 text-[0.65rem] truncate mt-0.5">{customer.email}</div>
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

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 pt-6 lg:p-8 lg:pt-8 max-w-[1400px] mx-auto">
          <PageComponent customer={customer} />
        </div>
      </main>
    </div>
  );
}