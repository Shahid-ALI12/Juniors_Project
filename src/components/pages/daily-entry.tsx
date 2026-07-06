"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCartStore, fetchCached, invalidateCache, apiError } from "@/store";
import { PageHeader } from "@/components/shared/page-header";
import type { CartItem, Sale, Expense, Product, Location, Customer, ProductStock } from "@/types";

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
  ChevronDown,
  Receipt,
  TrendingDown,
  Loader2,
  Beaker,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmAction from "@/components/shared/confirm-action";

const fmt = (n: number) => n.toLocaleString("en-PK");

export default function DailyEntryPage() {
  const today = new Date().toISOString().split("T")[0];

  const { items: cartItems, addItem, removeItem, clearCart, getTotal: getCartTotal } = useCartStore();

  const [date, setDate] = useState(today);
  const [locationChoice, setLocationChoice] = useState("");
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

  // Data from API
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSale, setSavingSale] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDesc, setConfirmDesc] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const askConfirm = (t: string, d: string, a: () => void) => { setConfirmTitle(t); setConfirmDesc(d); setConfirmAction(() => a); setConfirmOpen(true); };

  const loadMasterData = useCallback(async () => {
    try {
      const [pList, lList, cList, sList] = await Promise.all([
        fetchCached<Product>("products", "/api/products", "products"),
        fetchCached<Location>("locations", "/api/locations", "locations"),
        fetchCached<Customer>("customers", "/api/customers?active=true", "customers"),
        fetchCached<ProductStock>("stock", "/api/stock", "stock"),
      ]);
      setProducts(pList);
      setLocations(lList);
      setCustomers(cList);
      setStockData(sList);
    } catch {
      toast.error("Failed to load master data");
    }
  }, []);

  const loadDayData = useCallback(async (d: string) => {
    try {
      const bust = `_t=${Date.now()}`; // prevent browser GET cache after mutations
      const [sRes, eRes] = await Promise.all([
        fetch(`/api/sales?sale_date=${d}&${bust}`).then(r => r.json()),
        fetch(`/api/expenses?expense_date=${d}&${bust}`).then(r => r.json()),
      ]);
      setSales(sRes.sales ?? []);
      setExpenses(eRes.expenses ?? []);
    } catch {
      toast.error("Failed to load day data");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMasterData(), loadDayData(date)]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    loadDayData(date);
  }, [date, loadDayData]);

  // Set default location
  useEffect(() => {
    if (!locationChoice && locations.length > 0) {
      setLocationChoice(locations[0].name);
    }
  }, [locations, locationChoice]);

  const selectedLocation = locations.find((l) => l.name === locationChoice);
  const selectedProduct = products.find((p) => String(p.id) === productId);

  const stockEntry = stockData.find(
    (s) => s.product_id === Number(productId) && s.location_id === selectedLocation?.id
  );
  const stockBags = stockEntry?.stock_quantity ?? 0;

  const defaultRate = selectedProduct?.default_rate ?? 0;
  const quantityNum = parseFloat(quantity) || 0;
  const bagWeightNum = parseFloat(bagWeight) || 50;
  const rateNum = parseFloat(rate) || 0;
  const lineAmount = quantityNum * rateNum;

  const cartTotal = getCartTotal();
  const rickshawNum = parseFloat(rickshawFare) || 0;
  const grandTotal = cartTotal + rickshawNum;

  const unitType = unitChoice;

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.filter((c) => c.is_active);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.is_active && c.name.toLowerCase().includes(q));
  }, [customerSearch, customers]);

  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const c = customers.find((x) => String(x.id) === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerType(c.type as "credit" | "cash");
    }
  };

  const handleProductChange = (id: string) => {
    setProductId(id);
    const p = products.find((x) => String(x.id) === id);
    if (p) setRate(String(p.default_rate));
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    if (quantityNum <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }
    if (unitChoice === "bags" && bagWeightNum <= 0) {
      toast.error("Please enter a valid bag weight.");
      return;
    }
    const item: CartItem = {
      product: selectedProduct.name,
      product_id: selectedProduct.id,
      location: selectedLocation?.name ?? "",
      location_id: selectedLocation?.id ?? 0,
      quantity: quantityNum,
      unit_type: unitChoice,
      bag_weight_kg: unitChoice === "bags" ? bagWeightNum : null,
      rate: rateNum,
      amount: lineAmount,
    };
    addItem(item);
    setQuantity("");
    setRate(String(selectedProduct.default_rate));
    toast.success(`Added ${fmt(quantityNum)} ${unitChoice === "bags" ? "bag(s)" : "kg"} of ${selectedProduct.name}`);
  };

  const handleCompleteSale = async () => {
    if (!customerName.trim()) {
      toast.error("Please enter a customer name.");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Cart is empty — add at least one product first.");
      return;
    }
    if (!selectedLocation) {
      toast.error("Please select a location.");
      return;
    }

    setSavingSale(true);
    try {
      // Find or create customer
      let customerId: number;
      const existing = customers.find(
        (c) => c.name.toLowerCase() === customerName.trim().toLowerCase()
      );
      if (existing) {
        customerId = existing.id;
      } else {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: customerName.trim(), type: customerType }),
        });
        if (!res.ok) throw new Error(await apiError(res, "Failed to create customer"));
        const data = await res.json();
        customerId = data.customer?.id;
        if (data.customer) setCustomers((prev) => [...prev, data.customer]);
      }

      const items = cartItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        rate_per_bag: item.rate,
        unit_type: item.unit_type,
        bag_weight_kg: item.bag_weight_kg,
      }));

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customer_id: customerId,
          location_id: selectedLocation.id,
          sale_date: date,
          cash_received: Number(cashReceived) || 0,
          rickshaw_fare: rickshawNum,
          rickshaw_driver: rickshawDriver || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to complete sale");
      }

      clearCart();
      setRickshawFare("0");
      setRickshawDriver("");
      setCashReceived("0");
      setCustomerName("");
      setSelectedCustomerId("");
      toast.success(`Sale completed for ${customerName} — Rs. ${fmt(grandTotal)} total bill.`);
      invalidateCache("stock");
      invalidateCache("customers");
      await Promise.all([loadDayData(date), loadMasterData()]);
    } catch (e: any) {
      toast.error(e.message || "Failed to complete sale");
    } finally {
      setSavingSale(false);
    }
  };

  const handleDeleteSale = (saleId: number) => {
    askConfirm("Delete Sale", `Sale #${saleId} ko database se permanently delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        const res = await fetch(`/api/sales?id=${saleId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        setSales((prev) => prev.filter((s) => s.id !== saleId));
        toast.success("Sale #" + saleId + " delete ho gaya");
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const handleDeleteMixOrder = (mixOrderId: string) => {
    // mixOrderId is now String(mix_order_id) from the group key
    const dbMixOrderId = Number(mixOrderId);

    askConfirm("Delete Mix Order", `Mix Order #${mixOrderId} ko database se delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        // Use /api/mix-orders DELETE — cleans BOTH sales + mix_orders tables
        const res = await fetch(`/api/mix-orders?id=${dbMixOrderId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        // Remove only this mix order's sales from local state
        setSales((prev) => prev.filter((s) => String(s.mix_order_id) !== mixOrderId));
        toast.success("Mix Order #" + mixOrderId + " delete ho gaya");
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const handleAddExpense = async () => {
    if (!expenseDesc.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    const amt = parseFloat(expenseAmount) || 0;
    if (amt <= 0) {
      toast.error("Amount must be greater than 0.");
      return;
    }
    setSavingExpense(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: expenseDesc.trim(),
          amount: amt,
          expense_date: date,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to add expense");
      }
      setExpenseDesc("");
      setExpenseAmount("");
      toast.success(`Added expense: ${expenseDesc} — Rs. ${fmt(amt)}`);
      await loadDayData(date);
    } catch (e: any) {
      toast.error(e.message || "Failed to add expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (expId: number) => {
    askConfirm("Delete Expense", `Expense #${expId} ko database se permanently delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        const res = await fetch(`/api/expenses?id=${expId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        setExpenses((prev) => prev.filter((e) => e.id !== expId));
        toast.success("Expense #" + expId + " delete ho gaya");
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const regularSales = sales.filter((s) => !s.mix_order_id);
  const mixSales = sales.filter((s) => !!s.mix_order_id);

  const mixGroups = useMemo(() => {
    // Group by mix_order_id (DB foreign key — unique per mix order)
    // NOT by transaction_group_id which can be shared across different orders
    const map = new Map<string, Sale[]>();
    for (const s of mixSales) {
      const key = s.mix_order_id != null ? String(s.mix_order_id) : `mix-${s.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [mixSales]);

  const totalCashIn = sales.reduce((sum, s) => sum + s.cash_received, 0);
  const totalExpensesAmt = expenses.reduce((sum, e) => sum + e.amount, 0);

  const [expandedMix, setExpandedMix] = useState<Set<string>>(new Set());
  const toggleMix = (id: string) => {
    setExpandedMix((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ConfirmAction open={confirmOpen} onOpenChange={setConfirmOpen} title={confirmTitle} description={confirmDesc} confirmLabel="Haan, Delete Karo" variant="danger" onConfirm={confirmAction ?? (() => {})} loading={confirmLoading} />
        <PageHeader title="Daily Entry" subtitle="Add today's sales and expenses, and see the live cash summary." />

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardContent className="p-4">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 max-w-[200px]" />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="size-5 text-slate-600" />
              Add a Sale
            </CardTitle>
            <CardDescription>
              Add every product the customer is buying into the cart below, then
              click <strong>Complete Sale</strong> once — this saves it all as one bill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Location</Label>
                <RadioGroup value={locationChoice} onValueChange={setLocationChoice} className="flex gap-4">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center gap-2">
                      <RadioGroupItem value={loc.name} id={`loc-${loc.id}`} />
                      <Label htmlFor={`loc-${loc.id}`} className="font-normal cursor-pointer">{loc.name}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Selling in</Label>
                <RadioGroup value={unitChoice} onValueChange={(v) => setUnitChoice(v as "bags" | "kg")} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="bags" id="unit-bags" />
                    <Label htmlFor="unit-bags" className="font-normal cursor-pointer">Bags</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="kg" id="unit-kg" />
                    <Label htmlFor="unit-kg" className="font-normal cursor-pointer">KG (loose)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Product</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProduct && selectedLocation && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="size-3" />
                    Stock at {locationChoice}: <span className="font-semibold text-slate-700">{fmt(stockBags)} bags</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitChoice === "bags" ? "Quantity (bags)" : "Quantity (kg)"}
                </Label>
                <Input type="number" min="0" step={unitChoice === "bags" ? "1" : "5"} placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {unitChoice === "bags" && (
                  <div className="mt-2">
                    <Label className="text-xs text-slate-400 mb-1 block">Bag Weight (kg)</Label>
                    <Input type="number" min="0" step="5" value={bagWeight} onChange={(e) => setBagWeight(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitChoice === "bags" ? "Rate per Bag (Rs.)" : "Rate per KG (Rs.)"}
                </Label>
                <Input type="number" min="0" step="10" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <span className="text-sm text-amber-800">This line: {fmt(quantityNum)} x Rs. {fmt(rateNum)}</span>
              <span className="text-sm font-bold text-amber-900">Rs. {fmt(lineAmount)}</span>
            </div>

            <Button onClick={handleAddToCart} className="w-full" size="lg" disabled={!selectedProduct}>
              <Plus className="size-4" /> Add to Cart
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="size-5 text-slate-600" />
              Current Cart
              {cartItems.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold size-5">{cartItems.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cartItems.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Cart is empty — add products above.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Location</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium text-sm">{item.product}</TableCell>
                          <TableCell className="text-sm text-slate-600">{item.location}</TableCell>
                          <TableCell className="text-sm text-right">{fmt(item.quantity)}{item.unit_type === "kg" ? " kg" : ""}</TableCell>
                          <TableCell className="text-sm text-right">{fmt(item.rate)}</TableCell>
                          <TableCell className="text-sm text-right font-semibold">Rs. {fmt(item.amount)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => removeItem(idx)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 px-2">
                  <span className="text-xs uppercase text-slate-500 font-semibold">Cart Subtotal</span>
                  <span className="text-lg font-extrabold text-slate-900">Rs. {fmt(cartTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="size-5 text-slate-600" /> Search Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Type to search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input placeholder="Start typing a customer name..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Select customer</Label>
                <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Click to fill name" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCustomers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" /> Complete Sale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Customer Type</Label>
              <RadioGroup value={customerType} onValueChange={(v) => setCustomerType(v as "credit" | "cash")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="credit" id="ctype-credit" />
                  <Label htmlFor="ctype-credit" className="font-normal cursor-pointer">Credit (ادھار کھاتہ)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="ctype-cash" />
                  <Label htmlFor="ctype-cash" className="font-normal cursor-pointer">Cash (نقد)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Customer Name</Label>
                <Input placeholder="Type name — existing customer is matched automatically" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Rickshaw Freight (Rs.)</Label>
                <Input type="number" min="0" step="50" value={rickshawFare} onChange={(e) => setRickshawFare(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Rickshaw Driver Name</Label>
                <Input placeholder="Leave blank if not applicable" value={rickshawDriver} onChange={(e) => setRickshawDriver(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Cash Received Now (Rs.)</Label>
                <Input type="number" min="0" step="100" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-3">
              <span className="text-sm font-medium">Grand Total (incl. freight)</span>
              <span className="text-xl font-extrabold">Rs. {fmt(grandTotal)}</span>
            </div>

            <Button onClick={handleCompleteSale} className="w-full" size="lg" disabled={cartItems.length === 0 || savingSale}>
              {savingSale ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
              {savingSale ? "Saving..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="size-5 text-slate-600" /> Today&apos;s Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No sales entered yet for this date.</p>
            ) : (
              <div className="space-y-6">
                {regularSales.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">Regular Sales</h3>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Type</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden lg:table-cell">Product</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden md:table-cell">Location</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Rate</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">Rickshaw</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Bill</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Cash</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">Remaining</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {regularSales.map((s) => {
                            const bill = s.quantity * s.rate_per_bag + s.rickshaw_fare;
                            const remaining = bill - s.cash_received;
                            const unitSuffix = s.unit_type === "kg" ? " kg" : "";
                            return (
                              <TableRow key={s.id}>
                                <TableCell className="text-sm font-medium">{s.customers?.name ?? "—"}</TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", s.customers?.type === "credit" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{s.customers?.type ?? "—"}</span>
                                </TableCell>
                                <TableCell className="text-sm hidden lg:table-cell">{s.products?.name ?? "—"}</TableCell>
                                <TableCell className="text-sm text-slate-600 hidden md:table-cell">{s.locations?.name ?? "—"}</TableCell>
                                <TableCell className="text-sm text-right">{fmt(s.quantity)}{unitSuffix}</TableCell>
                                <TableCell className="text-sm text-right hidden sm:table-cell">{fmt(s.rate_per_bag)}</TableCell>
                                <TableCell className="text-sm text-right hidden md:table-cell">{s.rickshaw_fare > 0 ? fmt(s.rickshaw_fare) : "—"}{s.rickshaw_driver_name && <span className="block text-xs text-slate-400"><Truck className="inline size-3" /> {s.rickshaw_driver_name}</span>}</TableCell>
                                <TableCell className="text-sm text-right font-semibold">{fmt(bill)}</TableCell>
                                <TableCell className="text-sm text-right hidden sm:table-cell">{s.cash_received > 0 ? fmt(s.cash_received) : "—"}</TableCell>
                                <TableCell className={cn("text-sm text-right font-semibold hidden lg:table-cell", remaining > 0 ? "text-red-600" : "text-green-600")}>{fmt(remaining)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteSale(s.id)}>
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

                {mixGroups.size > 0 && (
                  <div>
                    <Separator className="my-2" />
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Beaker className="size-4 text-purple-500" /> Mix Orders
                    </h3>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold">Order</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden sm:table-cell">Location</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Total Qty</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">Total Bill</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden md:table-cell">Cash</TableHead>
                            <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Remaining</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(mixGroups.entries()).map(([mixOrderId, lines]) => {
                            const custName = lines[0].customers?.name ?? "—";
                            const locName = lines[0].locations?.name ?? "—";
                            const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
                            const totalMixBill = lines.reduce((sum, l) => sum + l.quantity * l.rate_per_bag, 0);
                            const totalMixCash = lines.reduce((sum, l) => sum + l.cash_received, 0);
                            const mixRemaining = totalMixBill - totalMixCash;
                            const isExpanded = expandedMix.has(mixOrderId);
                            const groupId = mixOrderId;

                            return (
                              <TableRow key={mixOrderId}>
                                <TableCell className="font-medium text-sm">
                                  <Collapsible open={isExpanded} onOpenChange={() => toggleMix(mixOrderId)}>
                                    <CollapsibleTrigger className="flex items-center gap-1 text-left hover:underline">
                                      {custName}
                                      <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="mt-2 ml-2 rounded-lg border border-purple-100 bg-purple-50/50 p-2">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="bg-transparent hover:bg-transparent border-0">
                                              <TableHead className="text-xs text-slate-500 py-1">Ingredient</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Qty (kg)</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Rate/kg</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Amount</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {lines.map((l) => (
                                              <TableRow key={l.id} className="bg-transparent hover:bg-purple-100/50 border-0">
                                                <TableCell className="py-1 text-sm">{l.products?.name}</TableCell>
                                                <TableCell className="py-1 text-sm text-right">{fmt(l.quantity)}</TableCell>
                                                <TableCell className="py-1 text-sm text-right">{fmt(l.rate_per_bag)}</TableCell>
                                                <TableCell className="py-1 text-sm text-right font-medium">{fmt(l.quantity * l.rate_per_bag)}</TableCell>
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
                                    <Beaker className="size-3" /> Mix Order
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-slate-600 hidden sm:table-cell">{locName}</TableCell>
                                <TableCell className="text-sm text-right">{fmt(totalQty)} kg</TableCell>
                                <TableCell className="text-sm text-right font-semibold hidden md:table-cell">{fmt(totalMixBill)}</TableCell>
                                <TableCell className="text-sm text-right hidden md:table-cell">{totalMixCash > 0 ? fmt(totalMixCash) : "—"}</TableCell>
                                <TableCell className={cn("text-sm text-right font-semibold", mixRemaining > 0 ? "text-red-600" : "text-green-600")}>{fmt(mixRemaining)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteMixOrder(groupId)}>
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

                {sales.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Total Items Sold</div>
                      <div className="text-lg font-extrabold text-slate-900">{fmt(sales.length)}</div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Total Billed</div>
                      <div className="text-lg font-extrabold text-slate-900">Rs. {fmt(sales.reduce((sum, s) => sum + s.quantity * s.rate_per_bag + s.rickshaw_fare, 0))}</div>
                    </div>
                    <div className="flex-1 min-w-[140px] rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="text-xs text-slate-500 font-semibold uppercase">Cash Collected</div>
                      <div className="text-lg font-extrabold text-green-600">Rs. {fmt(totalCashIn)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="size-5 text-red-500" /> Add an Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-[3fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Description</Label>
                <Input placeholder="e.g. Rickshaw, Tea, Labour" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Amount (Rs.)</Label>
                <Input type="number" min="0" step="50" placeholder="0" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAddExpense} className="w-full mt-3" variant="outline" disabled={savingExpense}>
              {savingExpense ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
              {savingExpense ? "Adding..." : "Add Expense"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="size-5 text-slate-600" /> Today&apos;s Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No expenses recorded for this date.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Description</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount (Rs.)</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-sm text-right font-semibold">Rs. {fmt(e.amount)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteExpense(e.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
                  <span className="text-sm font-semibold text-red-700">Total Expenses Today</span>
                  <span className="text-lg font-extrabold text-red-700">Rs. {fmt(totalExpensesAmt)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Cash Summary</div>
                <div className="text-sm text-slate-600 mt-1">
                  Cash In: Rs. {fmt(totalCashIn)} | Expenses: Rs. {fmt(totalExpensesAmt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Expected Cash</div>
                <div className={cn("text-2xl font-extrabold", (totalCashIn - totalExpensesAmt) >= 0 ? "text-green-600" : "text-red-600")}>
                  Rs. {fmt(totalCashIn - totalExpensesAmt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
