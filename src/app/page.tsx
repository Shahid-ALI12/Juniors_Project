"use client";

import AppSidebar from "@/components/layout/sidebar";
import { useAppStore } from "@/store";
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/pages/dashboard"), { ssr: false });
const DailyEntry = dynamic(() => import("@/components/pages/daily-entry"), { ssr: false });
const CustomerKhata = dynamic(() => import("@/components/pages/customer-khata"), { ssr: false });
const DayReconciliation = dynamic(() => import("@/components/pages/day-reconciliation"), { ssr: false });
const CashManagement = dynamic(() => import("@/components/pages/cash-management"), { ssr: false });
const ManageProducts = dynamic(() => import("@/components/pages/manage-products"), { ssr: false });
const PurchasesStock = dynamic(() => import("@/components/pages/purchases-stock"), { ssr: false });
const CustomMixOrder = dynamic(() => import("@/components/pages/custom-mix-order"), { ssr: false });

import AdminCustomerMgmt from "@/components/pages/admin-customer-mgmt";
import AdminBlockedUsers from "@/components/pages/admin-blocked-users";

const pageMap: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  "daily-entry": DailyEntry,
  "customer-khata": CustomerKhata,
  reconciliation: DayReconciliation,
  "cash-mgmt": CashManagement,
  "manage-products": ManageProducts,
  "purchases-stock": PurchasesStock,
  "custom-mix": CustomMixOrder,
  "admin-customers": AdminCustomerMgmt,
  "admin-blocked": AdminBlockedUsers,
};

export default function Home() {
  const { activePage } = useAppStore();
  const PageComponent = pageMap[activePage] || Dashboard;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppSidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 pt-6 lg:p-8 lg:pt-8 max-w-[1400px] mx-auto">
          <PageComponent />
        </div>
      </main>
    </div>
  );
}