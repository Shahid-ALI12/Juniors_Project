"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  UserPlus, Users, ShieldCheck, Trash2, Eye, EyeOff,
  Pencil, Ban, UserCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function getSubscriptionEnd(type: SubscriptionType, startDate: string, customDays?: number): string {
  const start = new Date(startDate);
  if (type === "monthly") start.setMonth(start.getMonth() + 1);
  else if (type === "yearly") start.setFullYear(start.getFullYear() + 1);
  else if (type === "custom" && customDays) start.setDate(start.getDate() + customDays);
  return start.toISOString().split("T")[0];
}

const isSupabaseConfigured = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

// Supabase sync helpers
async function syncToSupabase(customer: AppCustomer) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    await supabase.from("app_customers").upsert({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      password: customer.password,
      subscription_type: customer.subscription_type,
      subscription_start: customer.subscription_start,
      subscription_end: customer.subscription_end,
      is_active: customer.is_active,
      created_at: customer.created_at,
    }, { onConflict: "id" });
  } catch (err) {
    console.error("Supabase sync error:", err);
  }
}

async function deleteFromSupabase(id: string) {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    await supabase.from("app_customers").delete().eq("id", id);
  } catch (err) {
    console.error("Supabase delete error:", err);
  }
}

async function loadFromSupabase(): Promise<AppCustomer[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("app_customers")
      .select("*")
      .order("created_at", { ascending: true });
    if (error || !data) return null;
    return data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      password: row.password as string,
      subscription_type: row.subscription_type as SubscriptionType,
      subscription_start: row.subscription_start as string,
      subscription_end: row.subscription_end as string,
      is_active: row.is_active as boolean,
      created_at: row.created_at as string,
    }));
  } catch {
    return null;
  }
}

