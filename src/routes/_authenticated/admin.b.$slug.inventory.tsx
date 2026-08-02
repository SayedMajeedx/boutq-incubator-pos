import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  Plus,
  Printer,
  Pencil,
  Trash2,
  Store,
  Barcode as BarcodeIcon,
  CheckCircle2,
  Search,
} from "lucide-react";
import { printLabels } from "@/components/barcode-label";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  component: IncubatorInventoryPage,
});

type ProductItem = {
  id: string;
  brand_id: string;
  vendor_id: string | null;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  base_price: number;
  is_active: boolean;
  created_at: string;
  product_variants: Array<{
    id: string;
    sku: string | null;
    barcode: string | null;
    selling_price: number;
    stock_incubator: number;
  }>;
  vendors?: {
    id: string;
    vendor_code: string;
    name_en: string;
    name_ar: string;
  } | null;
};

function IncubatorInventoryPage() {
  const { slug } = Route.useParams();
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);

  // Form State
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [basePrice, setBasePrice] = useState("12.500");
  const [shelfStock, setShelfStock] = useState("10");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 1. Fetch Brand
  const { data: brand } = useQuery({
    queryKey: ["inventory-brand", slug],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("slug", slug).single();
      return data;
    },
  });

  const brandId = brand?.id || "00000000-0000-0000-0000-000000000001";

  // 2. Fetch Active Vendors
  const { data: vendors = [] } = useQuery({
    queryKey: ["incubator-inventory-vendors", brandId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("*")
        .eq("brand_id", brandId)
        .order("name_en", { ascending: true });
      return data ?? [];
    },
  });

  // 3. Fetch Products with Variants & Vendors
  const { data: products = [], refetch: refetchProducts } = useQuery({
    queryKey: ["incubator-inventory-products", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), vendors(id, vendor_code, name_en, name_ar)")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });

      if (error) console.error("Inventory fetch error:", error);
      return (data as ProductItem[]) ?? [];
    },
  });

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedVendorFilter !== "all" && p.vendor_id !== selectedVendorFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = (p.name || p.name_en || p.name_ar || "").toLowerCase();
        const barcode = (p.product_variants?.[0]?.barcode || "").toLowerCase();
        const vendorCode = (p.vendors?.vendor_code || "").toLowerCase();
        return pName.includes(q) || barcode.includes(q) || vendorCode.includes(q);
      }
      return true;
    });
  }, [products, selectedVendorFilter, searchQuery]);

  // Open Modal for New Product
  const handleOpenNew = () => {
    setEditingProduct(null);
    const defaultVendor = vendors[0];
    setSelectedVendorId(defaultVendor?.id || "");
    setNameEn("");
    setNameAr("");
    setBasePrice("12.500");
    setShelfStock("10");

    // Auto-generate barcode code
    const prefix = defaultVendor?.vendor_code || "VEND";
    const randNum = Math.floor(1000 + Math.random() * 9000);
    setBarcodeValue(`${prefix}-${randNum}`);

    setIsModalOpen(true);
  };

  // Open Modal for Editing Product
  const handleOpenEdit = (p: ProductItem) => {
    setEditingProduct(p);
    setSelectedVendorId(p.vendor_id || vendors[0]?.id || "");
    setNameEn(p.name_en || p.name);
    setNameAr(p.name_ar || p.name);
    setBasePrice(Number(p.base_price || 0).toFixed(3));

    const variant = p.product_variants?.[0];
    setShelfStock((variant?.stock_incubator || 0).toString());
    setBarcodeValue(variant?.barcode || `${p.vendors?.vendor_code || "VEND"}-1001`);

    setIsModalOpen(true);
  };

  // Vendor Picker Changed -> Auto-update Barcode Prefix
  const handleVendorChange = (vId: string) => {
    setSelectedVendorId(vId);
    const v = vendors.find((x) => x.id === vId);
    if (v && !editingProduct) {
      const randNum = Math.floor(1000 + Math.random() * 9000);
      setBarcodeValue(`${v.vendor_code}-${randNum}`);
    }
  };

  // Submit Handler: Save Product + Variant + Barcode
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId) {
      alert("الرجاء اختيار البائع المالك للمنتج / Please select a vendor");
      return;
    }
    if (!nameEn || !nameAr) {
      alert("الرجاء إدخال اسم المنتج بالإنجليزية والعربية / Enter English and Arabic names");
      return;
    }

    setIsSaving(true);
    const priceVal = parseFloat(basePrice || "0.000");
    const stockVal = parseInt(shelfStock || "0", 10);

    try {
      if (editingProduct) {
        // Update Product
        const { error: pErr } = await supabase
          .from("products")
          .update({
            vendor_id: selectedVendorId,
            name: nameAr || nameEn,
            name_en: nameEn,
            name_ar: nameAr,
            base_price: priceVal,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingProduct.id);

        if (pErr) throw pErr;

        // Update Variant
        const variantId = editingProduct.product_variants?.[0]?.id;
        if (variantId) {
          await supabase
            .from("product_variants")
            .update({
              selling_price: priceVal,
              stock_incubator: stockVal,
              barcode: barcodeValue,
              updated_at: new Date().toISOString(),
            })
            .eq("id", variantId);
        }

        // Update / Insert Barcode
        await supabase.from("product_barcodes").upsert(
          {
            brand_id: brandId,
            vendor_id: selectedVendorId,
            variant_id: variantId,
            code: barcodeValue,
            is_active: true,
          },
          { onConflict: "brand_id,code" }
        );
      } else {
        // Insert Product
        const { data: newProduct, error: pErr } = await supabase
          .from("products")
          .insert({
            brand_id: brandId,
            vendor_id: selectedVendorId,
            name: nameAr || nameEn,
            name_en: nameEn,
            name_ar: nameAr,
            base_price: priceVal,
            is_active: true,
          })
          .select()
          .single();

        if (pErr) throw pErr;

        // Insert Variant
        const { data: newVariant, error: vErr } = await supabase
          .from("product_variants")
          .insert({
            brand_id: brandId,
            product_id: newProduct.id,
            sku: barcodeValue,
            barcode: barcodeValue,
            selling_price: priceVal,
            stock_incubator: stockVal,
            stock_main: stockVal,
          })
          .select()
          .single();

        if (vErr) throw vErr;

        // Insert Barcode
        await supabase.from("product_barcodes").insert({
          brand_id: brandId,
          vendor_id: selectedVendorId,
          variant_id: newVariant.id,
          code: barcodeValue,
          is_active: true,
        });
      }

      alert("تم حفظ المنتج والبارکود بنجاح! / Product saved successfully!");
      setIsModalOpen(false);
      refetchProducts();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id: string) => {
    if (!confirm("هل أنت تأكد من حذف هذا المنتج؟ / Are you sure?")) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      refetchProducts();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  // Print Thermal Label Trigger (50x30mm)
  const handlePrintLabel = (p: ProductItem) => {
    const variant = p.product_variants?.[0];
    const barcodeCode = variant?.barcode || p.vendors?.vendor_code || "1001";
    const vendorName = p.vendors?.name_en || p.vendors?.name_ar || "Boutq Incubator";

    printLabels([
      {
        code: barcodeCode,
        productName: p.name_ar || p.name_en || p.name,
        price: p.base_price,
        businessName: vendorName,
      },
    ]);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-bold shadow-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-white">إدارة مخزون الرفوف والبارکودات (Incubator Inventory)</h1>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                Physical Retail
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ربط المنتجات بالبائع المالك، توليد البارکودات، وطباعة الملصقات الحرارية (50x30mm)
            </p>
          </div>
        </div>

        <Button
          onClick={handleOpenNew}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة منتج جديد (+ Add Product)</span>
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Store className="w-4 h-4 text-amber-400 shrink-0" />
          <select
            value={selectedVendorFilter}
            onChange={(e) => setSelectedVendorFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-400 w-full sm:w-64"
          >
            <option value="all">جميع البائعين (All Vendors)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name_ar || v.name_en} ({v.vendor_code})
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو البارکود..."
            className="bg-slate-800 border-slate-700 pl-9 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <span>منتجات المعرض والرفوف ({filteredProducts.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm space-y-3">
              <Package className="w-12 h-12 mx-auto text-slate-700 animate-pulse" />
              <p>لا توجد منتجات مسجلة مطابقة للبحث</p>
              <Button size="sm" onClick={handleOpenNew} className="bg-amber-500 text-slate-950 font-bold text-xs">
                إضافة أول منتج الآن
              </Button>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                <tr>
                  <th className="p-3">كود/اسم البائع</th>
                  <th className="p-3">اسم المنتج</th>
                  <th className="p-3">سعر البيع (BHD)</th>
                  <th className="p-3">مخزون الرف</th>
                  <th className="p-3">البارکود</th>
                  <th className="p-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredProducts.map((p) => {
                  const variant = p.product_variants?.[0];
                  const stock = variant?.stock_incubator || 0;
                  const barcode = variant?.barcode || "N/A";
                  const vendorCode = p.vendors?.vendor_code || "VEND";
                  const vendorName = p.vendors?.name_ar || p.vendors?.name_en || "Incubator Vendor";

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] font-mono">
                          {vendorCode}
                        </Badge>
                        <span className="text-slate-300 block text-[11px] mt-0.5">{vendorName}</span>
                      </td>
                      <td className="p-3 font-semibold text-slate-100">
                        {p.name_ar || p.name_en || p.name}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-400">
                        {Number(p.base_price || 0).toFixed(3)} BHD
                      </td>
                      <td className="p-3 font-mono">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            stock > 0
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {stock} قطعة
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-amber-300 font-bold">{barcode}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 text-[10px] flex items-center gap-1"
                            onClick={() => handlePrintLabel(p)}
                          >
                            <Printer className="w-3 h-3" />
                            <span>طباعة ملصق 50x30mm</span>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                            onClick={() => handleOpenEdit(p)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                            onClick={() => handleDeleteProduct(p.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Modal: Create / Edit Incubator Product */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              <span>{editingProduct ? "تعديل بيانات المنتج" : "إضافة منتج جديد للرف"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveProduct} className="space-y-4 py-2 text-xs">
            {/* Vendor Selector */}
            <div className="space-y-1.5">
              <Label className="text-slate-300">البائع المالك للمنتج (Required Vendor)</Label>
              <select
                value={selectedVendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
                className="w-full h-9 bg-slate-950 border border-slate-800 text-amber-400 font-semibold text-xs rounded-md px-3 outline-none"
                required
              >
                <option value="">اختر البائع (Select Vendor)</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name_ar || v.name_en} ({v.vendor_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">اسم المنتج بالإنجليزية (English Name)</Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Royal Oud Perfume 100ml"
                className="bg-slate-950 border-slate-800 text-slate-100"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">اسم المنتج بالعربية (Arabic Name)</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثال: عطر العود الملكي 100 مل"
                className="bg-slate-950 border-slate-800 text-slate-100"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">سعر البيع (Retail Price BHD)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="12.500"
                  className="bg-slate-950 border-slate-800 text-emerald-400 font-mono font-bold text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">كمية المخزون بالرف (Shelf Stock)</Label>
                <Input
                  type="number"
                  value={shelfStock}
                  onChange={(e) => setShelfStock(e.target.value)}
                  placeholder="10"
                  className="bg-slate-950 border-slate-800 text-amber-400 font-mono font-bold text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">رمز البارکود (Auto Barcode)</Label>
              <Input
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                className="bg-slate-950 border-slate-800 text-amber-300 font-mono font-bold text-sm"
                required
              />
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                {isSaving ? "جاري الحفظ..." : editingProduct ? "تحديث المنتج" : "إضافة المنتج للمخزون"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
