"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import ConfirmAction from "@/components/shared/confirm-action";
import type { Product, ProductStock } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PackagePlus,
  Save,
  CheckCircle2,
  Info,
  BoxesIcon,
  Loader2,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { fetchCached, invalidateCache, apiError } from "@/store";

export default function ManageProducts() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [editedRates, setEditedRates] = useState<Record<number, string>>({});
  const [updatedIds, setUpdatedIds] = useState<Set<number>>(new Set());
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [adding, setAdding] = useState(false);

  // Delete confirm state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    let pList: Product[] = [], sList: ProductStock[] = [];
    const failed: string[] = [];
    try { pList = await fetchCached<Product>("products", "/api/products", "products"); }
    catch { failed.push("products"); }
    try { sList = await fetchCached<ProductStock>("stock", "/api/stock", "stock"); }
    catch { failed.push("stock"); }
    setProducts(pList);
    setStockData(sList);
    if (failed.length > 0) toast.error(`Failed to load: ${failed.join(", ")}`);
    else {
      const initial: Record<number, string> = {};
      pList.forEach((p: Product) => { initial[p.id] = String(p.default_rate); });
      setEditedRates(initial);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const handleRateChange = useCallback((id: number, value: string) => {
    if (value === "" || /^\d*$/.test(value)) {
      setEditedRates((prev) => ({ ...prev, [id]: value }));
      setUpdatedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const handleUpdateRate = useCallback(
    async (id: number) => {
      const rateValue = Number(editedRates[id]);
      if (!rateValue || rateValue <= 0) {
        toast.error("Please enter a valid rate greater than 0.");
        return;
      }

      setUpdating((prev) => new Set(prev).add(id));
      try {
        const res = await fetch("/api/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, default_rate: rateValue }),
        });
        if (!res.ok) throw new Error(await apiError(res, "Failed to update rate"));
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, default_rate: rateValue } : p))
        );
        setUpdatedIds((prev) => new Set(prev).add(id));
        invalidateCache("products");
        toast.success("Rate updated successfully!", {
          description: `New rate: Rs. ${rateValue.toLocaleString("en-PK")}/bag`,
        });
      } catch {
        toast.error("Failed to update rate");
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [editedRates]
  );

  const handleAddProduct = useCallback(async () => {
    const trimmedName = newName.trim();
    const rateValue = Number(newRate);

    if (!trimmedName) {
      toast.error("Product name is required.");
      return;
    }
    if (!rateValue || rateValue <= 0) {
      toast.error("Please enter a valid starting rate greater than 0.");
      return;
    }
    if (products.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("A product with this name already exists.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, default_rate: rateValue }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Failed to create product"));
      const data = await res.json();
      const newProduct = data.product;
      if (!newProduct) throw new Error("Invalid response from server");
      setProducts((prev) => [...prev, newProduct]);
      setEditedRates((prev) => ({ ...prev, [newProduct.id]: String(rateValue) }));
      setNewName("");
      setNewRate("");
      invalidateCache("products");
      toast.success(`"${trimmedName}" added successfully!`, {
        description: `Starting rate: Rs. ${rateValue.toLocaleString("en-PK")}/bag`,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to add product");
    } finally {
      setAdding(false);
    }
  }, [newName, newRate, products]);

  const askDelete = useCallback((product: Product) => {
    setConfirmProduct(product);
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmProduct) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products?id=${confirmProduct.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to delete product");
      }
      const data = await res.json();
      invalidateCache("products");
      invalidateCache("stock");

      if (data.soft) {
        // Soft delete — mark inactive in local state
        setProducts((prev) =>
          prev.map((p) => (p.id === confirmProduct.id ? { ...p, is_active: false } : p))
        );
        toast.success(`"${confirmProduct.name}" deactivated`, {
          description:
            "Is product ke sales/purchases records maujood hain, is liye permanently delete nahi hua. Historical records safe hain.",
          duration: 6000,
        });
      } else {
        // Hard delete — remove from local state
        setProducts((prev) => prev.filter((p) => p.id !== confirmProduct.id));
        setStockData((prev) => prev.filter((s) => s.product_id !== confirmProduct.id));
        toast.success(`"${confirmProduct.name}" permanently deleted`, {
          description: "Product aur uski stock entry database se remove ho gayi.",
        });
      }
      setConfirmOpen(false);
      setConfirmProduct(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  }, [confirmProduct]);

  const handleRestore = useCallback(async (product: Product) => {
    try {
      const res = await fetch(`/api/products?id=${product.id}&restore=true`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to restore product");
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: true } : p))
      );
      invalidateCache("products");
      toast.success(`"${product.name}" restored`, {
        description: "Product dobara active ho gaya. Nai sales/purchases me use kar sakte hain.",
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to restore product");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const activeProducts = products.filter((p) => p.is_active);
  const inactiveProducts = products.filter((p) => !p.is_active);
  const visibleProducts = showInactive
    ? [...activeProducts, ...inactiveProducts]
    : activeProducts;

  return (
    <div className="space-y-6">
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirmProduct(null); }}
        title={`Delete "${confirmProduct?.name ?? ""}"?`}
        description="Ye product database se remove hoga. Agar is product ke sales ya purchases maujood hain, to woh historical records barqarar rakhne ke liye product sirf deactivate ho jayega (active = false). Warna permanently delete ho jayega."
        confirmLabel={deleting ? "Deleting..." : "Yes, Delete"}
        variant="danger"
        onConfirm={handleConfirmDelete}
        loading={deleting}
      />

      <PageHeader title="Manage Products & Rates" subtitle="Add products, set default selling rates, and remove unused ones." />

      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden" aria-label="Current products">
        <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BoxesIcon className="size-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">Current Products</h2>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {activeProducts.length} active
              {inactiveProducts.length > 0 && (
                <span className="text-slate-500"> • {inactiveProducts.length} inactive</span>
              )}
            </span>
          </div>

          {inactiveProducts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInactive((s) => !s)}
              className="text-xs gap-1.5 text-slate-600 hover:text-slate-900"
            >
              {showInactive ? "Hide inactive" : `Show ${inactiveProducts.length} inactive`}
            </Button>
          )}
        </div>

        <div className="mx-4 sm:mx-6 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3 text-sm text-amber-800">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>Rates here are just the starting suggestion shown when entering a sale — you can always override the rate for any individual sale. Delete button sirf tab kaam karega jab product kisi sale/purchase me use nahi hua.</p>
        </div>

        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">#</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Product Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[140px]">Rate (Rs./bag)</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]">Stock (bags)</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProducts.map((product, index) => {
                const isUpdated = updatedIds.has(product.id);
                const isUpdating = updating.has(product.id);
                const isInactive = !product.is_active;
                return (
                  <TableRow
                    key={product.id}
                    className={cn(isInactive && "opacity-50 bg-slate-50/50")}
                  >
                    <TableCell className="text-center text-slate-400 font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{product.name}</span>
                        {isInactive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editedRates[product.id] ?? ""}
                        onChange={(e) => handleRateChange(product.id, e.target.value)}
                        disabled={isInactive}
                        className={cn(
                          "w-28 mx-auto text-center h-8 text-sm font-mono tabular-nums",
                          isUpdated && "border-emerald-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-200",
                          isInactive && "bg-slate-100 cursor-not-allowed"
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const entry = stockData.find((s) => s.product_id === product.id);
                        const stock = entry?.stock_quantity ?? 0;
                        return (
                          <span className={cn("inline-flex items-center gap-1 text-sm font-medium px-2.5 py-0.5 rounded-full", stock > 0 ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50")}>
                            {stock} bags
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {isInactive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestore(product)}
                            className="gap-1.5 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                            title="Reactivate product"
                          >
                            <RotateCcw className="size-3.5" /> Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant={isUpdated ? "ghost" : "outline"}
                              onClick={() => handleUpdateRate(product.id)}
                              disabled={isUpdating}
                              className={cn("gap-1.5 text-xs font-semibold transition-all", isUpdated && "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50")}
                            >
                              {isUpdating ? <Loader2 className="size-3.5 animate-spin" /> : isUpdated ? <><CheckCircle2 className="size-3.5" /> Saved</> : <><Save className="size-3.5" /> Update</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => askDelete(product)}
                              disabled={isUpdating}
                              className="gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Delete / Deactivate product"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-400 text-sm">
                    No products yet — add one below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6" aria-label="Add a new product">
        <div className="flex items-center gap-2 mb-5">
          <PackagePlus className="size-5 text-slate-700" />
          <h2 className="text-lg font-bold text-slate-900">Add a New Product</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full space-y-1.5">
            <Label htmlFor="new-product-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</Label>
            <Input id="new-product-name" placeholder="e.g. Barley (Jau)" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10" />
          </div>
          <div className="w-full sm:w-48 space-y-1.5">
            <Label htmlFor="new-product-rate" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Starting Rate (Rs./bag)</Label>
            <Input id="new-product-rate" type="text" inputMode="numeric" placeholder="e.g. 3000" value={newRate} onChange={(e) => { if (e.target.value === "" || /^\d*$/.test(e.target.value)) setNewRate(e.target.value); }} className="h-10 font-mono tabular-nums" />
          </div>
          <Button onClick={handleAddProduct} className="h-10 px-6 gap-2 font-semibold shrink-0" disabled={adding}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />} Add Product
          </Button>
        </div>
      </section>
    </div>
  );
}
