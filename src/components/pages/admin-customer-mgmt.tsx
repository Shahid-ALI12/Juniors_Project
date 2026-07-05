"use client";

import { useState, useEffect } from "react";
import { useCustomerAuthStore } from "@/store";
import type { AppCustomer, SubscriptionType } from "@/types";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Users, ShieldCheck, Clock, CalendarDays, AlertTriangle, Trash2, Eye, EyeOff } from "lucide-react";

function getSubscriptionEnd(type: SubscriptionType, startDate: string, customDays?: number): string {
  const start = new Date(startDate);
  if (type === "monthly") start.setMonth(start.getMonth() + 1);
  else if (type === "yearly") start.setFullYear(start.getFullYear() + 1);
  else if (type === "custom" && customDays) start.setDate(start.getDate() + customDays);
  return start.toISOString().split("T")[0];
}

export default function AdminCustomerManagement() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, setCustomers } = useCustomerAuthStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [subType, setSubType] = useState<SubscriptionType>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [customDays, setCustomDays] = useState("");

  // View detail
  const [viewCustomer, setViewCustomer] = useState<AppCustomer | null>(null);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem("app_customers");
    if (saved) {
      setCustomers(JSON.parse(saved));
    } else {
      // Seed with sample data
      const today = new Date();
      const sample: AppCustomer[] = [
        {
          id: "cust_1",
          name: "Ahmed Khan",
          email: "ahmed@example.com",
          password: "pass123",
          subscription_type: "monthly",
          subscription_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0],
          subscription_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0],
          is_active: true,
          created_at: today.toISOString(),
        },
        {
          id: "cust_2",
          name: "Ali Raza",
          email: "ali@example.com",
          password: "pass456",
          subscription_type: "yearly",
          subscription_start: "2026-01-01",
          subscription_end: "2026-12-31",
          is_active: true,
          created_at: today.toISOString(),
        },
        {
          id: "cust_3",
          name: "Usman Malik",
          email: "usman@example.com",
          password: "pass789",
          subscription_type: "monthly",
          subscription_start: "2026-05-01",
          subscription_end: "2026-06-01",
          is_active: false,
          created_at: today.toISOString(),
        },
      ];
      setCustomers(sample);
    }
  }, [setCustomers]);

  // Persist to localStorage
  useEffect(() => {
    if (customers.length > 0) {
      localStorage.setItem("app_customers", JSON.stringify(customers));
    }
  }, [customers]);

  const handleAdd = () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Name, email aur password zaruri hain");
      return;
    }
    if (customers.some((c) => c.email === email.trim())) {
      toast.error("Ye email pehle se registered hai");
      return;
    }

    const end = getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined);
    const newCustomer: AppCustomer = {
      id: `cust_${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      password,
      subscription_type: subType,
      subscription_start: startDate,
      subscription_end: end,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    addCustomer(newCustomer);
    toast.success(`${name} ka account ban gaya! Subscription: ${subType}`);
    resetForm();
    setDialogOpen(false);
  };

  const handleDelete = (id: string, customerName: string) => {
    if (confirm(`Kya aap ${customerName} ko delete karna chahte hain?`)) {
      deleteCustomer(id);
      localStorage.setItem("app_customers", JSON.stringify(customers.filter((c) => c.id !== id)));
      toast.success(`${customerName} delete ho gaya`);
    }
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setSubType("monthly");
    setStartDate(new Date().toISOString().split("T")[0]);
    setCustomDays("");
  };

  const activeCount = customers.filter((c) => c.is_active && new Date(c.subscription_end) > new Date()).length;
  const blockedCount = customers.filter((c) => !c.is_active || new Date(c.subscription_end) <= new Date()).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Management"
        description="Register new customers and manage their subscriptions"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Customers"
          value={customers.length}
          icon={Users}
          color="text-blue-500"
        />
        <MetricCard
          title="Active"
          value={activeCount}
          icon={ShieldCheck}
          color="text-emerald-500"
        />
        <MetricCard
          title="Expired/Blocked"
          value={blockedCount}
          icon={AlertTriangle}
          color="text-red-500"
        />
      </div>

      {/* Add Customer */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">All Customers</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white">
              <DialogHeader>
                <DialogTitle>Register New Customer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="Customer ka naam"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Login password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subscription Type</Label>
                  <Select value={subType} onValueChange={(v) => setSubType(v as SubscriptionType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly (1 Month)</SelectItem>
                      <SelectItem value="yearly">Yearly (1 Year)</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {subType === "custom" && (
                  <div className="space-y-2">
                    <Label>Custom Days</Label>
                    <Input
                      type="number"
                      placeholder="Number of days"
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value)}
                      min={1}
                      max={3650}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                {/* Preview */}
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="font-medium text-slate-700">Subscription Preview:</div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type:</span>
                    <span className="font-medium capitalize">{subType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Start:</span>
                    <span className="font-medium">{startDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">End:</span>
                    <span className="font-medium text-emerald-600">
                      {getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined)}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleAdd}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  Register Customer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Koi customer registered nahi hai</p>
              <p className="text-sm mt-1">"Add Customer" button se naya customer register karo</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => {
                    const isExpired = new Date(c.subscription_end) <= new Date();
                    const status = !c.is_active ? "blocked" : isExpired ? "expired" : "active";
                    return (
                      <TableRow key={c.id} className={!c.is_active ? "opacity-60" : ""}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{c.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {c.subscription_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{c.subscription_start}</TableCell>
                        <TableCell className="text-sm text-slate-500">{c.subscription_end}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              status === "active"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : status === "expired"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-red-100 text-red-700 border-red-200"
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewCustomer(c)}
                            className="h-8 text-xs cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(c.id, c.name)}
                            className="h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Detail Dialog */}
      <Dialog open={!!viewCustomer} onOpenChange={() => setViewCustomer(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {viewCustomer && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-500 text-xs">Name</div>
                  <div className="font-semibold">{viewCustomer.name}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Email</div>
                  <div className="font-semibold">{viewCustomer.email}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Password</div>
                  <div className="font-mono font-semibold">{viewCustomer.password}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Status</div>
                  <div className="font-semibold">
                    {!viewCustomer.is_active ? (
                      <Badge className="bg-red-100 text-red-700">Blocked</Badge>
                    ) : new Date(viewCustomer.subscription_end) <= new Date() ? (
                      <Badge className="bg-amber-100 text-amber-700">Expired</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Subscription Type</div>
                  <div className="font-semibold capitalize">{viewCustomer.subscription_type}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs">Days Remaining</div>
                  <div className="font-semibold">
                    {new Date(viewCustomer.subscription_end) <= new Date()
                      ? "Expired"
                      : Math.ceil(
                          (new Date(viewCustomer.subscription_end).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        ) + " days"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm border-t pt-3">
                <div>
                  <div className="text-slate-500 text-xs">Start Date</div>
                  <div className="font-semibold">{viewCustomer.subscription_start}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs">End Date</div>
                  <div className="font-semibold">{viewCustomer.subscription_end}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}