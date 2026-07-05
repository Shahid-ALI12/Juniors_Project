"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { mockAccountBalances } from "@/lib/mock-data";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Banknote,
  Lock,
  BarChart3,
  ArrowRightLeft,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface Transfer {
  id: number;
  date: string;
  from: string;
  to: string;
  amount: number;
  notes: string;
}

export default function CashManagementPage() {
  const [balances, setBalances] = useState<Record<string, number>>({
    ...mockAccountBalances,
  });

  const [transfers, setTransfers] = useState<Transfer[]>([
    {
      id: 1,
      date: "2025-06-10",
      from: "Cash In Locker",
      to: "Cash In Hand",
      amount: 20000,
      notes: "Weekly withdrawal for shop expenses",
    },
    {
      id: 2,
      date: "2025-06-08",
      from: "Cash In Hand",
      to: "Cash In Locker",
      amount: 35000,
      notes: "Excess cash moved to locker",
    },
    {
      id: 3,
      date: "2025-06-05",
      from: "Cash In Locker",
      to: "Cash In Hand",
      amount: 15000,
      notes: "Customer payment received in locker",
    },
  ]);

  // Transfer form state
  const [transferDirection, setTransferDirection] = useState<
    "locker-to-hand" | "hand-to-locker"
  >("locker-to-hand");
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSuccess, setTransferSuccess] = useState(false);

  // Table filter
  const [dateFilter, setDateFilter] = useState("");

  // Correction state
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionAccount, setCorrectionAccount] = useState<
    "Cash In Hand" | "Cash In Locker"
  >("Cash In Hand");
  const [correctionTarget, setCorrectionTarget] = useState("");
  const [correctionSuccess, setCorrectionSuccess] = useState(false);

  const totalCash =
    (balances["Cash In Hand"] ?? 0) + (balances["Cash In Locker"] ?? 0);

  const filteredTransfers = useMemo(() => {
    if (!dateFilter) return transfers;
    return transfers.filter((t) => t.date === dateFilter);
  }, [transfers, dateFilter]);

  function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!amount || amount <= 0) return;

    const isLockerToHand = transferDirection === "locker-to-hand";
    const fromAccount = isLockerToHand ? "Cash In Locker" : "Cash In Hand";
    const toAccount = isLockerToHand ? "Cash In Hand" : "Cash In Locker";

    // Check sufficient balance
    if ((balances[fromAccount] ?? 0) < amount) return;

    setBalances((prev) => ({
      ...prev,
      [fromAccount]: (prev[fromAccount] ?? 0) - amount,
      [toAccount]: (prev[toAccount] ?? 0) + amount,
    }));

    setTransfers((prev) => [
      {
        id: Date.now(),
        date: transferDate,
        from: fromAccount,
        to: toAccount,
        amount,
        notes: transferNotes || "—",
      },
      ...prev,
    ]);

    setTransferAmount("");
    setTransferNotes("");
    setTransferSuccess(true);
    setTimeout(() => setTransferSuccess(false), 3000);
  }

  function handleCorrectionSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = parseFloat(correctionTarget);
    if (isNaN(target) || target < 0) return;

    setBalances((prev) => ({
      ...prev,
      [correctionAccount]: target,
    }));

    setCorrectionTarget("");
    setCorrectionSuccess(true);
    setTimeout(() => setCorrectionSuccess(false), 3000);
  }

  const formatRs = (val: number) =>
    val.toLocaleString("en-PK", { minimumFractionDigits: 0 });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <PageHeader
          title="Cash Management"
          subtitle="Track cash in hand vs cash in locker — transfer & correct balances"
        />

        {/* ── 1. Balance Overview ── */}
        <section className="mb-8" aria-label="Balance overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="💵 Cash In Hand"
              value={`Rs. ${formatRs(balances["Cash In Hand"] ?? 0)}`}
              color="green"
            />
            <MetricCard
              label="🔒 Cash In Locker"
              value={`Rs. ${formatRs(balances["Cash In Locker"] ?? 0)}`}
              color="purple"
            />
            <MetricCard
              label="📊 Total Cash"
              value={`Rs. ${formatRs(totalCash)}`}
              color="blue"
            />
          </div>
          <p className="mt-2 text-xs text-slate-400 text-center sm:text-left">
            Total Cash is always Hand + Locker.
          </p>
        </section>

        {/* ── 2. Transfer Cash Form ── */}
        <section
          className="mb-8 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
          aria-label="Transfer cash"
        >
          <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
            <ArrowRightLeft className="size-5 text-slate-500" />
            Transfer Cash
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            Move money between Cash In Hand and Cash In Locker.
          </p>

          {transferSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="size-4 shrink-0" />
              Transfer recorded successfully! Balances have been updated.
            </div>
          )}

          <form onSubmit={handleTransferSubmit} className="space-y-5">
            {/* Direction */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Direction
              </Label>
              <RadioGroup
                value={transferDirection}
                onValueChange={(v) =>
                  setTransferDirection(
                    v as "locker-to-hand" | "hand-to-locker"
                  )
                }
                className="flex flex-wrap gap-4 sm:gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="locker-to-hand" id="locker-to-hand" />
                  <Label
                    htmlFor="locker-to-hand"
                    className="text-sm font-normal cursor-pointer"
                  >
                    <Lock className="inline size-3.5 mr-1 text-purple-500" />
                    Locker →{" "}
                    <Banknote className="inline size-3.5 mx-1 text-green-500" />
                    Hand
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="hand-to-locker" id="hand-to-locker" />
                  <Label
                    htmlFor="hand-to-locker"
                    className="text-sm font-normal cursor-pointer"
                  >
                    <Banknote className="inline size-3.5 mr-1 text-green-500" />
                    Hand →{" "}
                    <Lock className="inline size-3.5 mx-1 text-purple-500" />
                    Locker
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Date + Amount row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transfer-date" className="text-sm font-medium text-slate-700">
                  Date
                </Label>
                <Input
                  id="transfer-date"
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-amount" className="text-sm font-medium text-slate-700">
                  Amount (Rs.)
                </Label>
                <Input
                  id="transfer-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 10000"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="max-w-xs"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="transfer-notes" className="text-sm font-medium text-slate-700">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="transfer-notes"
                type="text"
                placeholder="Reason for transfer…"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                className="max-w-md"
              />
            </div>

            <Button type="submit" className="gap-2">
              <ArrowRightLeft className="size-4" />
              Record Transfer
            </Button>
          </form>
        </section>

        {/* ── 3. Recent Transfers Table ── */}
        <section
          className="mb-8 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
          aria-label="Recent transfers"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="size-5 text-slate-500" />
              Recent Transfers
            </h2>
            <div className="space-y-1">
              <Label htmlFor="date-filter" className="sr-only">
                Filter by date
              </Label>
              <Input
                id="date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                placeholder="Filter by date"
                className="w-full sm:w-auto"
              />
            </div>
          </div>

          {filteredTransfers.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No transfers found for the selected date.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-slate-600">{t.date}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {t.from === "Cash In Locker" ? (
                            <Lock className="size-3.5 text-purple-500" />
                          ) : (
                            <Banknote className="size-3.5 text-green-500" />
                          )}
                          {t.from}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {t.to === "Cash In Locker" ? (
                            <Lock className="size-3.5 text-purple-500" />
                          ) : (
                            <Banknote className="size-3.5 text-green-500" />
                          )}
                          {t.to}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        Rs. {formatRs(t.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-slate-500 max-w-[200px] truncate">
                        {t.notes}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* ── 4. Manual Correction (Collapsible) ── */}
        <section
          className="rounded-2xl border border-slate-200/60 bg-white shadow-sm"
          aria-label="Manual correction"
        >
          <Collapsible open={correctionOpen} onOpenChange={setCorrectionOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between p-6 text-left hover:bg-slate-50/60 transition-colors rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-amber-500" />
                  Manual Correction
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Directly set a cash account balance — use with caution.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "size-5 text-slate-400 shrink-0 transition-transform duration-200",
                  correctionOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t border-slate-100 px-6 pb-6 pt-5">
                {correctionSuccess && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                    <CheckCircle2 className="size-4 shrink-0" />
                    Balance corrected successfully!
                  </div>
                )}

                <form
                  onSubmit={handleCorrectionSubmit}
                  className="space-y-5"
                >
                  {/* Account select + current balance */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Account
                      </Label>
                      <Select
                        value={correctionAccount}
                        onValueChange={(v) =>
                          setCorrectionAccount(
                            v as "Cash In Hand" | "Cash In Locker"
                          )
                        }
                      >
                        <SelectTrigger className="w-full sm:w-[220px]">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash In Hand">
                            <span className="inline-flex items-center gap-1.5">
                              <Banknote className="size-3.5 text-green-500" />
                              Cash In Hand
                            </span>
                          </SelectItem>
                          <SelectItem value="Cash In Locker">
                            <span className="inline-flex items-center gap-1.5">
                              <Lock className="size-3.5 text-purple-500" />
                              Cash In Locker
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Current Balance
                      </Label>
                      <div className="flex items-center h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 w-full sm:w-[220px]">
                        Rs.{" "}
                        {formatRs(balances[correctionAccount] ?? 0)}
                      </div>
                    </div>
                  </div>

                  {/* Target balance */}
                  <div className="space-y-2 max-w-xs">
                    <Label
                      htmlFor="correction-target"
                      className="text-sm font-medium text-slate-700"
                    >
                      Target Balance (Rs.)
                    </Label>
                    <Input
                      id="correction-target"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Enter correct balance"
                      value={correctionTarget}
                      onChange={(e) => setCorrectionTarget(e.target.value)}
                      required
                    />
                  </div>

                  <Button type="submit" variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800">
                    <AlertTriangle className="size-4" />
                    Apply Correction
                  </Button>
                </form>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>
      </div>
    </main>
  );
}