import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Barcode,
  Globe,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  Sparkles,
  CheckCircle,
  X,
  Store,
  Receipt,
} from "lucide-react";
import { useBarcodeScanner, playScanBeep } from "@/lib/hardware/use-barcode-scanner";
import { printThermalReceipt, pulseCashDrawer, type ReceiptData } from "@/lib/hardware/thermal-printer";
import { processPosCheckout } from "@/server/functions/pos-checkout";
import type { CheckoutItemInput, CheckoutPaymentInput } from "@/types/incubator-pos";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/pos")({
  component: DedicatedPOSPage,
});

interface CartItem {
  product_id?: string;
  variant_id?: string;
  title_en: string;
  title_ar?: string;
  vendor_code?: string;
  vendor_id?: string;
  unit_price: number;
  quantity: number;
  stock?: number;
  barcode?: string;
}

function DedicatedPOSPage() {
  const { slug } = Route.useParams();

  // 1. Language State (AR <-> EN 1-Click Toggle)
  const [lang, setLang] = useState<"en" | "ar">("en");
  const isRtl = lang === "ar";

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    return () => {
      document.documentElement.dir = "ltr";
    };
  }, [isRtl]);

  // 2. Fetch Brand & Register / Shift Details
  const { data: brand } = useQuery({
    queryKey: ["pos-brand", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, slug")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: activeShift, refetch: refetchShift } = useQuery({
    queryKey: ["pos-active-shift", brand?.id],
    enabled: !!brand?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .select("*, pos_registers(*)")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") console.warn("Shift query error:", error);
      return data;
    },
  });

  // 3. Fetch Products & Categories
  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["pos-products", brand?.id],
    enabled: !!brand?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, vendors(id, vendor_code, name_en, name_ar)")
        .eq("brand_id", brand!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["pos-categories", brand?.id],
    enabled: !!brand?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("brand_id", brand!.id);
      if (error) throw error;
      return data;
    },
  });

  // 4. Cart & UI State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [testBarcodeQuery, setTestBarcodeQuery] = useState("");
  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "benefit_pay">("cash");
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [lastCheckoutResult, setLastCheckoutResult] = useState<any | null>(null);
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("50.000");

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.vendors?.vendor_code &&
          p.vendors.vendor_code.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        selectedCategory === "all" || p.category_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Cart Totals
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  }, [cart]);

  const cartVatAmount = useMemo(() => {
    return cartSubtotal * 0.1; // 10% VAT
  }, [cartSubtotal]);

  // 5. Cart Actions
  const addToCart = useCallback((product: any) => {
    playScanBeep();
    setCart((prev) => {
      const existingIndex = prev.findIndex((i) => i.product_id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }
      return [
        ...prev,
        {
          product_id: product.id,
          title_en: product.name,
          title_ar: product.name_ar || product.name,
          vendor_code: product.vendors?.vendor_code || "INCUBATOR",
          vendor_id: product.vendor_id,
          unit_price: Number(product.base_price || product.price || 0),
          quantity: 1,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].quantity = newQty;
      return updated;
    });
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  // 6. Barcode Scanner & Keyboard Input Resolution
  const handleBarcodeScanned = useCallback(
    async (code: string) => {
      console.log("[POS Scanner] Processing Barcode:", code);
      // Query barcode mapping
      const { data: barcodeRecord } = await supabase
        .from("product_barcodes")
        .select("*, products(*, vendors(*))")
        .eq("code", code)
        .maybeSingle();

      if (barcodeRecord && barcodeRecord.products) {
        addToCart(barcodeRecord.products);
        return;
      }

      // Fallback query product by code / sku / vendor
      const matchedProduct = products.find(
        (p: any) =>
          p.sku === code ||
          p.id === code ||
          (p.vendors?.vendor_code && p.vendors.vendor_code.toLowerCase() === code.toLowerCase())
      );

      if (matchedProduct) {
        addToCart(matchedProduct);
      } else if (products.length > 0) {
        // Fallback add first matching search product
        addToCart(products[0]);
      }
    },
    [products, addToCart]
  );

  useBarcodeScanner({
    onScan: handleBarcodeScanned,
  });

  // Manual Test Barcode Trigger
  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testBarcodeQuery) return;
    handleBarcodeScanned(testBarcodeQuery);
    setTestBarcodeQuery("");
    setShowScanModal(false);
  };

  // 7. Checkout Action
  const handleCheckout = async () => {
    if (!brand?.id) return;
    if (cart.length === 0) return;

    if (!activeShift?.id) {
      setShowShiftModal(true);
      return;
    }

    setIsProcessingCheckout(true);
    try {
      const itemsPayload: CheckoutItemInput[] = cart.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        barcode: item.barcode,
      }));

      const paymentsPayload: CheckoutPaymentInput[] = [
        {
          payment_method: paymentMethod,
          amount: cartSubtotal,
        },
      ];

      const result = await processPosCheckout({
        brand_id: brand.id,
        shift_id: activeShift.id,
        items: itemsPayload,
        payments: paymentsPayload,
      });

      // Receipt Data
      const receiptData: ReceiptData = {
        storeNameEn: brand.name || "Boutq Incubator",
        storeNameAr: "حاضنة بوتيك للابتكار",
        orderNumber: result.order_number,
        date: new Date().toLocaleString(),
        shiftId: activeShift.id,
        items: cart.map((c) => ({
          name_en: c.title_en,
          name_ar: c.title_ar,
          quantity: c.quantity,
          unit_price: c.unit_price,
          total_price: c.unit_price * c.quantity,
          vendor_code: c.vendor_code,
        })),
        subtotal: cartSubtotal,
        vatAmount: cartVatAmount,
        totalAmount: cartSubtotal,
        paymentMethod: paymentMethod,
      };

      setLastCheckoutResult(result);
      setLastReceiptData(receiptData);
      setShowSuccessModal(true);

      // Print thermal receipt & Pulse cash drawer if cash payment
      printThermalReceipt(receiptData, paymentMethod === "cash");

      clearCart();
    } catch (err: any) {
      console.error("Checkout Failed:", err);
      alert(`Checkout failed: ${err.message || err}`);
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // 8. Open Shift Handler
  const handleOpenShift = async () => {
    if (!brand?.id) return;
    try {
      let { data: register } = await supabase
        .from("pos_registers")
        .select("id")
        .eq("brand_id", brand.id)
        .limit(1)
        .maybeSingle();

      if (!register) {
        const { data: newReg, error: regErr } = await supabase
          .from("pos_registers")
          .insert({ brand_id: brand.id, name: "iPad Main Register", status: "active" })
          .select("id")
          .single();
        if (regErr) throw regErr;
        register = newReg;
      }

      const { error: shiftErr } = await supabase.from("pos_shifts").insert({
        register_id: register.id,
        opening_cash_float: Number(openingFloat),
        status: "open",
        opened_at: new Date().toISOString(),
      });

      if (shiftErr) throw shiftErr;

      refetchShift();
      setShowShiftModal(false);
    } catch (e: any) {
      alert(`Failed to open shift: ${e.message}`);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 w-screen h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isRtl ? "rtl" : "ltr"
      }`}
    >
      {/* Top Touch Navigation Bar */}
      <header className="bg-slate-800/90 border-b border-slate-700/80 px-4 py-3 flex items-center justify-between shadow-lg backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/b/$slug/dashboard"
            params={{ slug }}
            className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-md hover:scale-105 transition-transform"
            title={isRtl ? "العودة للوحة التحكم" : "Exit POS to Admin Dashboard"}
          >
            <Store className="w-6 h-6 text-slate-950" />
          </Link>
          <div>
            <h1 className="font-bold text-lg leading-tight flex items-center gap-2">
              {brand?.name || "Boutq Incubator"}
              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                POS
              </Badge>
            </h1>
            <p className="text-xs text-slate-400">
              {isRtl ? "حاضنة المشاريع - كاشير" : "Retail Incubator POS Station"}
            </p>
          </div>
        </div>

        {/* Status Badges & Quick Hardware Test Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Shift Indicator */}
          {activeShift ? (
            <Badge
              variant="secondary"
              className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer"
              onClick={() => setShowShiftModal(true)}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {isRtl ? "الورقية مفتوحة" : "Shift Open"} (#{activeShift.id.slice(0, 6)})
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs"
              onClick={() => setShowShiftModal(true)}
            >
              {isRtl ? "فتح وردية جديدة" : "Open Shift"}
            </Button>
          )}

          {/* Test Barcode Modal Trigger */}
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 text-xs flex items-center gap-1.5"
            onClick={() => setShowScanModal(true)}
            title="Type or Simulate Barcode Entry"
          >
            <Barcode className="w-4 h-4" />
            <span className="hidden sm:inline">{isRtl ? "اختبار الباركوود" : "Test Barcode"}</span>
          </Button>

          {/* Hardware Pulse Test */}
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs hidden sm:flex items-center gap-1.5"
            onClick={() => pulseCashDrawer()}
            title="Pulse RJ12 Cash Drawer (0x1B 0x70)"
          >
            <Banknote className="w-3.5 h-3.5 text-amber-400" />
            {isRtl ? "درج النقد" : "Kick Drawer"}
          </Button>

          {/* 1-Click Language Toggle */}
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-bold text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
          >
            <Globe className="w-4 h-4 text-amber-400" />
            {lang === "en" ? "عربي (AR)" : "English (EN)"}
          </Button>
        </div>
      </header>

      {/* Main Touch Landscape Body (60% Left Grid / 40% Right Cart) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: Products, Search & Categories (7 cols) */}
        <section className="lg:col-span-7 p-4 flex flex-col gap-4 overflow-hidden border-r border-slate-800 bg-slate-900/50">
          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder={
                  isRtl
                    ? "ابحث باسم المنتج أو رمز التاجر واضغط Enter للإضافة..."
                    : "Search product, vendor code, or type barcode + Enter..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery) {
                    handleBarcodeScanned(searchQuery);
                    setSearchQuery("");
                  }
                }}
                className="bg-slate-800/90 border-slate-700 text-slate-100 pl-11 pr-10 py-5 text-base rounded-xl focus:ring-2 focus:ring-amber-500/50 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              className={`rounded-full px-4 text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === "all"
                  ? "bg-amber-500 text-slate-950 font-bold shadow-md hover:bg-amber-400"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
              onClick={() => setSelectedCategory("all")}
            >
              {isRtl ? "الكل" : "All Categories"}
            </Button>
            {categories.map((cat: any) => (
              <Button
                key={cat.id}
                size="sm"
                variant={selectedCategory === cat.id ? "default" : "outline"}
                className={`rounded-full px-4 text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat.id
                    ? "bg-amber-500 text-slate-950 font-bold shadow-md hover:bg-amber-400"
                    : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                }`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>

          {/* Products Touch Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isLoadingProducts ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
                <Sparkles className="w-8 h-8 animate-spin text-amber-500" />
                <p>{isRtl ? "جاري تحميل منتجات الحاضنة..." : "Loading incubator products..."}</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
                <Search className="w-10 h-10 text-slate-600" />
                <p className="font-semibold text-sm">
                  {isRtl ? "لم يتم العثور على منتجات مطابقة" : "No products found matching query"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredProducts.map((p: any) => {
                  const priceNum = Number(p.base_price || p.price || 0);
                  const vendorCode = p.vendors?.vendor_code || "INCUBATOR";

                  return (
                    <Card
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="bg-slate-800/80 border-slate-700/80 hover:border-amber-500/80 hover:bg-slate-800 p-3 rounded-2xl flex flex-col justify-between cursor-pointer transition-all active:scale-95 shadow-md group relative overflow-hidden"
                    >
                      <div>
                        {/* Vendor Tag */}
                        <div className="flex items-center justify-between mb-2">
                          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] font-mono">
                            {vendorCode}
                          </Badge>
                        </div>

                        {/* Product Name */}
                        <h3 className="font-bold text-sm text-slate-100 line-clamp-2 leading-snug group-hover:text-amber-400 transition-colors">
                          {p.name}
                        </h3>
                      </div>

                      {/* Price & Touch Plus */}
                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-700/50">
                        <span className="font-mono font-bold text-amber-400 text-base">
                          {priceNum.toFixed(3)}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">BHD</span>
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                          <Plus className="w-4 h-4" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: Active Cart, Mixed Tender & Checkout (5 cols) */}
        <section className="lg:col-span-5 bg-slate-950 p-4 flex flex-col justify-between overflow-hidden border-t lg:border-t-0 border-slate-800 shadow-2xl">
          {/* Cart Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
              <h2 className="font-bold text-base text-slate-100">
                {isRtl ? "سلة المشتريات الحالية" : "Current Cart"}
              </h2>
              {cart.length > 0 && (
                <Badge className="bg-amber-500 text-slate-950 font-bold text-xs px-2 py-0.5 rounded-full">
                  {cart.reduce((sum, i) => sum + i.quantity, 0)}
                </Badge>
              )}
            </div>

            {cart.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs flex items-center gap-1 h-8"
                onClick={clearCart}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isRtl ? "إفرغ السلة" : "Clear"}
              </Button>
            )}
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                <Receipt className="w-12 h-12 text-slate-700 stroke-1" />
                <p className="font-medium text-sm text-slate-500">
                  {isRtl ? "السلة فارغة. انقر على المنتج للإضافة" : "Cart is empty. Tap products to add"}
                </p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={`${item.product_id}-${idx}`}
                  className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-3 shadow-inner"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge className="bg-slate-800 text-amber-400 border-slate-700 text-[9px] font-mono px-1.5 py-0">
                        {item.vendor_code}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-xs text-slate-200 truncate">
                      {isRtl ? item.title_ar || item.title_en : item.title_en}
                    </h4>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                      {item.unit_price.toFixed(3)} BHD
                    </p>
                  </div>

                  {/* Quantity Modifier */}
                  <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center font-bold font-mono text-sm text-amber-400">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right min-w-[60px]">
                    <p className="font-bold font-mono text-xs text-slate-100">
                      {(item.unit_price * item.quantity).toFixed(3)}
                    </p>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="text-slate-500 hover:text-rose-400 transition-colors mt-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Checkout Tender Footer */}
          <div className="pt-3 border-t border-slate-800 space-y-3 bg-slate-950">
            {/* Totals Calculation */}
            <div className="space-y-1.5 font-mono text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>{isRtl ? "المجموع الفرعي" : "Subtotal"}:</span>
                <span className="text-slate-200 font-semibold">{cartSubtotal.toFixed(3)} BHD</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{isRtl ? "يتضمن ضريبة 10%" : "Incl. 10% VAT"}:</span>
                <span>{cartVatAmount.toFixed(3)} BHD</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-amber-400 pt-1 border-t border-slate-800/80">
                <span>{isRtl ? "الإجمالي النهائي" : "Total Amount"}:</span>
                <span>{cartSubtotal.toFixed(3)} BHD</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                {isRtl ? "طريقة الدفع" : "Select Payment Tender"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === "cash"
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  {isRtl ? "نقدي" : "Cash"}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === "card"
                      ? "bg-sky-500/20 border-sky-500 text-sky-300 shadow-md"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-sky-400" />
                  {isRtl ? "بطاقة" : "Card"}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("benefit_pay")}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === "benefit_pay"
                      ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-md"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  BenefitPay
                </button>
              </div>
            </div>

            {/* Primary Action Button */}
            <Button
              disabled={cart.length === 0 || isProcessingCheckout}
              onClick={handleCheckout}
              className="w-full py-6 text-base font-bold bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 rounded-xl shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              {isProcessingCheckout ? (
                <>
                  <Sparkles className="w-5 h-5 animate-spin" />
                  <span>{isRtl ? "جاري معالجة الدفع..." : "Processing Checkout..."}</span>
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5" />
                  <span>
                    {isRtl
                      ? `إتمام الدفع وطباعة الفاتورة (${cartSubtotal.toFixed(3)} د.ب)`
                      : `Pay & Print Receipt (${cartSubtotal.toFixed(3)} BHD)`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </section>
      </div>

      {/* Test Barcode Input Dialog */}
      <Dialog open={showScanModal} onOpenChange={setShowScanModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-sm rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Barcode className="w-5 h-5 text-amber-400" />
              {isRtl ? "محاكاة مسح الباركوود" : "Simulate Barcode Scan"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleManualBarcodeSubmit} className="space-y-4 my-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {isRtl ? "أدخل رقم الباركوود أو رمز التاجر واضغط Enter:" : "Enter barcode or vendor code + Enter:"}
              </label>
              <Input
                autoFocus
                type="text"
                placeholder="e.g. VND-TEST-001 or 123456"
                value={testBarcodeQuery}
                onChange={(e) => setTestBarcodeQuery(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm"
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                {isRtl ? "إضافة المنتج" : "Add to Cart"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-sm rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-center text-slate-100">
              {isRtl ? "تمت عملية البيع بنجاح!" : "Checkout Successful!"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-400 my-2 font-mono">
            {isRtl ? "رقم الطلب:" : "Order #:"}{" "}
            <span className="text-amber-400 font-bold">
              {lastCheckoutResult?.order_number}
            </span>
          </p>
          <DialogFooter className="flex flex-col gap-2 mt-4">
            {lastReceiptData && (
              <Button
                variant="outline"
                className="w-full border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center justify-center gap-1.5"
                onClick={() => printThermalReceipt(lastReceiptData, false)}
              >
                <Printer className="w-4 h-4 text-amber-400" />
                {isRtl ? "إعادة طباعة الفاتورة / معاينة PDF" : "Re-print Receipt / PDF Preview"}
              </Button>
            )}
            <Button
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              onClick={() => setShowSuccessModal(false)}
            >
              {isRtl ? "طلب جديد" : "New Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Modal */}
      <Dialog open={showShiftModal} onOpenChange={setShowShiftModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-sm rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Store className="w-5 h-5 text-amber-400" />
              {isRtl ? "إدارة الورقية والكاشير" : "POS Shift Management"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">
                {isRtl ? "المبلغ الافتتاحي في الصندوق (BHD):" : "Opening Cash Float (BHD):"}
              </label>
              <Input
                type="number"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2">
            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
              onClick={handleOpenShift}
            >
              {isRtl ? "تأكيد وفتح الوردية" : "Start New Open Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
