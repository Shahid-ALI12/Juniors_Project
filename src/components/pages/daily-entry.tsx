"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCartStore, useAppStore } from "@/store";
import {
  mockSales,
  mockExpenses,
  mockProducts,
  mockLocations,
  mockCustomers,
  mockStock,
} from "@/lib/mock-data";
import { PageHeader, MetricCard } from "@/components/shared/page-header";
import type { CartItem, Sale, Expense } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Package,
  MapPin,
  ChevronsUpDown,
  ChevronDown,
  Receipt,
  TrendingDown,
  Wallet,
  Beaker,
  Truck,
} from "lucide-react";

// ─── Helper ───────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en-PK");

export default function DailyEntryPage() {
  const today = new Date().toISOString().split("T")[0];

  // ── Zustand ──────────────────────────────────────────────────────────────
  const { items: cartItems, addItem, removeItem, clearCart, getTotal: getCartTotal } = useCartStore();

  // ── Local state ──────────────────────────────────────────────────────────
  const [date, setDate] = useState(today);
  const [locationChoice, setLocationChoice] = useState("Farm");
  const [unitChoice, setUnitChoice] = useState<"bags" | "kg">("bags");
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [bagWeight, setBagWeight] = useState<string>("50");
  const [rate, setRate] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerType, setCustomerType] = useState<"credit" | "cash">("credit");
  const [rickshawFare, setRickshawFare] = useState<string>("0");
  const [rickshawDriver, setRickshawDriver] = useState("");
  const [cashReceived, setCashReceived] = useState<string>("0");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<string>("");

  // Demo local state for today's sales & expenses (mutable copy)
  const [localSales, setLocalSales] = useState<Sale[]>(() =>
    mockSales.filter((s) => s.sale_date === today)
  );
  const [localExpenses, setLocalExpenses] = useState<Expense[]>(() =>
    mockExpenses.filter((e) => e.expense_date === today)
  );

  // Feedback messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedLocation = mockLocations.find((l) => l.name === locationChoice)!;
  const selectedProduct = mockProducts.find((p) => String(p.id) === productId);
  const unitType = unitChoice;

  const stockKey = `${selectedProduct?.id ?? 0}-${selectedLocation.id}`;
  const stockBags = mockStock[stockKey] ?? 0;

  const defaultRate = selectedProduct?.default_rate ?? 0;
  const quantityNum = parseFloat(quantity) || 0;
  const bagWeightNum = parseFloat(bagWeight) || 50;
  const rateNum = parseFloat(rate) || 0;
  const lineAmount = quantityNum * rateNum;

  const cartTotal = getCartTotal();
  const rickshawNum = parseFloat(rickshawFare) || 0;
  const grandTotal = cartTotal + rickshawNum;

  // Customer search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return mockCustomers.filter((c) => c.is_active);
    const q = customerSearch.toLowerCase();
    return mockCustomers.filter(
      (c) => c.is_active && c.name.toLowerCase().includes(q)
    );
  }, [customerSearch]);

  // When a customer is selected from dropdown, fill the name
  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const c = mockCustomers.find((x) => String(x.id) === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerType(c.type);
    }
  };

  // When product changes, prefill rate
  const handleProductChange = (id: string) => {
    setProductId(id);
    const p = mockProducts.find((x) => String(x.id) === id);
    if (p) setRate(String(p.default_rate));
  };

  // Add to cart
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    if (quantityNum <= 0) {
      setErrorMsg("Quantity must be greater than 0.");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    if (unitType === "bags" && bagWeightNum <= 0) {
      setErrorMsg("Please enter a valid bag weight.");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    const item: CartItem = {
      product: selectedProduct.name,
      product_id: selectedProduct.id,
      location: selectedLocation.name,
      location_id: selectedLocation.id,
      quantity: quantityNum,
      unit_type: unitType,
      bag_weight_kg: unitType === "bags" ? bagWeightNum : null,
      rate: rateNum,
      amount: lineAmount,
    };
    addItem(item);
    // Reset line inputs
    setQuantity("");
    setRate(String(selectedProduct.default_rate));
    setSuccessMsg(`Added ${fmt(quantityNum)} ${unitType === "bags" ? "bag(s)" : "kg"} of ${selectedProduct.name}`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Complete sale
  const handleCompleteSale = () => {
    if (!customerName.trim()) {
      setErrorMsg("Please enter a customer name.");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    if (cartItems.length === 0) {
      setErrorMsg("Cart is empty — add at least one product first.");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    clearCart();
    setRickshawFare("0");
    setRickshawDriver("");
    setCashReceived("0");
    setCustomerName("");
    setSelectedCustomerId("");
    setSuccessMsg(`Sale completed for ${customerName} — ${cartItems.length} item(s), Rs. ${fmt(grandTotal)} total bill.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Delete a sale row (demo)
  const handleDeleteSale = (saleId: number) => {
    setLocalSales((prev) => prev.filter((s) => s.id !== saleId));
    setSuccessMsg("Sale deleted (demo).");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  // Delete a mix order (demo)
  const handleDeleteMixOrder = (mixOrderId: string) => {
    setLocalSales((prev) => prev.filter((s) => s.mix_order_id !== mixOrderId));
    setSuccessMsg("Mix order deleted (demo).");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  // Add expense
  const handleAddExpense = () => {
    if (!expenseDesc.trim()) {
      setErrorMsg("Please enter a description.");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    const amt = parseFloat(expenseAmount) || 0;
    if (amt <= 0) {
      setErrorMsg("Amount must be greater than 0.");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    const newExpense: Expense = {
      id: Date.now(),
      description: expenseDesc,
      amount: amt,
      expense_date: date,
      entered_by: null,
      created_at: new Date().toISOString(),
    };
    setLocalExpenses((prev) => [...prev, newExpense]);
    setExpenseDesc("");
    setExpenseAmount("");
    setSuccessMsg(`Added expense: ${expenseDesc} — Rs. ${fmt(amt)}`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Delete expense (demo)
  const handleDeleteExpense = (expId: number) => {
    setLocalExpenses((prev) => prev.filter((e) => e.id !== expId));
    setSuccessMsg("Expense deleted (demo).");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  // ── Today's sales grouping ───────────────────────────────────────────────
  const regularSales = localSales.filter((s) => !s.mix_order_id);
  const mixSales = localSales.filter((s) => !!s.mix_order_id);

  // Group mix orders
  const mixGroups = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const s of mixSales) {
      const key = s.mix_order_id!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [mixSales]);

  // Group regular sales by transaction_group_id
  const seenGroupIds = new Set<string>();

  // Cash summary
  const totalCashIn = localSales.reduce((sum, s) => sum + s.cash_received, 0);
  const totalExpensesAmt = localExpenses.reduce((sum, e) => sum + e.amount, 0);
  const expectedCash = totalCashIn - totalExpensesAmt;

  // Expanded mix orders
  const [expandedMix, setExpandedMix] = useState<Set<string>>(new Set());
  const toggleMix = (id: string) => {
    setExpandedMix((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Feedback */}
        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-4 shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-4 shrink-0 text-red-500" />
            {errorMsg}
          </div>
        )}

        <PageHeader title="Daily Entry" subtitle="Add today's sales and expenses, and see the live cash summary." />

        {/* ─── Date ──────────────────────────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardContent className="p-4">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">
              Date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 max-w-[200px]"
            />
          </CardContent>
        </Card>

        {/* ─── 1. Add a Sale (Cart Style) ────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="size-5 text-slate-600" />
              Add a Sale
            </CardTitle>
            <CardDescription>
              Add every product the customer is buying into the cart below, then
              click <strong>Complete Sale</strong> once — this saves it all as one
              bill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Location + Unit radios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Location
                </Label>
                <RadioGroup
                  value={locationChoice}
                  onValueChange={setLocationChoice}
                  className="flex gap-4"
                >
                  {mockLocations.map((loc) => (
                    <div key={loc.id} className="flex items-center gap-2">
                      <RadioGroupItem value={loc.name} id={`loc-${loc.id}`} />
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
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Selling in
                </Label>
                <RadioGroup
                  value={unitChoice}
                  onValueChange={(v) => setUnitChoice(v as "bags" | "kg")}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="bags" id="unit-bags" />
                    <Label htmlFor="unit-bags" className="font-normal cursor-pointer">
                      Bags
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="kg" id="unit-kg" />
                    <Label htmlFor="unit-kg" className="font-normal cursor-pointer">
                      KG (loose)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* Product + Quantity + Rate row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Product */}
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Product
                </Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockProducts
                      .filter((p) => p.is_active)
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedProduct && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="size-3" />
                    Stock at {locationChoice}:{" "}
                    <span className="font-semibold text-slate-700">
                      {fmt(stockBags)} bags
                    </span>
                  </p>
                )}
              </div>

              {/* Quantity + Bag Weight */}
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitType === "bags" ? "Quantity (bags)" : "Quantity (kg)"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step={unitType === "bags" ? "1" : "5"}
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {unitType === "bags" && (
                  <div className="mt-2">
                    <Label className="text-xs text-slate-400 mb-1 block">
                      Bag Weight (kg)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="5"
                      value={bagWeight}
                      onChange={(e) => setBagWeight(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Rate */}
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitType === "bags" ? "Rate per Bag (Rs.)" : "Rate per KG (Rs.)"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
            </div>

            {/* Live line amount */}
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <span className="text-sm text-amber-800">
                This line: {fmt(quantityNum)} x Rs. {fmt(rateNum)}
              </span>
              <span className="text-sm font-bold text-amber-900">
                Rs. {fmt(lineAmount)}
              </span>
            </div>

            {/* Add to Cart */}
            <Button
              onClick={handleAddToCart}
              className="w-full"
              size="lg"
              disabled={!selectedProduct}
            >
              <Plus className="size-4" />
              Add to Cart
            </Button>
          </CardContent>
        </Card>

        {/* ─── 2. Current Cart Table ─────────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="size-5 text-slate-600" />
              Current Cart
              {cartItems.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold size-5">
                  {cartItems.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cartItems.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                Cart is empty — add products above.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                        Product
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                        Location
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                        Qty
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                        Rate
                      </TableHead>
                      <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                        Amount
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cartItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">
                          {item.product}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {item.location}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {fmt(item.quantity)}
                          {item.unit_type === "kg" ? " kg" : ""}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {fmt(item.rate)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-semibold">
                          Rs. {fmt(item.amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-slate-400 hover:text-red-600"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {cartItems.length > 0 && (
              <div className="mt-3 flex items-center justify-end gap-2 px-2">
                <span className="text-xs uppercase text-slate-500 font-semibold">
                  Cart Subtotal
                </span>
                <span className="text-lg font-extrabold text-slate-900">
                  Rs. {fmt(cartTotal)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── 3. Search Customer ────────────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="size-5 text-slate-600" />
              Search Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Type to search
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    placeholder="Start typing a customer name..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Select customer
                </Label>
                <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Click to fill name" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCustomers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} ({c.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── 4. Complete Sale Form ─────────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" />
              Complete Sale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer type radio */}
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">
                Customer Type
              </Label>
              <RadioGroup
                value={customerType}
                onValueChange={(v) => setCustomerType(v as "credit" | "cash")}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Customer Name
                </Label>
                <Input
                  placeholder="Type name — existing customer is matched automatically"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Rickshaw Freight (Rs.)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="50"
                  value={rickshawFare}
                  onChange={(e) => setRickshawFare(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Rickshaw Driver Name
                </Label>
                <Input
                  placeholder="Leave blank if not applicable"
                  value={rickshawDriver}
                  onChange={(e) => setRickshawDriver(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Cash Received Now (Rs.)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
              </div>
            </div>

            {/* Grand Total */}
            <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-3">
              <span className="text-sm font-medium">Grand Total (incl. freight)</span>
              <span className="text-xl font-extrabold">
                Rs. {fmt(grandTotal)}
              </span>
            </div>

            <Button
              onClick={handleCompleteSale}
              className="w-full"
              size="lg"
              disabled={cartItems.length === 0}
            >
              <CheckCircle2 className="size-4" />
              Complete Sale
            </Button>
          </CardContent>
        </Card>

        {/* ─── 5. Today's Sales List ─────────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="size-5 text-slate-600" />
              Today&apos;s Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            {localSales.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No sales entered yet for this date.
              </p>
            ) : (
              <div className="space-y-6">
                {/* Regular Sales */}
                {regularSales.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">
                      Regular Sales
                    </h3>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                              Customer
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                              Type
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden lg:table-cell">
                              Product
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden md:table-cell">
                              Location
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                              Qty
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">
                              Rate
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">
                              Rickshaw
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                              Bill
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">
                              Cash
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">
                              Remaining
                            </TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {regularSales.map((s) => {
                            const gid = s.transaction_group_id;
                            const shouldShowSep =
                              gid && !seenGroupIds.has(gid) && [...seenGroupIds].length > 0;
                            seenGroupIds.add(gid ?? "");

                            const bill = s.quantity * s.rate_per_bag + s.rickshaw_fare;
                            const remaining = bill - s.cash_received;
                            const unitSuffix = s.unit_type === "kg" ? " kg" : "";

                            return (
                              <TableRow key={s.id}>
                                {shouldShowSep && (
                                  <TableCell
                                    colSpan={11}
                                    className="p-0"
                                  >
                                    <Separator className="bg-slate-200" />
                                  </TableCell>
                                )}
                                <TableCell className="text-sm font-medium">
                                  {s.customers?.name ?? "—"}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                      s.customers?.type === "credit"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-green-100 text-green-800"
                                    )}
                                  >
                                    {s.customers?.type ?? "—"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm hidden lg:table-cell">
                                  {s.products?.name ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-slate-600 hidden md:table-cell">
                                  {s.locations?.name ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-right">
                                  {fmt(s.quantity)}
                                  {unitSuffix}
                                </TableCell>
                                <TableCell className="text-sm text-right hidden sm:table-cell">
                                  {fmt(s.rate_per_bag)}
                                </TableCell>
                                <TableCell className="text-sm text-right hidden md:table-cell">
                                  {s.rickshaw_fare > 0 ? fmt(s.rickshaw_fare) : "—"}
                                  {s.rickshaw_driver_name && (
                                    <span className="block text-xs text-slate-400">
                                      <Truck className="inline size-3" /> {s.rickshaw_driver_name}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-right font-semibold">
                                  {fmt(bill)}
                                </TableCell>
                                <TableCell className="text-sm text-right hidden sm:table-cell">
                                  {s.cash_received > 0 ? fmt(s.cash_received) : "—"}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-sm text-right font-semibold hidden lg:table-cell",
                                    remaining > 0 ? "text-red-600" : "text-green-600"
                                  )}
                                >
                                  {fmt(remaining)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-slate-400 hover:text-red-600"
                                    onClick={() => handleDeleteSale(s.id)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Mix Orders */}
                {mixGroups.size > 0 && (
                  <div>
                    <Separator className="my-2" />
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Beaker className="size-4 text-purple-500" />
                      Mix Orders
                    </h3>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                              Customer
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                              Order
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden sm:table-cell">
                              Location
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                              Total Qty
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">
                              Total Bill
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">
                              Cash
                            </TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                              Remaining
                            </TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(mixGroups.entries()).map(
                            ([mixOrderId, lines]) => {
                              const custName = lines[0].customers?.name ?? "—";
                              const locName = lines[0].locations?.name ?? "—";
                              const totalQty = lines.reduce(
                                (sum, l) => sum + l.quantity,
                                0
                              );
                              const totalMixBill = lines.reduce(
                                (sum, l) => sum + l.quantity * l.rate_per_bag,
                                0
                              );
                              const totalMixCash = lines.reduce(
                                (sum, l) => sum + l.cash_received,
                                0
                              );
                              const mixRemaining = totalMixBill - totalMixCash;
                              const isExpanded = expandedMix.has(mixOrderId);

                              return (
                                <TableRow key={mixOrderId}>
                                  <TableCell className="font-medium text-sm">
                                    <Collapsible
                                      open={isExpanded}
                                      onOpenChange={() => toggleMix(mixOrderId)}
                                    >
                                      <CollapsibleTrigger className="flex items-center gap-1 text-left hover:underline">
                                        {custName}
                                        <ChevronDown
                                          className={cn(
                                            "size-3.5 text-slate-400 transition-transform",
                                            isExpanded && "rotate-180"
                                          )}
                                        />
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="mt-2 ml-2 rounded-lg border border-purple-100 bg-purple-50/50 p-2">
                                          <Table>
                                            <TableHeader>
                                              <TableRow className="bg-transparent hover:bg-transparent border-0">
                                                <TableHead className="text-xs text-slate-500 py-1">
                                                  Ingredient
                                                </TableHead>
                                                <TableHead className="text-xs text-slate-500 py-1 text-right">
                                                  Qty (kg)
                                                </TableHead>
                                                <TableHead className="text-xs text-slate-500 py-1 text-right">
                                                  Rate/kg
                                                </TableHead>
                                                <TableHead className="text-xs text-slate-500 py-1 text-right">
                                                  Amount
                                                </TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {lines.map((l) => (
                                                <TableRow
                                                  key={l.id}
                                                  className="bg-transparent hover:bg-purple-100/50 border-0"
                                                >
                                                  <TableCell className="py-1 text-sm">
                                                    {l.products?.name}
                                                  </TableCell>
                                                  <TableCell className="py-1 text-sm text-right">
                                                    {fmt(l.quantity)}
                                                  </TableCell>
                                                  <TableCell className="py-1 text-sm text-right">
                                                    {fmt(l.rate_per_bag)}
                                                  </TableCell>
                                                  <TableCell className="py-1 text-sm text-right font-medium">
                                                    {fmt(l.quantity * l.rate_per_bag)}
                                                  </TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </TableCell>
                                  <TableCell>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-semibold">
                                      <Beaker className="size-3" />
                                      Mix Order
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-600 hidden sm:table-cell">
                                    {locName}
                                  </TableCell>
                                  <TableCell className="text-sm text-right">
                                    {fmt(totalQty)} kg
                                  </TableCell>
                                  <TableCell className="text-sm text-right font-semibold hidden md:table-cell">
                                    {fmt(totalMixBill)}
                                  </TableCell>
                                  <TableCell className="text-sm text-right hidden md:table-cell">
                                    {totalMixCash > 0 ? fmt(totalMixCash) : "—"}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "text-sm text-right font-semibold",
                                      mixRemaining > 0 ? "text-red-600" : "text-green-600"
                                    )}
                                  >
                                    {fmt(mixRemaining)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 text-slate-400 hover:text-red-600"
                                      onClick={() => handleDeleteMixOrder(mixOrderId)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            }
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Sales Summary */}
                {localSales.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">
                        Total Items Sold
                      </div>
                      <div className="text-lg font-extrabold text-slate-900">
                        {fmt(localSales.length)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">
                        Total Billed
                      </div>
                      <div className="text-lg font-extrabold text-slate-900">
                        Rs.{" "}
                        {fmt(
                          localSales.reduce(
                            (sum, s) => sum + s.quantity * s.rate_per_bag + s.rickshaw_fare,
                            0
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">
                        Cash Collected
                      </div>
                      <div className="text-lg font-extrabold text-green-600">
                        Rs. {fmt(totalCashIn)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── 6. Add an Expense ─────────────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="size-5 text-red-500" />
              Add an Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-[3fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Description
                </Label>
                <Input
                  placeholder="e.g. Rickshaw, Tea, Labour"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Amount (Rs.)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="50"
                  placeholder="0"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleAddExpense}
              className="w-full mt-3"
              variant="outline"
            >
              <Plus className="size-4" />
              Add Expense
            </Button>
          </CardContent>
        </Card>

        {/* ─── 7. Today's Expenses List ──────────────────────────────────── */}
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="size-5 text-slate-600" />
              Today&apos;s Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {localExpenses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No expenses entered yet for this date.
              </p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">
                          Description
                        </TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">
                          Amount
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {localExpenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-red-600">
                            Rs. {fmt(e.amount)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-400 hover:text-red-600"
                              onClick={() => handleDeleteExpense(e.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 px-2">
                  <span className="text-xs uppercase text-slate-500 font-semibold">
                    Total Expenses Today
                  </span>
                  <span className="text-lg font-extrabold text-red-600">
                    Rs. {fmt(totalExpensesAmt)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ─── 8. Live Cash Summary ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-8">
          <MetricCard
            label="Cash Received Today"
            value={`Rs. ${fmt(totalCashIn)}`}
            color="green"
            prefix=""
          />
          <MetricCard
            label="Expenses Today"
            value={`Rs. ${fmt(totalExpensesAmt)}`}
            color="orange"
            prefix=""
          />
          <MetricCard
            label="Expected Cash in Hand"
            value={`Rs. ${fmt(expectedCash)}`}
            color="blue"
            prefix=""
          />
        </div>
      </div>
    </div>
  );
}