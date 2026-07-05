"use client";

import { useState, useMemo, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Search,
  Download,
  Scale,
  Weight,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMixStore } from "@/store";
import { mockSales, mockProducts, mockLocations } from "@/lib/mock-data";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import type { MixIngredient } from "@/types";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/* ─── Helpers ─── */
function fmtRs(n: number) {
  return n.toLocaleString("en-PK");
}

const today = new Date().toISOString().split("T")[0];

/* ─── Past Mix Orders grouped from mockSales ─── */
function usePastMixOrders(search: string) {
  return useMemo(() => {
    const mixSales = mockSales.filter((s) => s.mix_order_id);
    const grouped: Record<
      string,
      {
        id: string;
        customer: string;
        date: string;
        location: string;
        sales: typeof mixSales;
      }
    > = {};

    for (const s of mixSales) {
      const key = s.mix_order_id!;
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          customer: s.customers?.name ?? "—",
          date: s.sale_date,
          location: s.locations?.name ?? "—",
          sales: [],
        };
      }
      grouped[key].sales.push(s);
    }

    const list = Object.values(grouped);
    if (search.trim()) {
      const q = search.toLowerCase();
      return list.filter((o) => o.customer.toLowerCase().includes(q));
    }
    return list;
  }, [search]);
}

/* ─── Component ─── */
export default function CustomMixOrder() {
  const store = useMixStore();
  const isBuilding = store.targetWeight !== null;

  /* ── State 1 form ── */
  const [s1Name, setS1Name] = useState("");
  const [s1Type, setS1Type] = useState<"credit" | "cash">("credit");
  const [s1Loc, setS1Loc] = useState<string>("");
  const [s1Date, setS1Date] = useState(today);
  const [s1Target, setS1Target] = useState("");

  /* ── State 2 form ── */
  const [addProduct, setAddProduct] = useState<string>("");
  const [addWeight, setAddWeight] = useState("");
  const [addRate, setAddRate] = useState("");
  const [cashReceived, setCashReceived] = useState("");

  /* ── Past orders ── */
  const [pastSearch, setPastSearch] = useState("");
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);

  const pastOrders = usePastMixOrders(pastSearch);
  const selectedPast = pastOrders.find((o) => o.id === selectedPastId) ?? null;

  const usedWeight = store.getUsedWeight();
  const totalAmount = store.getTotalAmount();
  const remaining = (store.targetWeight ?? 0) - usedWeight;

  /* ── Handlers ── */
  const handleStartOrder = useCallback(() => {
    const locId = Number(s1Loc);
    const target = Number(s1Target);
    if (!s1Name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!s1Loc) {
      toast.error("Please select a location");
      return;
    }
    if (!target || target <= 0) {
      toast.error("Enter a valid target weight");
      return;
    }
    store.startOrder(s1Name.trim(), s1Type, s1Date, locId, target);
    toast.success("Mix order started — add ingredients below");
  }, [s1Name, s1Type, s1Loc, s1Date, s1Target, store]);

  const handleAddIngredient = useCallback(() => {
    if (!addProduct) {
      toast.error("Select a product");
      return;
    }
    const weight = Number(addWeight);
    const rate = Number(addRate);
    if (!weight || weight <= 0) {
      toast.error("Enter a valid weight");
      return;
    }
    if (!rate || rate <= 0) {
      toast.error("Enter a valid rate per kg");
      return;
    }
    const product = mockProducts.find((p) => p.id === Number(addProduct));
    if (!product) return;

    const ing: MixIngredient = {
      product: product.name,
      product_id: product.id,
      weight_kg: weight,
      rate_per_kg: rate,
      amount: weight * rate,
    };
    store.addIngredient(ing);
    setAddProduct("");
    setAddWeight("");
    setAddRate("");
    toast.success(`${product.name} added to mix`);
  }, [addProduct, addWeight, addRate, store]);

  const handleFinishOrder = useCallback(() => {
    if (store.ingredients.length === 0) {
      toast.error("Add at least one ingredient before finishing");
      return;
    }
    if (store.customerType === "cash") {
      const cash = Number(cashReceived);
      if (!cash || cash < 0) {
        toast.error("Enter cash received amount");
        return;
      }
    }
    store.reset();
    setCashReceived("");
    setAddProduct("");
    setAddWeight("");
    setAddRate("");
    setS1Name("");
    setS1Type("credit");
    setS1Loc("");
    setS1Date(today);
    setS1Target("");
    toast.success("Order finished & bill generated successfully!");
  }, [store, cashReceived]);

  const handleCancel = useCallback(() => {
    store.reset();
    setCashReceived("");
    setAddProduct("");
    setAddWeight("");
    setAddRate("");
    toast.info("Order cancelled");
  }, [store]);

  /* ─────────────────────────────── STATE 1 ─────────────────────────────── */
  if (!isBuilding) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          <PageHeader
            title="Custom Mix Order"
            subtitle="Build a custom cattle feed mix bill with multiple ingredients"
          />

          {/* Start New Order Form */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-5 h-5 text-slate-500" />
              <h2 className="text-base font-bold text-slate-800">
                Start a New Mix Order
              </h2>
            </div>

            {/* Customer Name */}
            <div className="space-y-2">
              <Label htmlFor="customer-name" className="text-slate-600">
                Customer Name
              </Label>
              <Input
                id="customer-name"
                placeholder="e.g. Chaudhry Feed Farm"
                value={s1Name}
                onChange={(e) => setS1Name(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Customer Type */}
            <div className="space-y-3">
              <Label className="text-slate-600">Customer Type</Label>
              <RadioGroup
                value={s1Type}
                onValueChange={(v) => setS1Type(v as "credit" | "cash")}
                className="flex flex-row gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="credit" id="type-credit" />
                  <Label
                    htmlFor="type-credit"
                    className="font-normal cursor-pointer"
                  >
                    Credit (Udhaar)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="type-cash" />
                  <Label
                    htmlFor="type-cash"
                    className="font-normal cursor-pointer"
                  >
                    Cash (Nagad)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Location */}
            <div className="space-y-3">
              <Label className="text-slate-600">Location</Label>
              <RadioGroup
                value={s1Loc}
                onValueChange={setS1Loc}
                className="flex flex-row gap-6"
              >
                {mockLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={String(loc.id)}
                      id={`loc-${loc.id}`}
                    />
                    <Label
                      htmlFor={`loc-${loc.id}`}
                      className="font-normal cursor-pointer"
                    >
                      {loc.name}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Order Date & Target Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order-date" className="text-slate-600">
                  Order Date
                </Label>
                <Input
                  id="order-date"
                  type="date"
                  value={s1Date}
                  onChange={(e) => setS1Date(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="target-weight"
                  className="text-slate-600"
                >
                  Target Total Weight (kg)
                </Label>
                <Input
                  id="target-weight"
                  type="number"
                  min={1}
                  placeholder="e.g. 1000"
                  value={s1Target}
                  onChange={(e) => setS1Target(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </div>

            <Separator />

            <Button
              onClick={handleStartOrder}
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              <FlaskConical className="w-4 h-4 mr-1" />
              Start Order
            </Button>
          </div>

          {/* ── Past Mix Orders ── */}
          <PastMixOrdersSection
            pastSearch={pastSearch}
            setPastSearch={setPastSearch}
            pastOrders={pastOrders}
            selectedPastId={selectedPastId}
            setSelectedPastId={setSelectedPastId}
            selectedPast={selectedPast}
          />
        </div>
      </div>
    );
  }

  /* ─────────────────────────────── STATE 2 ─────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <PageHeader
          title="Custom Mix Order"
          subtitle={`Building mix for ${store.customerName} — ${store.orderDate}`}
        />

        {/* ── Metrics Row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Target Weight"
            value={`${fmtRs(store.targetWeight!)} kg`}
            color="blue"
          />
          <MetricCard
            label="Weight Used So Far"
            value={`${fmtRs(usedWeight)} kg`}
            color="purple"
          />
          <MetricCard
            label="Remaining to Fill"
            value={`${fmtRs(Math.max(0, remaining))} kg`}
            color={remaining <= 0 ? "green" : "orange"}
          />
        </div>

        {/* ── Add Ingredient Form ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Plus className="w-4 h-4 text-slate-400" />
            Add an Ingredient
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            {/* Product Select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-500">
                Product
              </Label>
              <Select value={addProduct} onValueChange={setAddProduct}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {mockProducts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weight */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-500">
                Weight (kg)
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="0"
                value={addWeight}
                onChange={(e) => setAddWeight(e.target.value)}
              />
            </div>

            {/* Rate */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-500">
                Rate / kg
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="0"
                value={addRate}
                onChange={(e) => setAddRate(e.target.value)}
              />
            </div>

            {/* Add Button */}
            <Button
              onClick={handleAddIngredient}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add to Mix
            </Button>
          </div>
        </div>

        {/* ── Current Mix Table ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-400" />
            Current Mix
            {store.ingredients.length > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-400">
                ({store.ingredients.length} item
                {store.ingredients.length > 1 ? "s" : ""})
              </span>
            )}
          </h3>

          {store.ingredients.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No ingredients added yet. Use the form above to start building
              your mix.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                      #
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                      Product
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                      Weight (kg)
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                      Rate/kg
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500 font-semibold w-16">
                      Del
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {store.ingredients.map((ing, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-slate-500 text-xs">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-slate-800 text-sm">
                        {ing.product}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {fmtRs(ing.weight_kg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {fmtRs(ing.rate_per_kg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-slate-800">
                        Rs. {fmtRs(ing.amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => store.removeIngredient(idx)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-slate-50/60 font-semibold">
                    <TableCell colSpan={2} className="text-slate-600 text-sm">
                      Total
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-800">
                      {fmtRs(usedWeight)} kg
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums text-sm text-slate-800">
                      Rs. {fmtRs(totalAmount)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── Bill Summary & Actions ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-5">
          {/* Bill So Far */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <Receipt className="w-5 h-5 text-green-600 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-bold uppercase text-slate-500">
                💰 Bill So Far
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
                Rs. {fmtRs(totalAmount)}
              </div>
            </div>
            {store.customerType === "credit" && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                Credit (Udhaar)
              </span>
            )}
            {store.customerType === "cash" && (
              <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                Cash (Nagad)
              </span>
            )}
          </div>

          {/* Cash Received (only for cash customers) */}
          {store.customerType === "cash" && (
            <div className="space-y-2">
              <Label htmlFor="cash-received" className="text-slate-600">
                Cash Received
              </Label>
              <div className="flex items-center gap-3 max-w-sm">
                <span className="text-sm font-medium text-slate-500">Rs.</span>
                <Input
                  id="cash-received"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
              </div>
              {Number(cashReceived) > 0 && (
                <p
                  className={cn(
                    "text-xs font-medium",
                    Number(cashReceived) >= totalAmount
                      ? "text-green-600"
                      : "text-red-500"
                  )}
                >
                  {Number(cashReceived) >= totalAmount
                    ? `Change: Rs. ${fmtRs(Number(cashReceived) - totalAmount)}`
                    : `Remaining: Rs. ${fmtRs(totalAmount - Number(cashReceived))}`}
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 sm:flex-none border-slate-300 hover:bg-slate-100"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              🔄 Cancel / Start Over
            </Button>
            <Button
              onClick={handleFinishOrder}
              className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              ✅ Finish Order & Generate Bill
            </Button>
          </div>
        </div>

        {/* ── Past Mix Orders ── */}
        <PastMixOrdersSection
          pastSearch={pastSearch}
          setPastSearch={setPastSearch}
          pastOrders={pastOrders}
          selectedPastId={selectedPastId}
          setSelectedPastId={setSelectedPastId}
          selectedPast={selectedPast}
        />
      </div>
    </div>
  );
}

/* ─── Past Mix Orders Sub-Section ─── */
function PastMixOrdersSection({
  pastSearch,
  setPastSearch,
  pastOrders,
  selectedPastId,
  setSelectedPastId,
  selectedPast,
}: {
  pastSearch: string;
  setPastSearch: (v: string) => void;
  pastOrders: ReturnType<typeof usePastMixOrders>;
  selectedPastId: string | null;
  setSelectedPastId: (v: string | null) => void;
  selectedPast: (typeof pastOrders)[number] | null;
}) {
  return (
    <section className="space-y-4">
      <Separator />
      <h2 className="text-lg font-bold text-slate-800">Past Mix Orders</h2>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by customer name…"
          value={pastSearch}
          onChange={(e) => {
            setPastSearch(e.target.value);
            setSelectedPastId(null);
          }}
          className="pl-9"
        />
      </div>

      {pastOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center text-slate-400 text-sm">
          {pastSearch.trim()
            ? "No mix orders found for that customer."
            : "No past mix orders recorded yet."}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                    Order ID
                  </TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                    Customer
                  </TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                    Date
                  </TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                    Location
                  </TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                    Items
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className={cn(
                      "cursor-pointer",
                      selectedPastId === order.id && "bg-slate-50"
                    )}
                    onClick={() =>
                      setSelectedPastId(
                        selectedPastId === order.id ? null : order.id
                      )
                    }
                  >
                    <TableCell className="font-mono text-xs text-slate-600">
                      {order.id}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800 text-sm">
                      {order.customer}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {order.date}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {order.location}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-600">
                      {order.sales.length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Selected Order Detail */}
          {selectedPast && (
            <div className="border-t border-slate-200/60 bg-slate-50/50 p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-sm font-bold text-slate-700">
                  📋 {selectedPast.id} — {selectedPast.customer}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-300 hover:bg-slate-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.info("Bill download is a demo feature");
                  }}
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Download Bill
                </Button>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                        #
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                        Product
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                        Weight (kg)
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                        Rate/kg
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPast.sales.map((s, idx) => {
                      const amt = s.quantity * s.rate_per_bag;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-slate-500 text-xs">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-medium text-slate-800 text-sm">
                            {s.products?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {fmtRs(s.quantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {fmtRs(s.rate_per_bag)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold text-slate-800">
                            Rs. {fmtRs(amt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-slate-100/60 font-semibold">
                      <TableCell
                        colSpan={2}
                        className="text-slate-600 text-sm"
                      >
                        Total
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-slate-800">
                        {fmtRs(
                          selectedPast.sales.reduce(
                            (s, r) => s + r.quantity,
                            0
                          )
                        )}{" "}
                        kg
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums text-sm text-slate-800">
                        Rs.{" "}
                        {fmtRs(
                          selectedPast.sales.reduce(
                            (s, r) => s + r.quantity * r.rate_per_bag,
                            0
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}