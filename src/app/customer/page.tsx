"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuthStore } from "@/store";
import type { AppCustomer } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  LogOut,
  User,
  CalendarDays,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Milk,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

export default function CustomerDashboard() {
  const [customer, setCustomer] = useState<AppCustomer | null>(null);
  const { logoutCustomer } = useCustomerAuthStore();
  const router = useRouter();

  useEffect(() => {
    const session = localStorage.getItem("customer_session");
    if (!session) {
      router.replace("/customer-login");
      return;
    }
    const parsed = JSON.parse(session) as AppCustomer;

    // Double-check subscription
    if (new Date(parsed.subscription_end) <= new Date() || !parsed.is_active) {
      toast.error("Aapki subscription expire/block ho gayi hai");
      localStorage.removeItem("customer_session");
      router.replace("/customer-login");
      return;
    }

    setCustomer(parsed);
  }, [router]);

  const handleLogout = () => {
    logoutCustomer();
    localStorage.removeItem("customer_session");
    toast.success("Logout ho gaye");
    router.replace("/customer-login");
  };

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
              <Milk className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-800 hidden sm:block">Danish Cattle Feed</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
              <User className="w-4 h-4" />
              <span>{customer.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 sm:p-8 text-white mb-8 shadow-lg shadow-emerald-500/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-100 text-sm mb-2">
                <CheckCircle2 className="w-4 h-4" />
                Subscription Active
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Welcome, {customer.name}!
              </h1>
              <p className="text-emerald-100 mt-1">
                Aap ka account active hai. Aap apna data dekh sakte hain.
              </p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
              <div className="text-3xl font-bold">{daysRemaining}</div>
              <div className="text-emerald-100 text-xs mt-0.5">Days Left</div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Account Name</div>
                  <div className="font-semibold text-slate-800">{customer.name}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Subscription</div>
                  <div className="font-semibold text-slate-800 capitalize">{customer.subscription_type}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Start Date</div>
                  <div className="font-semibold text-slate-800">{customer.subscription_start}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Expiry Date</div>
                  <div className="font-semibold text-slate-800">{customer.subscription_end}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Progress */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Subscription Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{customer.subscription_start}</span>
                <span className="text-slate-500">{customer.subscription_end}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    daysRemaining <= 7
                      ? "bg-gradient-to-r from-red-400 to-red-500"
                      : daysRemaining <= 15
                      ? "bg-gradient-to-r from-amber-400 to-amber-500"
                      : "bg-gradient-to-r from-emerald-400 to-teal-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{progressPercent}% elapsed</span>
                <span className={daysRemaining <= 7 ? "text-red-500 font-medium" : "text-slate-400"}>
                  {daysRemaining} days remaining
                </span>
              </div>
            </div>

            {daysRemaining <= 7 && (
              <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <div className="font-medium">Subscription jaldi expire ho jayegi!</div>
                  <div className="text-amber-600 mt-0.5">
                    Sirf {daysRemaining} din baki hain. Renew karwane ke liye admin se contact karo.
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardContent className="py-6">
            <div className="text-center text-slate-400 text-sm">
              <p>Danish Cattle Feed — Daily Register</p>
              <p className="mt-1 text-xs">Subscription management by admin. Any issues? Contact support.</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}