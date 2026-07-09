"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import ConfirmAction from "@/components/shared/confirm-action";
import type { Product, ProductStock, Customer, Purchase, Location } from "@/types";
import { LocationSelect } from "@/components/shared/location-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  PackagePlus,
  Save,
  CheckCircle2,
  Info,
  BoxesIcon,
  Loader2,
  Trash2,
  RotateCcw,
  Ban,
  Download,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { fetchCached, invalidateCache, apiError } from "@/store";
import { pktToday } from "@/lib/pkt-date";

export default function ManageProducts() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [locationId, setLocationId] = useState<number>(1); // default Farmhouse
  const [editedRates, setEditedRates] = useState<Record<number, string>>({});
  const [updatedIds, setUpdatedIds] = useState<Set<number>>(new Set());
  const [updating, setUpdating] = useState<Set<number>>(new Set());

  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [adding, setAdding] = useState(false);

  // ───────────── BUY PRODUCT FEATURE ─────────────
  // Customer we're buying from + locations list (for the Buy Product form)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Buy Product form state
  const [buyCustomerId, setBuyCustomerId] = useState<string>("");
  const [buyProductId, setBuyProductId] = useState<string>("");
  const [buyRate, setBuyRate] = useState<string>("");
  const [buyBags, setBuyBags] = useState<string>("");
  const [buyLocationId, setBuyLocationId] = useState<number>(1);
  const [buyDate, setBuyDate] = useState<string>(pktToday());
  const [buyNotes, setBuyNotes] = useState<string>("");
  const [buying, setBuying] = useState(false);

  // Buy Product history (paginated)
  const [buyHistory, setBuyHistory] = useState<Purchase[]>([]);
  const [buyHistoryPage, setBuyHistoryPage] = useState(1);
  const [buyHistoryTotalPages, setBuyHistoryTotalPages] = useState(1);
  const [buyHistoryTotal, setBuyHistoryTotal] = useState(0);
  const [buyHistoryLoading, setBuyHistoryLoading] = useState(false);
  const [buyHistoryPageSize] = useState(10);
  const [downloadingBillId, setDownloadingBillId] = useState<number | null>(null);
  // NOTE: downloadingExcel state is declared below (shared with Active/Inactive
  // Products Download Excel buttons — added in the customer-payments commit).
  // We reuse it for the Buy Product Excel download as well.

  // Confirm dialog (shared by both soft-delete and permanent-delete)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [confirmMode, setConfirmMode] = useState<"soft" | "permanent">("soft");
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

    // Load customers (active only — these are the suppliers we buy from)
    try {
      const cRes = await fetch("/api/customers?active=true", { cache: "no-store" });
      if (cRes.ok) {
        const cData = await cRes.json();
        setCustomers(cData.customers ?? []);
      }
    } catch { /* silent */ }

    // Load locations (Farmhouse / Shop)
    try {
      const lRes = await fetch("/api/locations", { cache: "no-store" });
      if (lRes.ok) {
        const lData = await lRes.json();
        setLocations(lData.locations ?? []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  // ─── Load Buy Product history (paginated) ───
  const loadBuyHistory = useCallback(async (page: number) => {
    setBuyHistoryLoading(true);
    try {
      const url = `/api/purchases?from_customers_only=true&page=${page}&page_size=${buyHistoryPageSize}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch buy product history");
      const data = await res.json();
      setBuyHistory(data.rows ?? []);
      setBuyHistoryPage(data.page ?? 1);
      setBuyHistoryTotalPages(data.totalPages ?? 1);
      setBuyHistoryTotal(data.total ?? 0);
    } catch (e: any) {
      toast.error(e.message || "Failed to load buy product history");
      setBuyHistory([]);
    } finally {
      setBuyHistoryLoading(false);
    }
  }, [buyHistoryPageSize]);

  useEffect(() => {
    loadBuyHistory(1);
  }, [loadBuyHistory]);

  // Auto-computed total amount for the Buy Product form
  const buyTotalAmount = useMemo(() => {
    const r = Number(buyRate);
    const b = Number(buyBags);
    if (!Number.isFinite(r) || !Number.isFinite(b)) return 0;
    return r * b;
  }, [buyRate, buyBags]);

  // ─── Handle Buy Product form submission ───
  const handleBuyProduct = useCallback(async () => {
    if (!buyCustomerId) { toast.error("Customer name is required."); return; }
    if (!buyProductId) { toast.error("Please select a product."); return; }
    const rate = Number(buyRate);
    const bags = Number(buyBags);
    if (!rate || rate <= 0) { toast.error("Please enter a valid rate per bag."); return; }
    if (!bags || bags <= 0) { toast.error("Please enter a valid number of bags."); return; }
    if (!buyDate) { toast.error("Please select a date."); return; }

    setBuying(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_date: buyDate,
          product_id: Number(buyProductId),
          quantity: bags,
          rate_per_bag: rate,
          supplier_id: null,                 // no external supplier
          settled_by_customer_id: Number(buyCustomerId),  // we bought FROM this customer
          cash_paid: 0,                       // we owe them — they'll be paid later
          location_id: buyLocationId,
          notes: buyNotes.trim() || null,
          unit_type: "bags",
        }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Failed to record purchase"));
      const data = await res.json();

      // Reset form
      setBuyCustomerId("");
      setBuyProductId("");
      setBuyRate("");
      setBuyBags("");
      setBuyNotes("");

      // Refresh history + stock
      invalidateCache("stock");
      await loadBuyHistory(buyHistoryPage);

      toast.success("Buy Product recorded!", {
        description: `Total Rs. ${(rate * bags).toLocaleString("en-PK")} payable to ${customers.find(c => c.id === Number(buyCustomerId))?.name ?? "customer"}.`,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to record purchase");
    } finally {
      setBuying(false);
    }
  }, [buyCustomerId, buyProductId, buyRate, buyBags, buyDate, buyLocationId, buyNotes, customers, buyHistoryPage, loadBuyHistory]);

  // ─── Delete a Buy Product record ───
  const handleDeleteBuyRecord = useCallback(async (id: number) => {
    if (!confirm("Delete this buy product record? Stock will be reduced.")) return;
    try {
      const res = await fetch(`/api/purchases?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete record");
      }
      invalidateCache("stock");
      toast.success("Record deleted");
      // If we just deleted the last row on the current page, go back a page
      const newTotal = buyHistoryTotal - 1;
      const newPage = Math.min(buyHistoryPage, Math.max(1, Math.ceil(newTotal / buyHistoryPageSize)));
      await loadBuyHistory(newPage);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete record");
    }
  }, [buyHistoryPage, buyHistoryTotal, buyHistoryPageSize, loadBuyHistory]);

  // ─── Download PDF bill for a single Buy Product record ───
  const handleDownloadBuyBill = useCallback(async (purchase: Purchase) => {
    setDownloadingBillId(purchase.id);
    try {
      const { generateBuyProductBillPDF } = await import("@/lib/generate-buy-product-bill");
      const customer = purchase.customers
        ?? customers.find((c) => c.id === purchase.settled_by_customer_id)
        ?? null;
      const product = purchase.products
        ?? products.find((p) => p.id === purchase.product_id)
        ?? null;
      const locationName = locations.find((l) => l.id === purchase.location_id)?.name ?? null;
      await generateBuyProductBillPDF({
        purchase,
        customer,
        product,
        locationName,
        generatedAt: new Date().toLocaleString("en-PK"),
      });
      toast.success("Bill downloaded!");
    } catch (e: any) {
      console.error("Bill download error:", e);
      toast.error("Failed to generate bill");
    } finally {
      setDownloadingBillId(null);
    }
  }, [customers, products, locations]);

  // ─── Download all Buy Product records as Excel ───
  const handleDownloadBuyExcel = useCallback(async () => {
    setDownloadingExcel(true);
    const tid = "buy-excel-dl";
    toast.loading("Generating Excel…", { id: tid });
    try {
      // Fetch ALL records (single page, large size) for the export
      const res = await fetch(`/api/purchases?from_customers_only=true&page=1&page_size=10000`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch records for Excel");
      const data = await res.json();
      const rows = (data.rows ?? []) as Purchase[];

      if (rows.length === 0) {
        toast.error("No buy product records to download.", { id: tid });
        return;
      }

      const XLSX = await import("xlsx");
      const today = pktToday();
      const excelRows = rows.map((r, idx) => {
        const total = (Number(r.quantity) ?? 0) * (Number(r.rate_per_bag) ?? 0);
        return {
          "#": idx + 1,
          "Bill #": r.id,
          "Date": r.purchase_date,
          "Customer": r.customers?.name ?? `Customer #${r.settled_by_customer_id}`,
          "Phone": r.customers?.phone ?? "",
          "Product": r.products?.name ?? `Product #${r.product_id}`,
          "Bags": Number(r.quantity) ?? 0,
          "Rate / Bag (Rs.)": Number(r.rate_per_bag) ?? 0,
          "Total Amount (Rs.)": total,
          "Location": locations.find((l) => l.id === r.location_id)?.name ?? "—",
          "Notes": r.notes ?? "",
          "Entered By": r.entered_by ?? "",
        };
      });

      const ws = XLSX.utils.json_to_sheet(excelRows);
      // Set column widths
      ws["!cols"] = [
        { wch: 5 }, { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
        { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
        { wch: 30 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Buy Product History");
      XLSX.writeFile(wb, `buy_product_history_${today}.xlsx`);
      toast.success(`Excel downloaded! (${rows.length} records)`, { id: tid });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate Excel", { id: tid });
    } finally {
      setDownloadingExcel(false);
    }
  }, [locations]);

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
    if (products.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase() && !p.deleted_at)) {
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

  // ─── Soft-delete (deactivate) ───
  const askSoftDelete = useCallback((product: Product) => {
    setConfirmProduct(product);
    setConfirmMode("soft");
    setConfirmOpen(true);
  }, []);

  // ─── Permanent delete (tombstone) ───
  const askPermanentDelete = useCallback((product: Product) => {
    setConfirmProduct(product);
    setConfirmMode("permanent");
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmProduct) return;
    setDeleting(true);
    try {
      const isPermanent = confirmMode === "permanent";
      const url = isPermanent
        ? `/api/products?id=${confirmProduct.id}&permanent=true`
        : `/api/products?id=${confirmProduct.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to delete product");
      }
      const data = await res.json();
      invalidateCache("products");
      invalidateCache("stock");

      if (isPermanent) {
        // Permanent delete → remove from local state entirely.
        // Historical sales/purchases keep their product_id link and the
        // product name will still render on old receipts because the
        // row is tombstoned (deleted_at set), not physically removed.
        setProducts((prev) => prev.filter((p) => p.id !== confirmProduct.id));
        setStockData((prev) => prev.filter((s) => s.product_id !== confirmProduct.id));
        toast.success(`"${confirmProduct.name}" permanently deleted`, {
          description:
            "Product sabhi dropdowns aur Manage Products list se hata diya gaya. Historical sales/purchases records safe hain — purani receipts par product name abhi bhi dikhega.",
          duration: 7000,
        });
      } else if (data.soft) {
        // Soft-delete → mark inactive in local state, keep visible in Inactive section
        setProducts((prev) =>
          prev.map((p) => (p.id === confirmProduct.id ? { ...p, is_active: false } : p))
        );
        toast.success(`"${confirmProduct.name}" deactivated`, {
          description:
            "Product inactive ho gaya. Nai sales/purchases me use nahi hoga. Agar chahein to neeche 'Inactive Products' section se restore ya permanently delete kar sakte hain.",
          duration: 6000,
        });
      } else {
        // No references → API hard-deleted (rare path for soft-delete flow)
        setProducts((prev) => prev.filter((p) => p.id !== confirmProduct.id));
        setStockData((prev) => prev.filter((s) => s.product_id !== confirmProduct.id));
        toast.success(`"${confirmProduct.name}" deleted`, {
          description: "Product database se remove ho gaya — koi historical records nahi the.",
        });
      }
      setConfirmOpen(false);
      setConfirmProduct(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  }, [confirmProduct, confirmMode]);

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

  // ─── Download Excel helper ───
  // Builds an XLSX workbook from a list of products with stock info merged in,
  // then triggers a browser download. Filename includes a date stamp so
  // repeated exports don't overwrite each other.
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const downloadProductsExcel = useCallback(
    async (list: Product[], kind: "active" | "inactive") => {
      if (list.length === 0) {
        toast.error(`No ${kind} products to download.`);
        return;
      }
      setDownloadingExcel(true);
      try {
        const { downloadExcel } = await import("@/lib/download-excel");
        const rows = list.map((p) => {
          const stockEntry = stockData.find(
            (s) => s.product_id === p.id && s.location_id === locationId
          );
          return {
            id: p.id,
            name: p.name,
            default_rate: p.default_rate,
            stock_bags: stockEntry?.stock_quantity ?? 0,
            is_active: p.is_active ? "Yes" : "No",
            created_at: p.created_at,
          };
        });
        await downloadExcel(rows, [
          { key: "id", label: "ID" },
          { key: "name", label: "Product Name" },
          { key: "default_rate", label: "Rate (Rs./bag)", align: "right" },
          { key: "stock_bags", label: "Stock (bags)", align: "right" },
          { key: "is_active", label: "Active" },
          { key: "created_at", label: "Created At" },
        ], `${kind}-products`);
        toast.success(`${kind === "active" ? "Active" : "Inactive"} products Excel downloaded`, {
          description: `${rows.length} product(s) exported.`,
        });
      } catch (e: any) {
        toast.error(e?.message || "Excel download failed");
      } finally {
        setDownloadingExcel(false);
      }
    },
    [stockData, locationId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Tombstoned products (deleted_at set) are NEVER returned by GET /api/products
  // (filtered server-side), so we don't need to filter them again here.
  // The lists below show only living products: active + soft-deleted (inactive).
  const activeProducts = products.filter((p) => p.is_active);
  const inactiveProducts = products.filter((p) => !p.is_active);

  const confirmTitle =
    confirmMode === "permanent"
      ? `Permanently delete "${confirmProduct?.name ?? ""}"?`
      : `Deactivate "${confirmProduct?.name ?? ""}"?`;

  const confirmDescription =
    confirmMode === "permanent"
      ? "Ye product sabhi dropdowns, sale/purchase forms, aur is list se hamesha ke liye hata diya jayega. Lekin is product ki purani sales aur purchases records SAFE rahengi — purani receipts par product name abhi bhi dikhega. Ye action reverse nahi hoga."
      : "Ye product inactive ho jayega (nai sales/purchases me use nahi hoga) lekin is list ke 'Inactive Products' section me dikhayi dega. Wahan se aap isko Restore ya Permanently Delete kar sakte hain. Historical records safe rahenge.";

  const confirmLabel =
    confirmMode === "permanent"
      ? (deleting ? "Deleting..." : "Yes, Permanently Delete")
      : (deleting ? "Deactivating..." : "Yes, Deactivate");

  return (
    <div className="space-y-6">
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirmProduct(null); }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        variant="danger"
        onConfirm={handleConfirmDelete}
        loading={deleting}
      />

      <PageHeader title="Manage Products & Rates" subtitle="Add products, set default selling rates, deactivate, or permanently delete." />

      <QuickNav
        title="Jump to"
        items={[
          { id: "section-active", label: "Active Products", icon: BoxesIcon, iconColor: "text-emerald-600" },
          ...(inactiveProducts.length > 0 ? [{ id: "section-inactive", label: "Inactive Products", icon: Ban }] : []),
          { id: "section-add-new", label: "Add New Product", icon: PackagePlus },
        ]}
      />

      {/* ───────────── LOCATION FILTER ───────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-slate-200/60 shadow-sm">
        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">Stock Location:</Label>
        <LocationSelect value={locationId} onChange={setLocationId} />
        <span className="text-xs text-slate-500">Stock column below reflects the selected location.</span>
      </div>

      {/* ───────────── ACTIVE PRODUCTS ───────────── */}
      <section id="section-active" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden scroll-mt-24" aria-label="Active products">
        <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <BoxesIcon className="size-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Active Products</h2>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              {activeProducts.length}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadProductsExcel(activeProducts, "active")}
            disabled={activeProducts.length === 0 || downloadingExcel}
            className="gap-1.5 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 self-start sm:self-auto"
            title="Download active products as Excel"
          >
            {downloadingExcel ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {downloadingExcel ? "Downloading..." : "Download Excel"}
          </Button>
        </div>

        <div className="mx-4 sm:mx-6 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3 text-sm text-amber-800">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>Rates here are just the starting suggestion shown when entering a sale — you can always override the rate for any individual sale. Trash icon product ko inactive kar dega (soft-delete). Permanently delete karne ke liye neeche <strong>Inactive Products</strong> section me jayein.</p>
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
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
              {activeProducts.map((product, index) => {
                const isUpdated = updatedIds.has(product.id);
                const isUpdating = updating.has(product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="text-center text-slate-400 font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900">{product.name}</TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editedRates[product.id] ?? ""}
                        onChange={(e) => handleRateChange(product.id, e.target.value)}
                        className={cn(
                          "w-28 mx-auto text-center h-8 text-sm font-mono tabular-nums",
                          isUpdated && "border-emerald-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-200"
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const entry = stockData.find(
                          (s) => s.product_id === product.id && s.location_id === locationId
                        );
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
                          onClick={() => askSoftDelete(product)}
                          disabled={isUpdating}
                          className="gap-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          title="Deactivate product (soft delete)"
                        >
                          <Ban className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {activeProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-400 text-sm">
                    No active products yet — add one below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ───────────── INACTIVE PRODUCTS ───────────── */}
      {inactiveProducts.length > 0 && (
        <section id="section-inactive" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden scroll-mt-24" aria-label="Inactive products">
          <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ban className="size-5 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">Inactive Products</h2>
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {inactiveProducts.length}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadProductsExcel(inactiveProducts, "inactive")}
              disabled={downloadingExcel}
              className="gap-1.5 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 self-start sm:self-auto"
              title="Download inactive products as Excel"
            >
              {downloadingExcel ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {downloadingExcel ? "Downloading..." : "Download Excel"}
            </Button>
          </div>

          <div className="mx-4 sm:mx-6 mb-4 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200/60 px-4 py-3 text-sm text-blue-800">
            <Info className="size-4 mt-0.5 shrink-0" />
            <p>
              Yahan <strong>Restore</strong> se product dobara active kar sakte hain, ya <strong>Delete Permanently</strong> se hamesha ke liye hata sakte hain. Permanently delete karne ke baad bhi is product ki <strong>historical sales/purchases records safe rahengi</strong> — purani receipts par name abhi bhi dikhega. Bas nai sales/purchases me yeh product available nahi hoga.
            </p>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Product Name</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]">Last Rate (Rs./bag)</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[120px]">Stock (bags)</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[220px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inactiveProducts.map((product, index) => (
                  <TableRow key={product.id} className="bg-slate-50/40">
                    <TableCell className="text-center text-slate-400 font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <span>{product.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">
                          Inactive
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600 font-mono tabular-nums">
                      Rs. {(product.default_rate ?? 0).toLocaleString("en-PK")}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const entry = stockData.find(
                          (s) => s.product_id === product.id && s.location_id === locationId
                        );
                        const stock = entry?.stock_quantity ?? 0;
                        return (
                          <span className="text-sm text-slate-500 font-medium">
                            {stock} bags
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestore(product)}
                          className="gap-1.5 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                          title="Reactivate product"
                        >
                          <RotateCcw className="size-3.5" /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => askPermanentDelete(product)}
                          className="gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Permanently delete (historical records stay safe)"
                        >
                          <Trash2 className="size-3.5" /> Delete Permanently
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* ───────────── ADD NEW PRODUCT ───────────── */}
      <section id="section-add-new" className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 scroll-mt-24" aria-label="Add a new product">
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

      {/* ════════════════════════════════════════════════════════
          BUY PRODUCT — record goods bought FROM a customer.
          The customer is acting as our supplier; we owe them money
          for the goods. The amount appears in their khata as
          "Paid in Goods" (reduces balance_due, can go negative meaning
          we owe them).
         ════════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-2xl border border-amber-200/60 shadow-sm p-6" aria-label="Buy product from customer">
        <div className="flex items-center gap-2 mb-5">
          <ShoppingBag className="size-5 text-amber-600" />
          <h2 className="text-lg font-bold text-slate-900">Buy Product</h2>
          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            from customer
          </span>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3 text-sm text-amber-800">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>
            Yahan record karein jab koi customer aap ko kuch cheeze <strong>bechta</strong> hai (woh aap ka supplier ban jaata hai).
            Customer ka naam, product, rate/bag, kitne bags le, location (Farmhouse/Shop), aur date daalein.
            Total amount automatically calculate ho jaayega. Yeh record customer ke khata me "Paid in Goods" ke
            under show hoga aur unka balance_due is se minus hoga.
          </p>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Customer Name <span className="text-red-500">*</span>
            </Label>
            <Select value={buyCustomerId} onValueChange={setBuyCustomerId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.phone ? ` — ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Product <span className="text-red-500">*</span>
            </Label>
            <Select value={buyProductId} onValueChange={setBuyProductId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rate per bag */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Rate / Bag (Rs.) <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 3000"
              value={buyRate}
              onChange={(e) => { if (e.target.value === "" || /^\d*$/.test(e.target.value)) setBuyRate(e.target.value); }}
              className="h-10 font-mono tabular-nums"
            />
          </div>

          {/* Bags */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Bags <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 10"
              value={buyBags}
              onChange={(e) => { if (e.target.value === "" || /^\d*$/.test(e.target.value)) setBuyBags(e.target.value); }}
              className="h-10 font-mono tabular-nums"
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</Label>
            <LocationSelect value={buyLocationId} onChange={setBuyLocationId} />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</Label>
            <Input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes (optional)</Label>
            <Input
              type="text"
              placeholder="e.g. Wanda purchased from customer"
              value={buyNotes}
              onChange={(e) => setBuyNotes(e.target.value)}
              className="h-10"
            />
          </div>
        </div>

        {/* Total + submit */}
        <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-end gap-4 justify-end">
          <div className="flex flex-col items-end gap-0.5 bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Total Amount Payable
            </span>
            <span className="text-2xl font-extrabold text-amber-900 tabular-nums">
              Rs. {buyTotalAmount.toLocaleString("en-PK")}
            </span>
          </div>
          <Button
            onClick={handleBuyProduct}
            className="h-12 px-8 gap-2 font-semibold shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={buying}
          >
            {buying ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}
            {buying ? "Recording..." : "Record Buy"}
          </Button>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          BUY PRODUCT HISTORY — paginated table with Excel download
         ════════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden" aria-label="Buy product history">
        <div className="px-4 sm:px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-amber-600" />
            <h2 className="text-lg font-bold text-slate-900">Buy Product History</h2>
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              {buyHistoryTotal} record{buyHistoryTotal !== 1 ? "s" : ""}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadBuyExcel}
            disabled={downloadingExcel || buyHistoryTotal === 0}
            className="gap-1.5 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 self-start sm:self-auto"
            title="Download all buy product records as Excel"
          >
            {downloadingExcel ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download Excel
          </Button>
        </div>

        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">#</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[150px]">Customer</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Product</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[80px]">Bags</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right min-w-[100px]">Rate / Bag</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right min-w-[120px]">Total Amount</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[100px]">Location</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center min-w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyHistoryLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Loader2 className="size-6 animate-spin text-slate-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : buyHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                    No buy product records yet — record one above.
                  </TableCell>
                </TableRow>
              ) : (
                buyHistory.map((pur, idx) => {
                  const total = (Number(pur.quantity) ?? 0) * (Number(pur.rate_per_bag) ?? 0);
                  const locName = locations.find((l) => l.id === pur.location_id)?.name ?? "—";
                  return (
                    <TableRow key={pur.id}>
                      <TableCell className="text-center text-slate-400 font-medium">
                        {(buyHistoryPage - 1) * buyHistoryPageSize + idx + 1}
                      </TableCell>
                      <TableCell className="text-slate-700">{pur.purchase_date}</TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {pur.customers?.name ?? `Customer #${pur.settled_by_customer_id}`}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {pur.products?.name ?? `Product #${pur.product_id}`}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {Number(pur.quantity).toLocaleString("en-PK")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        Rs. {Number(pur.rate_per_bag).toLocaleString("en-PK")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-amber-800">
                        Rs. {total.toLocaleString("en-PK")}
                      </TableCell>
                      <TableCell className="text-center text-xs text-slate-600">
                        {locName}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadBuyBill(pur)}
                            disabled={downloadingBillId === pur.id}
                            className="gap-1.5 text-xs font-semibold text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                            title="Download PDF bill for this record"
                          >
                            {downloadingBillId === pur.id
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <FileText className="size-3.5" />}
                            Bill
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteBuyRecord(pur.id)}
                            className="gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                            title="Delete record"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {buyHistoryTotalPages > 1 && (
          <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Page {buyHistoryPage} of {buyHistoryTotalPages} • {buyHistoryTotal} total records
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadBuyHistory(buyHistoryPage - 1)}
                disabled={buyHistoryPage <= 1 || buyHistoryLoading}
                className="gap-1.5 text-xs font-semibold"
              >
                <ChevronLeft className="size-3.5" /> Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadBuyHistory(buyHistoryPage + 1)}
                disabled={buyHistoryPage >= buyHistoryTotalPages || buyHistoryLoading}
                className="gap-1.5 text-xs font-semibold"
              >
                Next <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