export default function AdminCustomerManagement() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, setCustomers } = useCustomerAuthStore();

  // Add dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [subType, setSubType] = useState<SubscriptionType>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [customDays, setCustomDays] = useState("");

  // View dialog
  const [viewCustomer, setViewCustomer] = useState<AppCustomer | null>(null);

  // Edit dialog
  const [editCustomer, setEditCustomer] = useState<AppCustomer | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);

  const loadCustomers = useCallback(async () => {
    // Try Supabase first
    const supabaseData = await loadFromSupabase();
    if (supabaseData && supabaseData.length > 0) {
      setCustomers(supabaseData);
      return;
    }

    // Fallback to localStorage
    const saved = localStorage.getItem("app_customers");
    if (saved) {
      setCustomers(JSON.parse(saved));
    } else {
      // Seed sample data
      const today = new Date();
      const sample: AppCustomer[] = [
        {
          id: "cust_1", name: "Ahmed Khan", email: "ahmed@example.com", password: "pass123",
          subscription_type: "monthly",
          subscription_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0],
          subscription_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0],
          is_active: true, created_at: today.toISOString(),
        },
        {
          id: "cust_2", name: "Ali Raza", email: "ali@example.com", password: "pass456",
          subscription_type: "yearly",
          subscription_start: "2026-01-01", subscription_end: "2026-12-31",
          is_active: true, created_at: today.toISOString(),
        },
      ];
      setCustomers(sample);
      // Sync sample to Supabase
      for (const c of sample) await syncToSupabase(c);
    }
  }, [setCustomers]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Persist to localStorage (fallback)
  useEffect(() => {
    if (customers.length > 0) localStorage.setItem("app_customers", JSON.stringify(customers));
  }, [customers]);

  // ─── Add ───
  const handleAdd = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Name, email and password are required");
      return;
    }
    if (customers.some((c) => c.email === email.trim())) {
      toast.error("This email is already registered");
      return;
    }
    const end = getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined);
    const newCustomer: AppCustomer = {
      id: `cust_${Date.now()}`, name: name.trim(), email: email.trim(), password,
      subscription_type: subType, subscription_start: startDate, subscription_end: end,
      is_active: true, created_at: new Date().toISOString(),
    };
    addCustomer(newCustomer);
    await syncToSupabase(newCustomer);
    toast.success(`${name} registered successfully!`);
    resetAddForm();
    setAddDialogOpen(false);
  };

  // ─── Edit ───
  const openEditDialog = (c: AppCustomer) => {
    setEditCustomer(c);
    setEditName(c.name);
    setEditEmail(c.email);
    setEditPassword(c.password);
    setShowEditPassword(false);
  };

  const handleEdit = async () => {
    if (!editCustomer) return;
    if (!editName.trim() || !editEmail.trim() || !editPassword.trim()) {
      toast.error("Name, email and password are required");
      return;
    }
    if (customers.some((c) => c.email === editEmail.trim() && c.id !== editCustomer.id)) {
      toast.error("This email is already registered to another customer");
      return;
    }
    const updated: AppCustomer = { ...editCustomer, name: editName.trim(), email: editEmail.trim(), password: editPassword };
    const updatedList = customers.map((c) => c.id === editCustomer.id ? updated : c);
    setCustomers(updatedList);
    localStorage.setItem("app_customers", JSON.stringify(updatedList));
    await syncToSupabase(updated);
    toast.success(`${editName}'s details updated`);
    setEditCustomer(null);
  };

  // ─── Block/Unblock ───
  const handleToggleBlock = async (c: AppCustomer) => {
    const newActive = !c.is_active;
    if (!newActive && !confirm(`Block ${c.name}? They will not be able to login.`)) return;
    const updated: AppCustomer = { ...c, is_active: newActive };
    const updatedList = customers.map((cust) => cust.id === c.id ? updated : cust);
    setCustomers(updatedList);
    localStorage.setItem("app_customers", JSON.stringify(updatedList));
    await syncToSupabase(updated);
    toast.success(`${c.name} has been ${newActive ? "unblocked" : "blocked"}`);
  };

  // ─── Delete ───
  const handleDelete = async (id: string, customerName: string) => {
    if (!confirm(`Delete ${customerName}?`)) return;
    const updatedList = customers.filter((c) => c.id !== id);
    deleteCustomer(id);
    localStorage.setItem("app_customers", JSON.stringify(updatedList));
    await deleteFromSupabase(id);
    toast.success(`${customerName} deleted`);
  };

  const resetAddForm = () => {
    setName(""); setEmail(""); setPassword(""); setSubType("monthly");
    setStartDate(new Date().toISOString().split("T")[0]); setCustomDays("");
  };

  const activeCount = customers.filter((c) => c.is_active && new Date(c.subscription_end) > new Date()).length;
  const blockedCount = customers.filter((c) => !c.is_active || new Date(c.subscription_end) <= new Date()).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Customer Management" description="Register new customers, edit their details, and manage access" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Customers" value={customers.length} icon={Users} color="text-blue-500" />
        <MetricCard title="Active" value={activeCount} icon={ShieldCheck} color="text-emerald-500" />
        <MetricCard title="Blocked/Expired" value={blockedCount} icon={Ban} color="text-red-500" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">All Customers</CardTitle>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                <UserPlus className="w-4 h-4 mr-2" />Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white">
              <DialogHeader><DialogTitle>Register New Customer</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="customer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input type={showAddPassword ? "text" : "password"} placeholder="Login password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowAddPassword(!showAddPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                      {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subscription Type</Label>
                  <Select value={subType} onValueChange={(v) => setSubType(v as SubscriptionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <Input type="number" placeholder="Number of days" value={customDays} onChange={(e) => setCustomDays(e.target.value)} min={1} max={3650} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="font-medium text-slate-700">Subscription Preview:</div>
                  <div className="flex justify-between"><span className="text-slate-500">Type:</span><span className="font-medium capitalize">{subType}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">End:</span><span className="font-medium text-emerald-600">{getSubscriptionEnd(subType, startDate, customDays ? parseInt(customDays) : undefined)}</span></div>
                </div>
                <Button onClick={handleAdd} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">Register Customer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No customers registered yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>End Date</TableHead>
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
                        <TableCell><Badge variant="outline" className="capitalize text-xs">{c.subscription_type}</Badge></TableCell>
                        <TableCell className="text-sm text-slate-500">{c.subscription_end}</TableCell>
                        <TableCell>
                          <Badge className={status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : status === "expired" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200"}>
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewCustomer(c)} className="h-8 text-xs cursor-pointer" title="View"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(c)} className="h-8 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer" title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleToggleBlock(c)} className={`h-8 text-xs cursor-pointer ${c.is_active ? "text-orange-500 hover:text-orange-700 hover:bg-orange-50" : "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"}`} title={c.is_active ? "Block" : "Unblock"}>
                              {c.is_active ? <Ban className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id, c.name)} className="h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
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

      {/* View Dialog */}
      <Dialog open={!!viewCustomer} onOpenChange={() => setViewCustomer(null)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader><DialogTitle>Customer Details</DialogTitle></DialogHeader>
          {viewCustomer && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-slate-500 text-xs">Name</div><div className="font-semibold">{viewCustomer.name}</div></div>
                <div><div className="text-slate-500 text-xs">Email</div><div className="font-semibold">{viewCustomer.email}</div></div>
                <div><div className="text-slate-500 text-xs">Password</div><div className="font-mono font-semibold">{viewCustomer.password}</div></div>
                <div><div className="text-slate-500 text-xs">Status</div><div className="font-semibold">{!viewCustomer.is_active ? <Badge className="bg-red-100 text-red-700">Blocked</Badge> : new Date(viewCustomer.subscription_end) <= new Date() ? <Badge className="bg-amber-100 text-amber-700">Expired</Badge> : <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>}</div></div>
                <div><div className="text-slate-500 text-xs">Subscription</div><div className="font-semibold capitalize">{viewCustomer.subscription_type}</div></div>
                <div><div className="text-slate-500 text-xs">Days Left</div><div className="font-semibold">{new Date(viewCustomer.subscription_end) <= new Date() ? "Expired" : Math.ceil((new Date(viewCustomer.subscription_end).getTime() - Date.now()) / 86400000) + " days"}</div></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={(open) => { if (!open) setEditCustomer(null); }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader><DialogTitle>Edit Customer — {editCustomer?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Full Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input type={showEditPassword ? "text" : "password"} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowEditPassword(!showEditPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleEdit} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"><Pencil className="w-4 h-4 mr-2" />Save</Button>
              <Button variant="outline" onClick={() => setEditCustomer(null)} className="flex-1 cursor-pointer">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}