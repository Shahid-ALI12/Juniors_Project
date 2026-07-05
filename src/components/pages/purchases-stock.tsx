"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import type { Product, Location, Customer, Purchase, Supplier, ProductStock } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Package,
  ShoppingBag,
  Trash2,
  Save,
  AlertTriangle,
  UserCheck,
  Truck,
  Warehouse,
  Store,
  Scale,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_BAG_WEIGHT = 50;

function fmt(n: number) {
  return n.toLocaleString("en-PK");
}

function stockKey(productId: number, locationId: number) {
  return `${productId}-${locationId}`;
}

interface StockRow {
  productId: number;
  productName: string;
  bagWeight: number;
  bags: number;
  totalKg: number;
}

export default function PurchasesStockPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Master data
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  // Section 1: Stock state
  const [farmStock, setFarmStock] = useState<StockRow[]>([]);
  const [shopStock, setShopStock] = useState<StockRow[]>([]);
  const [savedLocations, setSavedLocations] = useState<Set<string>>(new Set());

  // Section 2: Purchase form state
  const [purchaseType, setPurchaseType] = useState<"supplier" | "settlement">("supplier");
  const [purchaseLocation, setPurchaseLocation] = useState<string>("1");
  const [purchaseUnit, setPurchaseUnit] = useState<"bags" | "kg">("bags");
  const [supplierName, setSupplierName] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState("");
  const [bagWeight, setBagWeight] = useState("50");
  const [rate, setRate] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [notes, setNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const buildStockRows = useCallback((locationId: number): StockRow[] => {
    return products.map((p) => {
      const entry = stockData.find((s) => s.product_id === p.id && s.location_id === locationId);
      const bags = entry?.stock_quantity ?? 0;
      const bw = entry?.last_bag_weight_kg ?? DEFAULT_BAG_WEIGHT;
      return {
        productId: p.id,
        productName: p.name,
        bagWeight: Number(bw),
        bags: Number(bags),
        totalKg: Number(bags) * Number(bw),
      };
    });
  }, [products, stockData]);

  const loadAllData = useCallback(async () => {
    try {
      const [pRes, lRes, cRes, sRes, stRes, puRes] = await Promise.all([
        fetch("/api/products").then(r => r.json()),
        fetch("/api/locations").then(r => r.json()),
        fetch("/api/customers?active=true").then(r => r.json()),
        fetch("/api/suppliers").then(r => r.json()),
        fetch("/api/stock").then(r => r.json()),
        fetch(`/api/purchases?purchase_date_gte=${today}&purchase_date_lte=${today}`).then(r => r.json()),
      ]);
      setProducts(pRes.products ?? []);
      setLocations(lRes.locations ?? []);
      setCustomers(cRes.customers ?? []);
      setSuppliers(sRes.suppliers ?? []);
      setStockData(stRes.stock ?? []);
      setPurchases(puRes.purchases ?? []);
    } catch {
      toast.error("Failed to load data");
    }
  }, [today]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAllData();
      setLoading(false);
    })();
  }, [loadAllData]);

  useEffect(() => {
    if (products.length > 0 && stockData.length > 0) {
      setFarmStock(buildStockRows(1));
      setShopStock(buildStockRows(2));
    }
  }, [products, stockData, buildStockRows]);

  const goodsValue = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    return qty * r;
  }, [quantity, rate]);

  const settlementValue = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    return qty * r;
  }, [quantity, rate]);

  const totalCashPaid = useMemo(
    () => purchases.reduce((sum, p) => sum + p.cash_paid, 0),
    [purchases]
  );

  const creditCustomers = useMemo(
    () => customers.filter((c) => c.type === "credit" && c.is_active),
    [customers]
  );

  const selectedProductRate = useMemo(() => {
    const p = products.find((pr) => pr.id === Number(selectedProduct));
    return p?.default_rate ?? 0;
  }, [selectedProduct, products]);

  const updateBags = useCallback(
    (locationId: number, productId: number, newBags: number, bw: number) => {
      const setter = locationId === 1 ? setFarmStock : setShopStock;
      setter((prev) =>
        prev.map((row) =>
          row.productId === productId
            ? { ...row, bags: newBags, totalKg: newBags * bw }
            : row
        )
      );
    },
    []
  );

  const updateTotalKg = useCallback(
    (locationId: number, productId: number, newTotalKg: number, bw: number) => {
      const setter = locationId === 1 ? setFarmStock : setShopStock;
      setter((prev) =>
        prev.map((row) =>
          row.productId === productId
            ? { ...row, totalKg: newTotalKg, bags: bw > 0 ? Math.round((newTotalKg / bw) * 100) / 100 : 0 }
            : row
        )
      );
    },
    []
  );

  const updateBagWeight = useCallback(
    (locationId: number, productId: number, newBw: number, currentBags: number) => {
      const setter = locationId === 1 ? setFarmStock : setShopStock;
      setter((prev) =>
        prev.map((row) =>
          row.productId === productId
            ? { ...row, bagWeight: newBw, totalKg: currentBags * newBw }
            : row
        )
      );
    },
    []
  );

  const handleSaveStock = async (locationId: number, locationName: string) => {
    const stock = locationId === 1 ? farmStock : shopStock;
    setSavedLocations((prev) => new Set(prev).add(locationName));
    try {
      for (const row of stock) {
        await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: row.productId,
            location_id: locationId,
            stock_quantity: row.totalKg > 0 ? Math.round(row.bags * 100) / 100 : 0,
            last_bag_weight_kg: row.bagWeight,
          }),
        });
      }
      await loadAllData();
      toast.success(`${locationName} stock saved successfully!`);
    } catch {
      toast.error(`Failed to save ${locationName} stock`);
    }
    setSavedLocations((prev) => {
      const next = new Set(prev);
      next.delete(locationName);
      return next;
    });
  };

  const resetForm = () => {
    setSupplierName("");
    setSelectedSupplier("");
    setSelectedProduct("");
    setSelectedCustomer("");
    setQuantity("");
    setBagWeight("50");
    setRate("");
    setCashPaid("");
    setNotes("");
  };

  const handleAddSupplierPurchase = async () => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    const cp = parseFloat(cashPaid) || 0;
    const bw = parseFloat(bagWeight) || 0;
    const product = products.find((p) => p.id === Number(selectedProduct));
    const location = locations.find((l) => l.id === Number(purchaseLocation));

    if (!product || !location) {
      toast.error("Please select a product and location");
      return;
    }
    if (qty <= 0 || r <= 0) {
      toast.error("Quantity and rate must be greater than 0");
      return;
    }

    // Create supplier if new name entered
    let supplierId = selectedSupplier ? Number(selectedSupplier) : null;
    if (!supplierId && supplierName.trim()) {
      try {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: supplierName.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create supplier");
        }
        const data = await res.json();
        supplierId = data.supplier?.id;
        if (data.supplier) setSuppliers((prev) => [...prev, data.supplier]);
      } catch {
        toast.error("Failed to create supplier");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_date: today,
          product_id: product.id,
          quantity: qty,
          rate_per_bag: r,
          supplier_id: supplierId,
          settled_by_customer_id: null,
          cash_paid: cp,
          location_id: location.id,
          notes: notes?.trim() || null,
          unit_type: purchaseUnit,
          bag_weight_kg: purchaseUnit === "bags" ? bw : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to record purchase");
      }
      resetForm();
      toast.success("Purchase recorded successfully!");
      await loadAllData();
    } catch (e: any) {
      toast.error(e.message || "Failed to record purchase");
    } finally {
      setSaving(false);
    }
  };

  const handleRecordSettlement = async () => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    const bw = parseFloat(bagWeight) || 0;
    const product = products.find((p) => p.id === Number(selectedProduct));
    const customer = customers.find((c) => c.id === Number(selectedCustomer));
    const location = locations.find((l) => l.id === Number(purchaseLocation));

    if (!product || !customer || !location) {
      toast.error("Please select customer, product, and location");
      return;
    }
    if (qty <= 0 || r <= 0) {
      toast.error("Quantity and rate must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_date: today,
          product_id: product.id,
          quantity: qty,
          rate_per_bag: r,
          supplier_id: null,
          settled_by_customer_id: customer.id,
          cash_paid: 0,
          location_id: location.id,
          notes: notes?.trim() || null,
          unit_type: purchaseUnit,
          bag_weight_kg: purchaseUnit === "bags" ? bw : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to record settlement");
      }
      resetForm();
      toast.success("Settlement recorded successfully!");
      await loadAllData();
    } catch (e: any) {
      toast.error(e.message || "Failed to record settlement");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePurchase = async (id: number) => {
    try {
      const res = await fetch(`/api/purchases?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete purchase");
      setPurchases((prev) => prev.filter((p) => p.id !== id));
      toast.success("Purchase deleted.");
    } catch {
      toast.error("Failed to delete purchase");
    }
  };

  const getPurchaseValue = (p: Purchase) => p.quantity * p.rate_per_bag;

  const getQuantityLabel = (p: Purchase) => {
    if (p.unit_type === "bags") {
      return `${p.quantity} bag${p.quantity !== 1 ? "s" : ""}`;
    }
    return `${p.quantity} kg`;
  };

  const renderStockTable = (
    locationId: number,
    locationName: string,
    stock: StockRow[],
    setStock: React.Dispatch<React.SetStateAction<StockRow[]>>
  ) => {
    const hasNegative = stock.some((row) => row.totalKg < 0);
    const isSaved = savedLocations.has(locationName);

    return (
      <div className="space-y-4">
        {hasNegative && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-800">
            <AlertTriangle className="size-4 text-amber-600" />
            <AlertDescription>
              Some products show negative stock for {locationName}.
              Please verify and correct the values.
            </AlertDescription>
          </Alert>
        )}
        <div className="rounded-xl border border-slate-200/60 overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center">Bag Weight (kg)</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center">Bags</TableHead>
                  <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center">Total KG</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((row) => (
                  <TableRow key={row.productId} className={cn(row.totalKg < 0 && "bg-red-50/60")}>
                    <TableCell className="font-medium text-sm text-slate-800">
                      {row.productName}
                      {row.totalKg < 0 && (
                        <span className="ml-2 inline-flex items-center text-xs text-red-600 font-medium">
                          <AlertTriangle className="size-3 mr-0.5" /> Negative
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" value={row.bagWeight} onChange={(e) => updateBagWeight(locationId, row.productId, parseFloat(e.target.value) || 0, row.bags)} className="w-20 h-8 text-center text-sm mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" value={row.bags} onChange={(e) => updateBags(locationId, row.productId, parseFloat(e.target.value) || 0, row.bagWeight)} className="w-20 h-8 text-center text-sm mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" value={row.totalKg} onChange={(e) => updateTotalKg(locationId, row.productId, parseFloat(e.target.value) || 0, row.bagWeight)} className={cn("w-24 h-8 text-center text-sm mx-auto", row.totalKg < 0 && "border-red-300 bg-red-50 text-red-700 focus-visible:border-red-400")} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => handleSaveStock(locationId, locationName)} disabled={isSaved} className={cn("gap-2", isSaved && "bg-green-600 hover:bg-green-600")}>
            {isSaved ? <><Save className="size-4" /> Saved ✓</> : <><Save className="size-4" /> Save Stock Changes</>}
          </Button>
        </div>
      </div>
    );
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <PageHeader title="Purchases & Stock" subtitle="Danish Cattle Feed — Daily Register" />

        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Package className="size-5 text-slate-600" /> Current Stock Levels
            </CardTitle>
            <CardDescription>Edit bags or total KG — the other value auto-calculates.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="farm">
              <TabsList className="mb-4">
                <TabsTrigger value="farm" className="gap-1.5"><Warehouse className="size-4" /> Farm</TabsTrigger>
                <TabsTrigger value="shop" className="gap-1.5"><Store className="size-4" /> Shop</TabsTrigger>
              </TabsList>
              <TabsContent value="farm">{renderStockTable(1, "Farm", farmStock, setFarmStock)}</TabsContent>
              <TabsContent value="shop">{renderStockTable(2, "Shop", shopStock, setShopStock)}</TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="size-5 text-slate-600" /> Record a Purchase
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Purchase Type</Label>
              <RadioGroup value={purchaseType} onValueChange={(v) => { setPurchaseType(v as "supplier" | "settlement"); resetForm(); }} className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-3 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-emerald-500 has-[[data-state=checked]]:bg-emerald-50/50 transition-colors">
                  <RadioGroupItem value="supplier" id="type-supplier" />
                  <Label htmlFor="type-supplier" className="cursor-pointer text-sm font-medium flex items-center gap-2">
                    <Truck className="size-4 text-slate-500" /> From a supplier (I pay cash)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-3 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-violet-500 has-[[data-state=checked]]:bg-violet-50/50 transition-colors">
                  <RadioGroupItem value="settlement" id="type-settlement" />
                  <Label htmlFor="type-settlement" className="cursor-pointer text-sm font-medium flex items-center gap-2">
                    <UserCheck className="size-4 text-slate-500" /> From a credit customer (paid in goods, reduces their debt)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Location</Label>
                <RadioGroup value={purchaseLocation} onValueChange={(v) => setPurchaseLocation(v)} className="flex gap-3">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-2.5 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-slate-500 has-[[data-state=checked]]:bg-slate-100/70 transition-colors">
                      <RadioGroupItem value={String(loc.id)} id={`ploc-${loc.id}`} />
                      <Label htmlFor={`ploc-${loc.id}`} className="cursor-pointer text-sm font-medium flex items-center gap-1.5">
                        {loc.id === 1 ? <Warehouse className="size-4" /> : <Store className="size-4" />} {loc.name}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Unit</Label>
                <RadioGroup value={purchaseUnit} onValueChange={(v) => setPurchaseUnit(v as "bags" | "kg")} className="flex gap-3">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-2.5 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-slate-500 has-[[data-state=checked]]:bg-slate-100/70 transition-colors">
                    <RadioGroupItem value="bags" id="punit-bags" />
                    <Label htmlFor="punit-bags" className="cursor-pointer text-sm font-medium">Bags</Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-200/60 px-4 py-2.5 bg-slate-50/50 flex-1 cursor-pointer has-[[data-state=checked]]:border-slate-500 has-[[data-state=checked]]:bg-slate-100/70 transition-colors">
                    <RadioGroupItem value="kg" id="punit-kg" />
                    <Label htmlFor="punit-kg" className="cursor-pointer text-sm font-medium flex items-center gap-1.5">
                      <Scale className="size-4" /> KG (loose)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {purchaseType === "supplier" && (
              <div className="space-y-4 p-4 rounded-xl border border-emerald-200/60 bg-emerald-50/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Supplier</Label>
                    <Select value={selectedSupplier} onValueChange={(v) => setSelectedSupplier(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select supplier…" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.filter((s) => s.is_active).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Or New Supplier Name</Label>
                    <Input placeholder="Enter new supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Product</Label>
                    <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); const p = products.find((pr) => pr.id === Number(v)); if (p && !rate) setRate(String(p.default_rate)); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.is_active).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Quantity <span className="font-normal normal-case text-slate-400">({purchaseUnit === "bags" ? "bags" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" />
                  </div>
                  {purchaseUnit === "bags" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Bag Weight (kg)</Label>
                      <Input type="number" placeholder="50" value={bagWeight} onChange={(e) => setBagWeight(e.target.value)} min="0" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Rate <span className="font-normal normal-case text-slate-400">(per {purchaseUnit === "bags" ? "bag" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} min="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cash Paid (Rs.)</Label>
                    <Input type="number" placeholder="0" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} min="0" />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-100/60 px-4 py-3 border border-emerald-200/60">
                  <span className="text-sm font-semibold text-emerald-800">Goods Value</span>
                  <span className="text-lg font-extrabold text-emerald-700">Rs. {fmt(goodsValue)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Notes (optional)</Label>
                  <Textarea placeholder="Any notes about this purchase…" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] resize-none" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleAddSupplierPurchase} className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />} Add Purchase
                  </Button>
                </div>
              </div>
            )}

            {purchaseType === "settlement" && (
              <div className="space-y-4 p-4 rounded-xl border border-violet-200/60 bg-violet-50/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Credit Customer</Label>
                    <Select value={selectedCustomer} onValueChange={(v) => setSelectedCustomer(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select credit customer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {creditCustomers.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Product</Label>
                    <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); const p = products.find((pr) => pr.id === Number(v)); if (p && !rate) setRate(String(p.default_rate)); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.is_active).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Quantity <span className="font-normal normal-case text-slate-400">({purchaseUnit === "bags" ? "bags" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Rate <span className="font-normal normal-case text-slate-400">(per {purchaseUnit === "bags" ? "bag" : "kg"})</span></Label>
                    <Input type="number" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} min="0" />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-violet-100/60 px-4 py-3 border border-violet-200/60">
                  <span className="text-sm font-semibold text-violet-800">This reduces their debt by</span>
                  <span className="text-lg font-extrabold text-violet-700">Rs. {fmt(settlementValue)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Notes (optional)</Label>
                  <Textarea placeholder="Any notes about this settlement…" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] resize-none" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleRecordSettlement} className="gap-2 bg-violet-600 hover:bg-violet-700" disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />} Record Settlement
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="size-5 text-slate-600" /> Today&apos;s Purchases
            </CardTitle>
            <CardDescription>{purchases.length} purchase{purchases.length !== 1 && "s"} recorded today</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {purchases.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No purchases recorded yet today.</div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200/60 overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold">Source</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold">Location</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Value</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Cash Paid</TableHead>
                          <TableHead className="text-xs uppercase text-slate-500 font-semibold text-center"><span className="sr-only">Delete</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchases.map((p) => {
                          const source = p.settled_by_customer_id
                            ? p.customers?.name ?? "—"
                            : p.suppliers?.name ?? "—";
                          const isSettlement = !!p.settled_by_customer_id;
                          const value = getPurchaseValue(p);
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-slate-800">{source}</span>
                                  <span className={cn("text-[10px] font-semibold uppercase tracking-wide", isSettlement ? "text-violet-600" : "text-emerald-600")}>
                                    {isSettlement ? "Settlement" : "Supplier"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-700">{p.products?.name ?? "—"}</TableCell>
                              <TableCell className="text-sm text-slate-600">{p.locations?.name ?? "—"}</TableCell>
                              <TableCell className="text-sm text-slate-700 text-right font-mono">{getQuantityLabel(p)}</TableCell>
                              <TableCell className="text-sm text-slate-700 text-right font-mono">{fmt(p.rate_per_bag)}</TableCell>
                              <TableCell className="text-sm text-slate-900 text-right font-mono font-semibold">{fmt(value)}</TableCell>
                              <TableCell className="text-sm text-slate-700 text-right font-mono">{p.cash_paid > 0 ? fmt(p.cash_paid) : "—"}</TableCell>
                              <TableCell className="text-center">
                                <Button variant="ghost" size="icon" onClick={() => handleDeletePurchase(p.id)} className="size-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
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
                <div className="flex items-center justify-between rounded-xl bg-slate-100/80 px-5 py-3.5 border border-slate-200/60">
                  <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">Total Cash Paid Today</span>
                  <span className="text-xl font-extrabold text-slate-900">Rs. {fmt(totalCashPaid)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
