"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, Eye, EyeOff, Milk, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, Suspense } from "react";

function getErrorMessage(reason: string | null): string {
  switch (reason) {
    case "invalid_session": return "Your session is invalid. Please login again.";
    case "blocked": return "Your account has been blocked by the admin.";
    case "expired": return "Your subscription has expired. Contact admin to renew.";
    default: return "";
  }
}

function CustomerLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason) {
      toast.error(getErrorMessage(reason));
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/customer/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        switch (data.error) {
          case "EMAIL_NOT_FOUND":
            toast.error("This email is not registered. Contact admin.");
            break;
          case "ACCOUNT_BLOCKED":
            toast.error("Your account is blocked. Contact admin.");
            break;
          case "SUBSCRIPTION_EXPIRED":
            toast.error("Your subscription has expired. Contact admin to renew.");
            break;
          case "INVALID_PASSWORD":
            toast.error("Incorrect password");
            break;
          case "TABLE_NOT_FOUND":
            toast.error("Database not set up. Admin must create the table first in Supabase.");
            break;
          default:
            toast.error(data.error || "Login failed. Please try again.");
        }
        setLoading(false);
        return;
      }

      toast.success(`Welcome ${data.customer.name}!`);
      router.push("/customer");
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
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
            Login credentials are provided by admin. Subscription must be active.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>}>
      <CustomerLoginForm />
    </Suspense>
  );
}