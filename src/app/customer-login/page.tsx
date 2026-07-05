"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuthStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, Eye, EyeOff, Milk } from "lucide-react";
import { toast } from "sonner";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { loginCustomer, setCustomers } = useCustomerAuthStore();
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("app_customers");
    if (saved) setCustomers(JSON.parse(saved));
  }, [setCustomers]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email aur password daalo");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const customer = loginCustomer(email.trim(), password);

      if (!customer) {
        // Check if user exists but is blocked/expired
        const allCustomers = JSON.parse(localStorage.getItem("app_customers") || "[]");
        const found = allCustomers.find((c: { email: string }) => c.email === email.trim());

        if (!found) {
          toast.error("Ye email registered nahi hai. Admin se contact karo.");
        } else if (!found.is_active) {
          toast.error("Aapka account block hai. Admin se contact karo.");
        } else if (new Date(found.subscription_end) <= new Date()) {
          toast.error("Aapki subscription expire ho gayi hai. Admin se renew karwao.");
        } else {
          toast.error("Password galat hai");
        }
        setLoading(false);
        return;
      }

      // Check subscription
      if (new Date(customer.subscription_end) <= new Date()) {
        toast.error("Aapki subscription expire ho gayi hai. Admin se contact karo.");
        setLoading(false);
        return;
      }

      // Success
      localStorage.setItem("customer_session", JSON.stringify(customer));
      toast.success(`Welcome ${customer.name}!`);
      router.push("/customer");
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-slate-200 bg-white/90 backdrop-blur-xl shadow-xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Milk className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Danish Cattle Feed
            </CardTitle>
            <CardDescription className="text-slate-500 mt-1.5">
              Customer Portal — Login to continue
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="cust-email" className="text-sm font-medium text-slate-700">
                Email Address
              </Label>
              <Input
                id="cust-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cust-password" className="text-sm font-medium text-slate-700">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="cust-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 pr-12"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-500/25 cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </div>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6 pt-5 border-t border-slate-100">
            Login credentials admin se milegi. Subscription active honi chahiye.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}