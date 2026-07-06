"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { apiError } from "@/store";
import type { BackupFilter } from "@/types";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Database,
  Download,
  Loader2,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileJson,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { pktToday } from "@/lib/pkt-date";
import { cn } from "@/lib/utils";

const FILTER_OPTIONS: { value: BackupFilter; label: string; description: string }[] = [
  {
    value: "all",
    label: "All Database",
    description: "Everything since the day you started using the app",
  },
  {
    value: "today",
    label: "Today Only",
    description: "Only today's transactions (master data is always included)",
  },
  {
    value: "month",
    label: "This Month",
    description: "From the 1st of this month to today",
  },
  {
    value: "year",
    label: "This Year (Jan–Dec)",
    description: "From January 1st of this year to today",
  },
  {
    value: "custom",
    label: "Custom Range",
    description: "Pick any from/to dates",
  },
];

const INCLUDED_TABLES = [
  { name: "Products", category: "Master", note: "Always included" },
  { name: "Locations", category: "Master", note: "Always included" },
  { name: "Customers (business)", category: "Master", note: "Always included" },
  { name: "Suppliers", category: "Master", note: "Always included" },
  { name: "Cash Accounts", category: "Master", note: "Always included" },
  { name: "Product Stock", category: "Master", note: "Current snapshot — always included" },
  { name: "Sales", category: "Transactional", note: "Date-filtered" },
  { name: "Mix Orders", category: "Transactional", note: "Date-filtered" },
  { name: "Purchases", category: "Transactional", note: "Date-filtered" },
  { name: "Expenses", category: "Transactional", note: "Date-filtered" },
  { name: "Cash Ledger", category: "Transactional", note: "Date-filtered" },
  { name: "Cash Transfers", category: "Transactional", note: "Date-filtered" },
];

export default function DatabaseManagementPage() {
  const [filter, setFilter] = useState<BackupFilter>("all");
  const [from, setFrom] = useState<string>(pktToday());
  const [to, setTo] = useState<string>(pktToday());
  const [downloading, setDownloading] = useState(false);

  const isCustom = filter === "custom";
  const today = pktToday();

  const rangePreview = useMemo(() => {
    switch (filter) {
      case "all":
        return null;
      case "today":
        return today;
      case "month": {
        const d = new Date(today + "T00:00:00+05:00");
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        return `${first.toISOString().slice(0, 10)} → ${today}`;
      }
      case "year": {
        const d = new Date(today + "T00:00:00+05:00");
        return `${d.getFullYear()}-01-01 → ${today}`;
      }
      case "custom":
        return `${from} → ${to}`;
    }
  }, [filter, today, from, to]);

  const handleDownload = async () => {
    if (isCustom) {
      if (!from || !to) {
        toast.error("Please pick both From and To dates");
        return;
      }
      if (from > to) {
        toast.error("From date must be before or equal to To date");
        return;
      }
    }

    setDownloading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (isCustom) {
        params.set("from", from);
        params.set("to", to);
      }

      toast.loading("Generating backup…", { id: "backup-dl" });

      const res = await fetch(`/api/database/backup?${params.toString()}`);
      if (!res.ok) {
        const detail = await apiError(res, "Failed to generate backup");
        throw new Error(detail);
      }

      // Read response as blob and trigger download
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `backup_${today}_${filter}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Backup downloaded successfully!", { id: "backup-dl" });
    } catch (e: any) {
      toast.error(e.message || "Failed to download backup", { id: "backup-dl" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <PageHeader
          title="Database Management"
          subtitle="Danish Cattle Feed — Backup & Restore"
        />

        {/* Info banner — what this is */}
        <Card className="rounded-2xl border-blue-200/60 bg-blue-50/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Database className="size-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Download a backup of your data</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Export all your business data (products, customers, sales, purchases, cash, stock, etc.)
                  into a single JSON file you can save on your laptop. If you ever lose data —
                  accidental delete, bug, or Supabase issue — you can restore from this file
                  by running a SQL script in Supabase SQL Editor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter selection */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="size-5 text-slate-600" /> 1. Choose What to Backup
            </CardTitle>
            <CardDescription>
              Master data (products, customers, suppliers, etc.) is always included.
              Date filters apply only to transactions (sales, purchases, expenses, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={filter}
              onValueChange={(v) => setFilter(v as BackupFilter)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {FILTER_OPTIONS.map((opt) => {
                const isActive = filter === opt.value;
                return (
                  <label
                    key={opt.value}
                    htmlFor={`bf-${opt.value}`}
                    className={cn(
                      "flex items-start space-x-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors",
                      isActive
                        ? "border-emerald-500 bg-emerald-50/40"
                        : "border-slate-200/60 bg-slate-50/40 hover:bg-slate-50"
                    )}
                  >
                    <RadioGroupItem value={opt.value} id={`bf-${opt.value}`} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{opt.description}</div>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>

            {/* Custom date range */}
            {isCustom && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-emerald-200/60 bg-emerald-50/20">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    From Date
                  </Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    max={to}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    To Date
                  </Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    min={from}
                    max={today}
                  />
                </div>
              </div>
            )}

            {/* Range preview */}
            {rangePreview && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-100/80 px-4 py-2.5 border border-slate-200/60">
                <Clock className="size-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Date Range:
                </span>
                <span className="text-sm font-mono text-slate-900">{rangePreview}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What's included */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileJson className="size-5 text-slate-600" /> 2. What's Inside the Backup
            </CardTitle>
            <CardDescription>
              The JSON file contains all 12 business tables. Login passwords are excluded for security.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INCLUDED_TABLES.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between rounded-lg border border-slate-200/60 px-3 py-2 bg-slate-50/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{t.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {t.category} · {t.note}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-800">
              <ShieldCheck className="size-4 text-amber-600" />
              <AlertDescription>
                <span className="font-semibold">Security note:</span> Login accounts
                (with password hashes) are <span className="font-semibold">NOT</span> included in the backup.
                Supabase Auth handles admin accounts separately — those are managed through the
                Supabase Dashboard, not this export.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Download */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download className="size-5 text-slate-600" /> 3. Download Backup File
            </CardTitle>
            <CardDescription>
              Click below to generate and download a JSON backup file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-300 bg-blue-50 text-blue-800">
              <AlertTriangle className="size-4 text-blue-600" />
              <AlertDescription>
                <span className="font-semibold">Heads up:</span> The download may take a few seconds
                depending on how much data you have. Keep this file safe — anyone with access to it
                can read your full business history.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <div className="font-semibold text-slate-800">
                  Filter: <span className="text-emerald-700 capitalize">{filter}</span>
                </div>
                {rangePreview && (
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">{rangePreview}</div>
                )}
              </div>

              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 min-w-[180px]"
                size="lg"
              >
                {downloading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> Download JSON Backup
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Restore note — informational only for now */}
        <Card className="rounded-2xl border-slate-200/60 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" /> About Restore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600 leading-relaxed">
              Restoring from a backup file is currently a <span className="font-semibold">manual process</span> to
              prevent accidental data loss. If you ever need to restore, contact support or follow
              the restore documentation (Phase 2). A future update may add a one-click restore
              feature with safety checks.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
