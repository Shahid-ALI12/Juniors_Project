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
import { UserCheck, Ban, Clock, RefreshCw, CalendarDays, ShieldOff } from "lucide-react";

function getSubscriptionEnd(type: SubscriptionType, startDate: string, customDays?: number): string {
  const start = new Date(startDate);
  if (type === "monthly") start.setMonth(start.getMonth() + 1);
  else if (type === "yearly") start.setFullYear(start.getFullYear() + 1);
  else if (type === "custom" && customDays) start.setDate(start.getDate() + customDays);
  return start.toISOString().split("T")[0];
}

export default function AdminBlockedUsers() {
  const { customers, updateCustomer, setCustomers } = useCustomerAuthStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<AppCustomer | null>(null);
  const [subType, setSubType] = useState<SubscriptionType>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [customDays, setCustomDays] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("app_customers");
    if (saved) {
      setCustomers(JSON.parse(saved));
    }
  }, [setCustomers]);

  const blockedCustomers = customers.filter(
    (c) => !c.is_active || new Date(c.subscription_end) <= new Date()
  );

  const handleApprove = () => {
    if (!selectedCustomer) return;
    const end = getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined);
    updateCustomer(selectedCustomer.id, {
      is_active: true,
      subscription_type: subType,
      subscription_start: startDate,
      subscription_end: end,
    });
    localStorage.setItem(
      "app_customers",
      JSON.stringify(
        customers.map((c) =>
          c.id === selectedCustomer.id
            ? { ...c, is_active: true, subscription_type: subType, subscription_start: startDate, subscription_end: end }
            : c
        )
      )
    );
    toast.success(`${selectedCustomer.name} ka subscription approve ho gaya!`);
    setDialogOpen(false);
    setSelectedCustomer(null);
    setSubType("monthly");
    setCustomDays("");
  };

  const openApproveDialog = (customer: AppCustomer) => {
    setSelectedCustomer(customer);
    setStartDate(new Date().toISOString().split("T")[0]);
    setSubType("monthly");
    setCustomDays("");
    setDialogOpen(true);
  };

  const blockedByAdmin = blockedCustomers.filter((c) => !c.is_active);
  const expiredSubs = blockedCustomers.filter((c) => c.is_active && new Date(c.subscription_end) <= new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blocked / Expired Users"
        description="View blocked and subscription-expired users. Re-approve with new subscription."
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Blocked/Expired"
          value={blockedCustomers.length}
          icon={ShieldOff}
          color="text-red-500"
        />
        <MetricCard
          title="Blocked by Admin"
          value={blockedByAdmin.length}
          icon={Ban}
          color="text-orange-500"
        />
        <MetricCard
          title="Subscription Expired"
          value={expiredSubs.length}
          icon={Clock}
          color="text-amber-500"
        />
      </div>

      {/* Blocked Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Users Requiring Action
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blockedCustomers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ShieldOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Koi blocked ya expired user nahi hai</p>
              <p className="text-sm mt-1">Sab customers active hain!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Last Subscription</TableHead>
                    <TableHead>Expired On</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockedCustomers.map((c) => {
                    const isAdminBlocked = !c.is_active;
                    const isExpired = c.is_active && new Date(c.subscription_end) <= new Date();
                    return (
                      <TableRow key={c.id} className="bg-red-50/30">
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{c.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {c.subscription_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-red-600 font-medium">
                          {c.subscription_end}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              isAdminBlocked
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-amber-100 text-amber-700 border-amber-200"
                            }
                          >
                            {isAdminBlocked ? "Admin Blocked" : "Subscription Expired"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog open={dialogOpen && selectedCustomer?.id === c.id} onOpenChange={(open) => {
                            setDialogOpen(open);
                            if (!open) setSelectedCustomer(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                onClick={() => openApproveDialog(c)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                Re-Approve
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md bg-white">
                              <DialogHeader>
                                <DialogTitle>Re-Approve {c.name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-2">
                                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                                  <p className="text-slate-600">
                                    <span className="font-medium">{c.name}</span> ka subscription{" "}
                                    {isAdminBlocked ? "admin ne block kiya tha" : "expire ho gaya tha"}.
                                    Naya subscription do toh wo phir se login kar sakega.
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <Label>New Subscription Type</Label>
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
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                                  <div className="font-medium text-emerald-800 mb-1">New Subscription:</div>
                                  <div className="flex justify-between text-emerald-700">
                                    <span>End Date:</span>
                                    <span className="font-bold">
                                      {getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined)}
                                    </span>
                                  </div>
                                </div>

                                <Button
                                  onClick={handleApprove}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                >
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  Approve & Activate
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
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
    </div>
  );
}