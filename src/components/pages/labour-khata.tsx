"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { apiError } from "@/store";
import type { Labour, LabourPayment, LabourPaymentType } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  HardHat,
  Plus,
  Loader2,
  UserPlus,
  Wallet,
  TrendingDown,
  Trash2,
  Phone,
  Briefcase,
  Users,
  Calendar,
  IndianRupee,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { pktToday } from "@/lib/pkt-date";
import { cn } from "@/lib/utils";

// ─── Constants ───

const PAYMENT_TYPES: { value: LabourPaymentType; label: string; color: string }[] = [
  { value: "salary",  label: "Salary",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "advance", label: "Advance", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "expense", label: "Expense", color: "bg-blue-100 text-blue-700 border-blue-200" },
];

const ROLE_PRESETS = ["Mazdoor", "Driver", "Loader", "Packing", "Guard", "Other"];

// ─── Helpers ───

const fmt = (n: number) => Number(n || 0).toLocaleString("en-PK");

const typeBadge = (t: LabourPaymentType) =>
  PAYMENT_TYPES.find((p) => p.value === t) || PAYMENT_TYPES[0];

// ─── Page ───

export default function LabourKhataPage() {
  const today = pktToday();

  // ─── Labours state ───
  const [labours, setLabours] = useState<Labour[]>([]);
  const [loadingLabours, setLoadingLabours] = useState(true);

  // ─── New labour form ───
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newWage, setNewWage] = useState("");
  const [savingLabour, setSavingLabour] = useState(false);

  // ─── Payment form ───
  const [payLabourId, setPayLabourId] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(today);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payType, setPayType] = useState<LabourPaymentType>("salary");
  const [payDesc, setPayDesc] = useState<string>("");
  const [savingPayment, setSavingPayment] = useState(false);

  // ─── Payments state ───
  const [payments, setPayments] = useState<LabourPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  // ─── Filter state ───
  const [filterLabourId, setFilterLabourId] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  // ─── Data loaders ───

  const loadLabours = useCallback(async () => {
    setLoadingLabours(true);
    try {
      const res = await fetch("/api/labours");
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load labours");
        throw new Error(detail);
      }
      const data = await res.json();
      setLabours(data.labours || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load labours");
    } finally {
      setLoadingLabours(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const params = new URLSearchParams();
      if (filterLabourId && filterLabourId !== "all") {
        params.set("labour_id", filterLabourId);
      }
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo)   params.set("to", filterTo);
      params.set("include_labour", "true");

      const res = await fetch(`/api/labour-payments?${params.toString()}`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to load payments");
        throw new Error(detail);
      }
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load payments");
    } finally {
      setLoadingPayments(false);
    }
  }, [filterLabourId, filterFrom, filterTo]);

  useEffect(() => {
    loadLabours();
  }, [loadLabours]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // ─── Derived ───

  const activeLabours = useMemo(
    () => labours.filter((l) => l.is_active),
    [labours]
  );

  const laboursById = useMemo(() => {
    const m = new Map<number, Labour>();
    labours.forEach((l) => m.set(l.id, l));
    return m;
  }, [labours]);

  // Total paid per labour (from full payments list, ignoring filters)
  const totalPaidByLabour = useMemo(() => {
    const m = new Map<number, number>();
    // Note: when filtered, this is the filtered total — that's fine for display
    payments.forEach((p) => {
      m.set(p.labour_id, (m.get(p.labour_id) || 0) + Number(p.amount));
    });
    return m;
  }, [payments]);

  const grandTotal = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );

  const todaysTotal = useMemo(
    () =>
      payments
        .filter((p) => p.payment_date === today)
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [payments, today]
  );

  // ─── Handlers ───

  const handleAddLabour = async () => {
    if (!newName.trim()) {
      toast.error("Labour name is required");
      return;
    }
    const wage = newWage ? Number(newWage) : 0;
    if (newWage && (!Number.isFinite(wage) || wage < 0)) {
      toast.error("Daily wage must be a non-negative number");
      return;
    }
    setSavingLabour(true);
    try {
      const res = await fetch("/api/labours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || null,
          role: newRole.trim() || null,
          daily_wage: wage,
        }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to register labour");
        throw new Error(detail);
      }
      toast.success(`Registered: ${newName.trim()}`);
      setNewName("");
      setNewPhone("");
      setNewRole("");
      setNewWage("");
      await loadLabours();
    } catch (e: any) {
      toast.error(e.message || "Failed to register labour");
    } finally {
      setSavingLabour(false);
    }
  };

  const handleToggleActive = async (labour: Labour) => {
    try {
      const res = await fetch("/api/labours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: labour.id, is_active: !labour.is_active }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to update labour");
        throw new Error(detail);
      }
      toast.success(labour.is_active
        ? `${labour.name} deactivated`
        : `${labour.name} re-activated`);
      await loadLabours();
    } catch (e: any) {
      toast.error(e.message || "Failed to update labour");
    }
  };

  const handleAddPayment = async () => {
    if (!payLabourId) {
      toast.error("Select a labour first");
      return;
    }
    if (!payDate) {
      toast.error("Pick a payment date");
      return;
    }
    const amt = Number(payAmount);
    if (!payAmount || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    setSavingPayment(true);
    try {
      const res = await fetch("/api/labour-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labour_id: Number(payLabourId),
          payment_date: payDate,
          amount: amt,
          payment_type: payType,
          description: payDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to add payment");
        throw new Error(detail);
      }
      const labour = laboursById.get(Number(payLabourId));
      toast.success(
        `Added Rs. ${fmt(amt)} (${payType}) for ${labour?.name || "labour"}`
      );
      setPayAmount("");
      setPayDesc("");
      // Reset selection if labour was just paid
      await loadPayments();
    } catch (e: any) {
      toast.error(e.message || "Failed to add payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (id: number) => {
    if (!confirm("Delete this payment? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/labour-payments?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const detail = await apiError(res, "Failed to delete payment");
        throw new Error(detail);
      }
      toast.success("Payment deleted");
      await loadPayments();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete payment");
    }
  };

  // ─── Render ───

  return (
    <div className="space-y-6">
      <PageHeader
        title="Labours Khata"
        subtitle="Register labours · Track daily payments, advances & expenses"
      />

      {/* ─── Metrics row ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Labours"
          value={labours.length}
          color="blue"
          icon={Users}
          iconColor="bg-blue-100"
        />
        <MetricCard
          label="Active"
          value={activeLabours.length}
          color="green"
          icon={HardHat}
          iconColor="bg-emerald-100"
        />
        <MetricCard
          label="Today's Payments"
          value={`Rs. ${fmt(todaysTotal)}`}
          color="orange"
          icon={Wallet}
          iconColor="bg-amber-100"
        />
        <MetricCard
          label="Filtered Total"
          value={`Rs. ${fmt(grandTotal)}`}
          color="purple"
          icon={TrendingDown}
          iconColor="bg-purple-100"
        />
      </div>

      {/* ─── Section 1: Register new labour ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="size-5 text-emerald-600" /> Register New Labour
          </CardTitle>
          <CardDescription>
            Add a new labour to your khata. You can record payments for them afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. Raza Khan"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Phone
              </Label>
              <Input
                placeholder="03xx-xxxxxxx"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Role / Skill
              </Label>
              <Input
                placeholder="e.g. Mazdoor"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                list="role-presets"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
              <datalist id="role-presets">
                {ROLE_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Daily Wage (Rs.)
              </Label>
              <Input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={newWage}
                onChange={(e) => setNewWage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabour();
                }}
              />
            </div>
          </div>

          <Button
            onClick={handleAddLabour}
            disabled={savingLabour}
            className="w-full mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {savingLabour ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Plus className="size-4" /> Register Labour
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ─── Section 2: All labours ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <HardHat className="size-5 text-slate-600" /> All Labours
            <Badge variant="outline" className="ml-1">
              {labours.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            All registered labours with their total paid amount (based on current filter).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLabours ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-slate-400" />
            </div>
          ) : labours.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No labours registered yet. Use the form above to add your first labour.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 border-y border-slate-100">
                  <tr className="text-left text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right">Daily Wage</th>
                    <th className="px-4 py-3 text-right">Total Paid</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labours.map((l) => {
                    const total = totalPaidByLabour.get(l.id) || 0;
                    return (
                      <tr key={l.id} className={cn("hover:bg-slate-50/50", !l.is_active && "opacity-50")}>
                        <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {l.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="size-3 text-slate-400" /> {l.phone}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {l.role ? (
                            <span className="inline-flex items-center gap-1">
                              <Briefcase className="size-3 text-slate-400" /> {l.role}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          Rs. {fmt(l.daily_wage)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                          Rs. {fmt(total)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            className={cn(
                              "border",
                              l.is_active
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            )}
                          >
                            {l.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => handleToggleActive(l)}
                          >
                            {l.is_active ? "Deactivate" : "Re-activate"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 3: Add payment ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="size-5 text-amber-600" /> Add Payment / Salary / Advance
          </CardTitle>
          <CardDescription>
            Record a payment to a labour. Use type to categorise: Salary (regular pay),
            Advance (pre-paid), or Expense (reimbursement/other).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeLabours.length === 0 ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-800">
              <AlertCircle className="size-4 text-amber-600" />
              <AlertDescription>
                No active labours. Register a labour above first, then come back here.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Labour <span className="text-red-500">*</span>
                  </Label>
                  <Select value={payLabourId} onValueChange={setPayLabourId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select labour" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeLabours.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.name}
                          {l.role ? ` · ${l.role}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    max={today}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Amount (Rs.) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    placeholder="0"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Type
                  </Label>
                  <Select
                    value={payType}
                    onValueChange={(v) => setPayType(v as LabourPaymentType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">
                    Notes
                  </Label>
                  <Input
                    placeholder="optional"
                    value={payDesc}
                    onChange={(e) => setPayDesc(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleAddPayment}
                disabled={savingPayment}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
              >
                {savingPayment ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Plus className="size-4" /> Record Payment
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 4: Filter + History ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="size-5 text-slate-600" /> Payment History
          </CardTitle>
          <CardDescription>
            Filter by labour and/or date range. Showing {payments.length} payment(s)
            totalling <span className="font-semibold">Rs. {fmt(grandTotal)}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-200/60">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Labour
              </Label>
              <Select value={filterLabourId} onValueChange={setFilterLabourId}>
                <SelectTrigger>
                  <SelectValue placeholder="All labours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All labours</SelectItem>
                  {labours.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                From Date
              </Label>
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                max={filterTo || today}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                To Date
              </Label>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                min={filterFrom}
                max={today}
              />
            </div>
          </div>

          {/* Payments table */}
          {loadingPayments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-slate-400" />
            </div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No payments found. Adjust filters or record a payment above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 border-y border-slate-100">
                  <tr className="text-left text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Labour</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => {
                    const badge = typeBadge(p.payment_type);
                    const labourName =
                      p.labours?.name || laboursById.get(p.labour_id)?.name || `#${p.labour_id}`;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {p.payment_date}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {labourName}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("border", badge.color)}>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.description || (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                          Rs. {fmt(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDeletePayment(p.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase text-slate-500 font-semibold">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      Rs. {fmt(grandTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
