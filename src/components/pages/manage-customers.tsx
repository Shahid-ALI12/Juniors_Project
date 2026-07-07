"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import type { Customer } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { apiError, invalidateCache } from "@/store";
import { numberToWords } from "@/lib/number-to-words";
import ConfirmAction from "@/components/shared/confirm-action";
import {
  UserPlus, Users, Download, Loader2, Pencil, Ban, RotateCcw,
  Trash2, Search, Phone, UserCheck, Phone as PhoneIcon,
} from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-PK");

// ─── Balance row from /api/reports/customer-balance ───
interface BalanceRow {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  balance_due: number;
}

// ─── Edit/Add dialog form state ───
interface CustomerForm {
  name: string;
  phone: string;
  type: "credit" | "cash";
  opening_balance: string;
  is_active: boolean;
}

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  type: "credit",
  opening_balance: "0",
  is_active: true,
};

export default function ManageCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<number, BalanceRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ─── Add dialog ───
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<CustomerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // ─── Edit dialog ───
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState<CustomerForm>(emptyForm);

  // ─── Confirm dialog ───
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDesc, setConfirmDesc] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmVariant, setConfirmVariant] = useState<"danger" | "warning" | "info">("danger");
  const [confirmLabel, setConfirmLabel] = useState("Confirm");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const askConfirm = (
    title: string,
    desc: string,
    action: () => void,
    variant: "danger" | "warning" | "info" = "danger",
    label = "Confirm"
  ) => {
    setConfirmTitle(title);
    setConfirmDesc(desc);
    setConfirmAction(() => action);
    setConfirmVariant(variant);
    setConfirmLabel(label);
    setConfirmOpen(true);
  };

  // ──────────────────────────────────────────────────────────
  // Load customers + balances
  // ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cusRes = await fetch("/api/customers");
      if (!cusRes.ok) { toast.error("Failed to load customers"); return; }
      const cusData = await cusRes.json();
      setCustomers(cusData.customers ?? []);

      const balRes = await fetch("/api/reports/customer-balance");
      if (balRes.ok) {
        const bal = await balRes.json();
        setBalances(typeof bal === "object" && !Array.isArray(bal) ? bal : {});
      }
    } catch {
      toast.error("Failed to load customer data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ──────────────────────────────────────────────────────────
  // Derived lists — split by active/inactive
  // ──────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  const activeCustomers = useMemo(
    () => filteredCustomers.filter((c) => c.is_active),
    [filteredCustomers]
  );
  const inactiveCustomers = useMemo(
    () => filteredCustomers.filter((c) => !c.is_active),
    [filteredCustomers]
  );

  // ──────────────────────────────────────────────────────────
  // Add handler
  // ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          type: addForm.type,
          phone: addForm.phone.trim() || null,
          opening_balance: parseFloat(addForm.opening_balance) || 0,
        }),
      });
      if (!res.ok) {
        throw new Error(await apiError(res, "Failed to add customer"));
      }
      const data = await res.json();
      if (data.customer) {
        setCustomers((prev) => [...prev, data.customer].sort((a, b) =>
          a.name.localeCompare(b.name)
        ));
      }
      invalidateCache("customers");
      toast.success(`${addForm.name} added successfully`);
      setAddForm(emptyForm);
      setAddOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Edit handlers
  // ──────────────────────────────────────────────────────────
  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    setEditForm({
      name: c.name,
      phone: c.phone ?? "",
      type: c.type as "credit" | "cash",
      opening_balance: String(c.opening_balance ?? 0),
      is_active: c.is_active,
    });
  };

  const handleEditSave = async () => {
    if (!editCustomer) return;
    if (!editForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editCustomer.id,
          name: editForm.name.trim(),
          type: editForm.type,
          phone: editForm.phone.trim() || null,
          opening_balance: parseFloat(editForm.opening_balance) || 0,
          is_active: editForm.is_active,
        }),
      });
      if (!res.ok) {
        throw new Error(await apiError(res, "Failed to update customer"));
      }
      const data = await res.json();
      if (data.customer) {
        setCustomers((prev) =>
          prev.map((c) => (c.id === editCustomer.id ? data.customer : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      invalidateCache("customers");
      toast.success(`${editForm.name} updated`);
      setEditCustomer(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Soft-delete (deactivate) — customer becomes "Inactive" but still visible
  // ──────────────────────────────────────────────────────────
  const handleSoftDelete = (c: Customer) => {
    askConfirm(
      "Deactivate Customer",
      `${c.name} ko deactivate kar dein? Ye customer sale/purchase dropdowns se gayab ho jayega lekin historical records safe rahenge. Aap isko baad me Restore kar sakte hain.`,
      async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/customers?id=${c.id}&mode=soft`, { method: "DELETE" });
          if (!res.ok) {
            // Server may have fallen back to soft-delete already; check note
            const json = await res.json().catch(() => ({}));
            if (json?.action === "soft_deleted") {
              // Already soft-deleted — treat as success
            } else {
              throw new Error(await apiError(res, "Failed"));
            }
          }
          setCustomers((prev) =>
            prev.map((x) => (x.id === c.id ? { ...x, is_active: false } : x))
          );
          invalidateCache("customers");
          toast.success(`${c.name} deactivated`);
        } catch (e: any) {
          toast.error(e.message || "Failed to deactivate");
        } finally {
          setConfirmLoading(false);
          setConfirmOpen(false);
        }
      },
      "warning",
      "Haan, Deactivate Karo"
    );
  };

  // ──────────────────────────────────────────────────────────
  // Restore inactive customer
  // ──────────────────────────────────────────────────────────
  const handleRestore = (c: Customer) => {
    askConfirm(
      "Restore Customer",
      `${c.name} ko wapas active karein? Ye customer dobara sale/purchase dropdowns me dikhega.`,
      async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/customers?id=${c.id}&mode=restore`, { method: "DELETE" });
          if (!res.ok) throw new Error(await apiError(res, "Failed"));
          setCustomers((prev) =>
            prev.map((x) => (x.id === c.id ? { ...x, is_active: true } : x))
          );
          invalidateCache("customers");
          toast.success(`${c.name} restored`);
        } catch (e: any) {
          toast.error(e.message || "Failed to restore");
        } finally {
          setConfirmLoading(false);
          setConfirmOpen(false);
        }
      },
      "info",
      "Haan, Restore Karo"
    );
  };

  // ──────────────────────────────────────────────────────────
  // Permanent delete (tombstone) — irreversibly hide from UI
  // ──────────────────────────────────────────────────────────
  const handlePermanentDelete = (c: Customer) => {
    askConfirm(
      "Delete Permanently",
      `${c.name} ko PERMANENTLY delete karein? Ye action reverse nahi hoga. Customer sabhi UI surfaces se gayab ho jayega (dropdowns, Manage page, etc) lekin historical sales/purchases records safe rahenge — purani receipts par naam abhi bhi dikhega. Aap isko Restore nahi kar sakte.`,
      async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/customers?id=${c.id}&mode=permanent`, { method: "DELETE" });
          if (!res.ok) throw new Error(await apiError(res, "Failed"));
          setCustomers((prev) => prev.filter((x) => x.id !== c.id));
          invalidateCache("customers");
          toast.success(`${c.name} permanently deleted`);
        } catch (e: any) {
          toast.error(e.message || "Failed to delete permanently");
        } finally {
          setConfirmLoading(false);
          setConfirmOpen(false);
        }
      },
      "danger",
      "Haan, Permanently Delete Karo"
    );
  };

  // ──────────────────────────────────────────────────────────
  // Excel download — fetch all customers (including inactive) + balances
  // ──────────────────────────────────────────────────────────
  const handleDownloadExcel = async () => {
    try {
      toast.loading("Generating Excel…", { id: "excel-dl" });
      const XLSX = await import("xlsx");

      // Use current in-memory list (already includes inactive since
      // we fetch without ?active=true). Sort by name for stable output.
      const rows: any[] = [...customers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c, idx) => {
          const b = balances[c.id];
          const due = b?.balance_due ?? c.opening_balance ?? 0;
          const totalBill = b?.total_bill ?? 0;
          const cashPaid = b?.total_cash_paid ?? 0;
          const goods = b?.total_goods_value ?? 0;
          return {
            "#": idx + 1,
            Name: c.name,
            Type: c.type,
            Phone: c.phone ?? "",
            Status: c.is_active ? "Active" : "Inactive",
            "Opening Balance (Rs.)": c.opening_balance ?? 0,
            "Total Billed (Rs.)": totalBill,
            "Cash Paid (Rs.)": cashPaid,
            "Paid in Goods (Rs.)": goods,
            "Balance Due (Rs.)": due,
            "Joined On": c.created_at?.slice(0, 10) ?? "",
          };
        });

      // Totals row
      const totalOb = rows.reduce((s, r) => s + (r["Opening Balance (Rs.)"] || 0), 0);
      const totalBill = rows.reduce((s, r) => s + (r["Total Billed (Rs.)"] || 0), 0);
      const totalCash = rows.reduce((s, r) => s + (r["Cash Paid (Rs.)"] || 0), 0);
      const totalGoods = rows.reduce((s, r) => s + (r["Paid in Goods (Rs.)"] || 0), 0);
      const totalDue = rows.reduce((s, r) => s + (r["Balance Due (Rs.)"] || 0), 0);
      rows.push({
        "#": "",
        Name: "",
        Type: "",
        Phone: "",
        Status: "",
        "Opening Balance (Rs.)": totalOb,
        "Total Billed (Rs.)": totalBill,
        "Cash Paid (Rs.)": totalCash,
        "Paid in Goods (Rs.)": totalGoods,
        "Balance Due (Rs.)": totalDue,
        "Joined On": "TOTAL",
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 },  // #
        { wch: 25 }, // Name
        { wch: 10 }, // Type
        { wch: 15 }, // Phone
        { wch: 10 }, // Status
        { wch: 18 }, // OB
        { wch: 18 }, // Total Billed
        { wch: 18 }, // Cash Paid
        { wch: 18 }, // Paid in Goods
        { wch: 18 }, // Balance Due
        { wch: 12 }, // Joined
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `customers_${today}.xlsx`);
      toast.success("Excel downloaded!", { id: "excel-dl" });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate Excel", { id: "excel-dl" });
    }
  };

  // ──────────────────────────────────────────────────────────
  // Loading state
  // ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Customers"
        subtitle="Register, edit, deactivate, permanently delete customers — and download Excel"
      />

      {/* ─── Summary + Action bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-white border border-slate-200/60 px-4 py-2.5 shadow-sm">
            <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold">Active</div>
            <div className="text-xl font-extrabold text-emerald-600">{activeCustomers.length}</div>
          </div>
          <div className="rounded-xl bg-white border border-slate-200/60 px-4 py-2.5 shadow-sm">
            <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold">Inactive</div>
            <div className="text-xl font-extrabold text-slate-500">{inactiveCustomers.length}</div>
          </div>
          <div className="rounded-xl bg-white border border-slate-200/60 px-4 py-2.5 shadow-sm">
            <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold">Total</div>
            <div className="text-xl font-extrabold text-slate-900">{customers.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadExcel}
            disabled={customers.length === 0}
            className="cursor-pointer"
          >
            <Download className="size-4 mr-2" />
            Download Excel
          </Button>
          <Button
            onClick={() => { setAddForm(emptyForm); setAddOpen(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            <UserPlus className="size-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* ─── Search ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Active Customers ─── */}
      <Card className="rounded-2xl border-slate-200/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="size-5 text-emerald-600" />
            Active Customers
            <Badge variant="secondary" className="ml-1">{activeCustomers.length}</Badge>
          </CardTitle>
          <CardDescription>
            Active customers sale/purchase dropdowns me dikhte hain. Edit, Deactivate ya Permanently Delete kar sakte hain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeCustomers.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Users className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {search ? "No active customers match your search." : "Koi active customer nahi hai. Upse 'Add Customer' button se naya banayein."}
              </p>
            </div>
          ) : (
            <CustomerTable
              customers={activeCustomers}
              balances={balances}
              onEdit={openEdit}
              onSoftDelete={handleSoftDelete}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              isActiveList
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Inactive Customers ─── */}
      {inactiveCustomers.length > 0 && (
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Ban className="size-5 text-slate-500" />
              Inactive Customers
              <Badge variant="secondary" className="ml-1">{inactiveCustomers.length}</Badge>
            </CardTitle>
            <CardDescription>
              Inactive customers sale/purchase dropdowns se gayab hain. Restore kar sakte hain ya permanently delete kar sakte hain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerTable
              customers={inactiveCustomers}
              balances={balances}
              onEdit={openEdit}
              onSoftDelete={handleSoftDelete}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              isActiveList={false}
            />
          </CardContent>
        </Card>
      )}

      {/* ─── Add Dialog ─── */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddForm(emptyForm); }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Register New Customer</DialogTitle>
            <DialogDescription>
              Naya customer add karein. Type aur opening balance baad me edit kar sakte hain.
            </DialogDescription>
          </DialogHeader>
          <CustomerFormFields
            form={addForm}
            setForm={setAddForm}
            submitting={submitting}
            onSubmit={handleAdd}
            submitLabel="Add Customer"
          />
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={!!editCustomer} onOpenChange={(o) => { if (!o) setEditCustomer(null); }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Edit Customer — {editCustomer?.name}</DialogTitle>
            <DialogDescription>
              Customer details edit karein. Sirf changed fields update honge.
            </DialogDescription>
          </DialogHeader>
          <CustomerFormFields
            form={editForm}
            setForm={setEditForm}
            submitting={submitting}
            onSubmit={handleEditSave}
            submitLabel="Save Changes"
            showActiveToggle
          />
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Dialog ─── */}
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel={confirmLabel}
        variant={confirmVariant}
        onConfirm={confirmAction ?? (() => {})}
        loading={confirmLoading}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-component: Customer table (renders both active + inactive lists)
// ──────────────────────────────────────────────────────────
function CustomerTable({
  customers,
  balances,
  onEdit,
  onSoftDelete,
  onRestore,
  onPermanentDelete,
  isActiveList,
}: {
  customers: Customer[];
  balances: Record<number, BalanceRow>;
  onEdit: (c: Customer) => void;
  onSoftDelete: (c: Customer) => void;
  onRestore: (c: Customer) => void;
  onPermanentDelete: (c: Customer) => void;
  isActiveList: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Customer</th>
            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Type</th>
            <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Opening Balance</th>
            <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Balance Due</th>
            <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Joined</th>
            <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => {
            const b = balances[c.id];
            const due = b?.balance_due ?? c.opening_balance ?? 0;
            const ob = c.opening_balance ?? 0;
            return (
              <tr
                key={c.id}
                className={cn(
                  "border-b border-slate-50 last:border-b-0 transition-colors hover:bg-slate-50/60",
                  !c.is_active && "opacity-60"
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  {c.phone && (
                    <div className="text-[0.65rem] text-slate-400 flex items-center gap-1 mt-0.5">
                      <PhoneIcon className="size-3" /> {c.phone}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={c.type === "credit" ? "default" : "secondary"} className="text-xs">
                    {c.type}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {ob > 0 ? (
                    <span className="font-medium text-amber-700">Rs. {fmt(ob)}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  Rs. {fmt(due)}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {c.created_at?.slice(0, 10) ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(c)}
                      className="size-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    {isActiveList ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSoftDelete(c)}
                        className="size-8 p-0 text-orange-500 hover:text-orange-700 hover:bg-orange-50 cursor-pointer"
                        title="Deactivate"
                      >
                        <Ban className="size-3.5" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRestore(c)}
                          className="size-8 p-0 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          title="Restore"
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onPermanentDelete(c)}
                          className="size-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          title="Delete Permanently"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-component: Form fields used in both Add + Edit dialogs
// ──────────────────────────────────────────────────────────
function CustomerFormFields({
  form,
  setForm,
  submitting,
  onSubmit,
  submitLabel,
  showActiveToggle = false,
}: {
  form: CustomerForm;
  setForm: (f: CustomerForm) => void;
  submitting: boolean;
  onSubmit: () => void;
  submitLabel: string;
  showActiveToggle?: boolean;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Full Name *</Label>
        <Input
          placeholder="Customer name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Phone className="size-3.5" /> Phone (optional)
        </Label>
        <Input
          placeholder="03XX-XXXXXXX"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Customer Type</Label>
        <RadioGroup
          value={form.type}
          onValueChange={(v) => setForm({ ...form, type: v as "credit" | "cash" })}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="credit" id="ctype-credit" />
            <Label htmlFor="ctype-credit" className="font-normal cursor-pointer">
              Credit (ادھار کھاتہ)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="cash" id="ctype-cash" />
            <Label htmlFor="ctype-cash" className="font-normal cursor-pointer">
              Cash (نقد)
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Opening Balance (Rs.) — purana balance</Label>
        <Input
          type="number"
          min="0"
          step="100"
          placeholder="0"
          value={form.opening_balance}
          onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
        />
        <p className="text-[11px] text-slate-500 leading-tight">
          Agar customer ka koi purana balance hai jo aap ko pata hai (system se pehle ke sales),
          wo yahan likh dein. Customer ki Khata me <strong>opening balance</strong> ke roop me
          save hoga.
        </p>
        {parseFloat(form.opening_balance) > 0 && (
          <p className="text-[0.65rem] text-slate-400 capitalize">
            {numberToWords(parseFloat(form.opening_balance) || 0)}
          </p>
        )}
      </div>

      {showActiveToggle && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.is_active ? "active" : "inactive"}
            onValueChange={(v) => setForm({ ...form, is_active: v === "active" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (sale/purchase dropdowns me dikhega)</SelectItem>
              <SelectItem value="inactive">Inactive (dropdowns se gayab, lekin data safe)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        onClick={onSubmit}
        disabled={submitting}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
      >
        {submitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <UserPlus className="size-4 mr-2" />}
        {submitting ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}
