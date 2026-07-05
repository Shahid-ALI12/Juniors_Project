"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { mockProducts, mockLocations, mockStock } from "@/lib/mock-data";
import type { Product } from "@/types";

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
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";

export default function ManageProducts() {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [editedRates, setEditedRates] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    mockProducts.forEach((p) => {
      initial[p.id] = String(p.default_rate);
    });
    return initial;
  });
  const [updatedIds, setUpdatedIds] = useState<Set<number>>(new Set());

  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");

  const handleRateChange = useCallback((id: number, value: string) => {
    // Allow only numeric input
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
    (id: number) => {
      const rateValue = Number(editedRates[id]);
      if (!rateValue || rateValue <= 0) {
        toast.error("Please enter a valid rate greater than 0.");
        return;
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, default_rate: rateValue } : p
        )
      );
      setUpdatedIds((prev) => new Set(prev).add(id));
      toast.success("Rate updated successfully!", {
        description: `New rate: Rs. ${rateValue.toLocaleString("en-PK")}/bag`,
      });
    },
    [editedRates]
  );

  const handleAddProduct = useCallback(() => {
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

    const maxId = products.reduce((max, p) => Math.max(max, p.id), 0);
    const newProduct: Product = {
      id: maxId + 1,
      name: trimmedName,
      default_rate: rateValue,
      is_active: true,
      created_at: new Date().toISOString().split("T")[0],
    };

    setProducts((prev) => [...prev, newProduct]);
    setEditedRates((prev) => ({ ...prev, [newProduct.id]: String(rateValue) }));
    setNewName("");
    setNewRate("");
    toast.success(`"${trimmedName}" added successfully!`, {
      description: `Starting rate: Rs. ${rateValue.toLocaleString("en-PK")}/bag`,
    });
  }, [newName, newRate, products]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Products & Rates"
        subtitle="Add products and set default selling rates."
      />

      {/* ─── Current Products ─── */}
      <section
        className="bg-white rounded-2xl border border-slate-200/60 shadow-sm bg-slate-50 overflow-hidden"
        aria-label="Current products"
      >
        <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BoxesIcon className="size-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">
              Current Products
            </h2>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {products.length}
            </span>
          </div>
        </div>

        {/* Info caption */}
        <div className="mx-4 sm:mx-6 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3 text-sm text-amber-800">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>
            Rates here are just the starting suggestion shown when entering a
            sale — you can always override the rate for any individual sale.
          </p>
        </div>

        {/* Table wrapper with scroll */}
        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  #
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">
                  Product Name
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[140px]">
                  Rate (Rs./bag)
                </TableHead>
                {mockLocations.map((loc) => (
                  <TableHead
                    key={loc.id}
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Warehouse className="size-3" />
                      {loc.name}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[100px]">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, index) => {
                const key = `${product.id}`;
                const isUpdated = updatedIds.has(product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="text-center text-slate-400 font-medium">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editedRates[product.id] ?? ""}
                        onChange={(e) =>
                          handleRateChange(product.id, e.target.value)
                        }
                        className={cn(
                          "w-28 mx-auto text-center h-8 text-sm font-mono tabular-nums",
                          isUpdated &&
                            "border-emerald-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-200"
                        )}
                      />
                    </TableCell>
                    {mockLocations.map((loc) => {
                      const stockKey = `${product.id}-${loc.id}`;
                      const stock = mockStock[stockKey] ?? 0;
                      return (
                        <TableCell key={loc.id} className="text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-sm font-medium px-2.5 py-0.5 rounded-full",
                              stock > 0
                                ? "text-emerald-700 bg-emerald-50"
                                : "text-red-600 bg-red-50"
                            )}
                          >
                            {stock} bags
                          </span>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={isUpdated ? "ghost" : "outline"}
                        onClick={() => handleUpdateRate(product.id)}
                        className={cn(
                          "gap-1.5 text-xs font-semibold transition-all",
                          isUpdated &&
                            "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        )}
                      >
                        {isUpdated ? (
                          <>
                            <CheckCircle2 className="size-3.5" />
                            Saved
                          </>
                        ) : (
                          <>
                            <Save className="size-3.5" />
                            Update
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ─── Add New Product ─── */}
      <section
        className="bg-white rounded-2xl border border-slate-200/60 shadow-sm bg-slate-50 p-6"
        aria-label="Add a new product"
      >
        <div className="flex items-center gap-2 mb-5">
          <PackagePlus className="size-5 text-slate-700" />
          <h2 className="text-lg font-bold text-slate-900">
            Add a New Product
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full space-y-1.5">
            <Label
              htmlFor="new-product-name"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >
              Product Name
            </Label>
            <Input
              id="new-product-name"
              placeholder="e.g. Barley (Jau)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="w-full sm:w-48 space-y-1.5">
            <Label
              htmlFor="new-product-rate"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >
              Starting Rate (Rs./bag)
            </Label>
            <Input
              id="new-product-rate"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 3000"
              value={newRate}
              onChange={(e) => {
                if (e.target.value === "" || /^\d*$/.test(e.target.value)) {
                  setNewRate(e.target.value);
                }
              }}
              className="h-10 font-mono tabular-nums"
            />
          </div>

          <Button
            onClick={handleAddProduct}
            className="h-10 px-6 gap-2 font-semibold shrink-0"
          >
            <PackagePlus className="size-4" />
            Add Product
          </Button>
        </div>
      </section>
    </div>
  );
}