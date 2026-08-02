import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SignatureCanvas } from "@/components/incubator/signature-canvas";
import { uploadPublicMedia } from "@/lib/r2-upload";
import {
  Wallet,
  TrendingUp,
  Package,
  FileText,
  Languages,
  Store,
  Calendar,
  CheckCircle2,
  Receipt,
  Download,
  Building2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/vendor-portal")({
  component: VendorPortalPage,
});

function VendorPortalPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();

  const [lang, setLang] = useState<"en" | "ar">("ar");
  const isRtl = lang === "ar";

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);

  // 1. Fetch Brand & Vendors
  const { data: brand } = useQuery({
    queryKey: ["vendor-portal-brand", slug],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("slug", slug).single();
      return data;
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendor-portal-vendors", brand?.id],
    enabled: !!brand?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("*")
        .eq("brand_id", brand!.id)
        .order("name_en", { ascending: true });
      return data ?? [];
    },
  });

  // Active vendor resolution
  const activeVendor = useMemo(() => {
    if (!vendors.length) return null;
    if (selectedVendorId) {
      return vendors.find((v) => v.id === selectedVendorId) || vendors[0];
    }
    return vendors[0];
  }, [vendors, selectedVendorId]);

  const activeVendorId = activeVendor?.id || null;

  // 2. Fetch Vendor Dashboard Stats via RPC
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["vendor-dashboard-stats", activeVendorId],
    enabled: !!activeVendorId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_dashboard_stats", {
        p_vendor_id: activeVendorId!,
      });
      if (error) console.error("Vendor stats error:", error);
      return data;
    },
  });

  // 3. Fetch Ledger Entries
  const { data: ledgerEntries = [], refetch: refetchLedger } = useQuery({
    queryKey: ["vendor-ledger-entries", activeVendorId],
    enabled: !!activeVendorId,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_ledger_entries")
        .select("*")
        .eq("vendor_id", activeVendorId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // 4. Fetch Products & Barcodes
  const { data: products = [] } = useQuery({
    queryKey: ["vendor-products", activeVendorId],
    enabled: !!activeVendorId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .eq("vendor_id", activeVendorId!)
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  // 5. Save Contract Signature Handler
  const handleSaveSignature = async (dataUrl: string) => {
    if (!activeVendorId || !stats?.contract?.id || !brand?.id) {
      alert(isRtl ? "لم يتم العثور على عقد نشط للتوقيع" : "No active lease contract found for signing");
      return;
    }

    setIsUploadingSignature(true);
    try {
      // Convert base64 Data URL to Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Upload to R2 / Supabase Storage via uploadPublicMedia
      let uploadedUrl = dataUrl;
      try {
        uploadedUrl = await uploadPublicMedia(brand.id, blob, "expense-receipt");
      } catch (err) {
        console.warn("R2 Upload fallback to dataUrl:", err);
      }

      // Update vendor_contracts table
      const { error } = await supabase
        .from("vendor_contracts")
        .update({
          signature_png_url: uploadedUrl,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", stats.contract.id);

      if (error) throw error;

      alert(isRtl ? "تم توثيق وحفظ التوقيع الإلكتروني بنجاح!" : "E-Signature saved and contract activated!");
      refetchStats();
    } catch (e: any) {
      alert(`Signature upload failed: ${e.message}`);
    } finally {
      setIsUploadingSignature(false);
    }
  };

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 font-sans select-none ${
        isRtl ? "rtl" : "ltr"
      }`}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:px-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg text-slate-950 font-bold">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">
                  {isRtl ? "بوابة المستأجرين والعلامات التجارية" : "Vendor & Leaser Portal"}
                </h1>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                  Incubator
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                {brand?.name_en || brand?.name || "Boutq Incubator"} — {isRtl ? "متابعة المبيعات والعقود" : "Live Ledger & Lease Contracts"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Vendor Picker Dropdown */}
            {vendors.length > 1 && (
              <select
                value={activeVendorId || ""}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-400"
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {isRtl ? v.name_ar || v.name_en : v.name_en} ({v.vendor_code})
                  </option>
                ))}
              </select>
            )}

            {/* Language Switcher */}
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 text-xs flex items-center gap-2"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
            >
              <Languages className="w-4 h-4" />
              <span>{lang === "en" ? "العربية (AR)" : "English (EN)"}</span>
            </Button>

            <Link
              to="/admin/b/$slug/dashboard"
              params={{ slug }}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-2 rounded-xl transition-colors"
            >
              {isRtl ? "لوحة الأدمن" : "Admin Panel"}
            </Link>
          </div>
        </header>

        {/* Vendor Profile Header */}
        {activeVendor && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-amber-400">
                  {isRtl ? activeVendor.name_ar || activeVendor.name_en : activeVendor.name_en}
                </span>
                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs">
                  {activeVendor.vendor_code}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRtl ? "نسبة عمولة الحاضنة:" : "Incubator Commission Rate:"}{" "}
                <span className="text-white font-semibold">
                  {((activeVendor.default_commission_bps || 1000) / 100).toFixed(1)}%
                </span>
              </p>
            </div>

            {stats?.contract && (
              <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-xs">
                <Calendar className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-slate-400">{isRtl ? "رقم الرف / العقد:" : "Rack / Contract:"}</span>{" "}
                  <span className="text-white font-bold">{stats.contract.rack_number || "Rack #1"}</span>
                  <span className="mx-2 text-slate-600">|</span>
                  <span className="text-slate-400">{isRtl ? "الإيجار الشهري:" : "Rent:"}</span>{" "}
                  <span className="text-amber-400 font-bold">
                    {Number(stats.contract.monthly_rent || 0).toFixed(3)} BHD
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card 1: Available Balance */}
          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "الرصيد المتاح للسحب" : "Available Ledger Balance"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-emerald-400">
                {Number(stats?.current_balance || 0).toFixed(3)} BHD
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {isRtl ? "صافي المستحقات بعد الخصم" : "Net payout balance after deductions"}
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Total Gross Sales */}
          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "إجمالي المبيعات" : "Total Gross Sales"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-amber-400">
                {Number(stats?.total_sales || 0).toFixed(3)} BHD
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {isRtl ? "المبيعات الكلية عبر الكاشير" : "Total register sales recorded"}
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Active Stock Level */}
          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "قطع المخزون في الرف" : "Active Inventory Items"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-blue-400">
                {stats?.active_stock || 0} {isRtl ? "قطعة" : "Units"}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {stats?.products_count || 0} {isRtl ? "منتجات معروضة" : "Products in rack"}
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Pending Rent */}
          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "فواتير الإيجار المعلقة" : "Pending Rent Invoices"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-rose-400">
                {Number(stats?.pending_rent || 0).toFixed(3)} BHD
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {isRtl ? "تخصم تلقائياً من المبيعات" : "Auto-deducted before payout"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="ledger" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-2xl grid grid-cols-3">
            <TabsTrigger value="ledger" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              {isRtl ? "دفتر الحسابات والسحوبات" : "Sales Ledger & Deductions"}
            </TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              {isRtl ? "المخزون والبارکودات" : "Inventory & Barcodes"}
            </TabsTrigger>
            <TabsTrigger value="contract" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              {isRtl ? "عقد الإيجار والتوقيع" : "Lease Contract & E-Signature"}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: LEDGER */}
          <TabsContent value="ledger" className="mt-4 space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="px-4 py-3 border-b border-slate-800 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span>{isRtl ? "سجل كشوفات الحساب والعمليات" : "Double-Entry Transaction History"}</span>
                </CardTitle>
                <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
                  {ledgerEntries.length} {isRtl ? "عملية" : "Entries"}
                </Badge>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {ledgerEntries.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    {isRtl ? "لا توجد معاملات مسجلة حتى الآن" : "No financial ledger entries recorded yet"}
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">{isRtl ? "التاريخ" : "Date"}</th>
                        <th className="p-3">{isRtl ? "نوع المعاملة" : "Type"}</th>
                        <th className="p-3">{isRtl ? "الوصف" : "Description"}</th>
                        <th className="p-3 text-right">{isRtl ? "المبلغ (دينار)" : "Amount (BHD)"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {ledgerEntries.map((entry) => {
                        const isCredit = Number(entry.amount) > 0;
                        return (
                          <tr key={entry.id} className="hover:bg-slate-800/40">
                            <td className="p-3 text-slate-400 whitespace-nowrap">
                              {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase font-mono ${
                                  entry.type === "sale"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                    : entry.type === "commission_deduction"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                    : entry.type === "rent_deduction"
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                    : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                }`}
                              >
                                {entry.type}
                              </Badge>
                            </td>
                            <td className="p-3 text-slate-200">{entry.description || "POS Entry"}</td>
                            <td
                              className={`p-3 font-mono font-bold text-right whitespace-nowrap ${
                                isCredit ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {isCredit ? "+" : ""}
                              {Number(entry.amount).toFixed(3)} BHD
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: INVENTORY */}
          <TabsContent value="inventory" className="mt-4 space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="px-4 py-3 border-b border-slate-800 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-400" />
                  <span>{isRtl ? "المنتجات المعروضة والمخزون المتاح" : "Vendor Product Inventory & Stock"}</span>
                </CardTitle>
                <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
                  {products.length} {isRtl ? "منتجات" : "Items"}
                </Badge>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {products.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    {isRtl ? "لا توجد منتجات مخصصة لهذا البائع" : "No products assigned to this vendor"}
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">{isRtl ? "اسم المنتج" : "Product Name"}</th>
                        <th className="p-3">{isRtl ? "الرمز (SKU)" : "SKU"}</th>
                        <th className="p-3">{isRtl ? "البارکود" : "Barcode"}</th>
                        <th className="p-3">{isRtl ? "سعر البيع" : "Unit Price"}</th>
                        <th className="p-3 text-right">{isRtl ? "المخزون في الرف" : "Stock"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {products.map((p) => {
                        const variant = p.product_variants?.[0];
                        return (
                          <tr key={p.id} className="hover:bg-slate-800/40">
                            <td className="p-3 font-semibold text-slate-100">
                              {isRtl ? p.name_ar || p.name : p.name_en || p.name}
                            </td>
                            <td className="p-3 font-mono text-slate-400">{variant?.sku || "N/A"}</td>
                            <td className="p-3 font-mono text-amber-400">{variant?.barcode || "N/A"}</td>
                            <td className="p-3 font-mono text-slate-200">
                              {Number(p.base_price || 0).toFixed(3)} BHD
                            </td>
                            <td className="p-3 text-right">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-mono ${
                                  (variant?.stock_incubator || 0) > 0
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                }`}
                              >
                                {variant?.stock_incubator || 0} {isRtl ? "قطعة" : "Units"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: CONTRACT & E-SIGNATURE */}
          <TabsContent value="contract" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Contract Summary */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3 border-b border-slate-800">
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>{isRtl ? "تفاصيل عقد الإيجار" : "Lease Contract Details"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">{isRtl ? "حالة العقد:" : "Contract Status:"}</span>
                    <Badge
                      className={`text-[10px] uppercase font-mono ${
                        stats?.contract?.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {stats?.contract?.status || "Draft / Pending Signature"}
                    </Badge>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">{isRtl ? "رقم الرف المخصص:" : "Rack Number:"}</span>
                    <span className="font-bold text-white">{stats?.contract?.rack_number || "Rack #1"}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">{isRtl ? "الإيجار الشهري المستحق:" : "Monthly Rent:"}</span>
                    <span className="font-bold text-amber-400">
                      {Number(stats?.contract?.monthly_rent || 0).toFixed(3)} BHD
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">{isRtl ? "نسبة اقتطاع المبيعات:" : "Sales Commission:"}</span>
                    <span className="font-bold text-white">
                      {((stats?.contract?.commission_bps || 1000) / 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">{isRtl ? "تاريخ بدء العقد:" : "Start Date:"}</span>
                    <span className="text-slate-200">{stats?.contract?.start_date || "2026-08-01"}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">{isRtl ? "تاريخ انتهاء العقد:" : "End Date:"}</span>
                    <span className="text-slate-200">{stats?.contract?.end_date || "2027-08-01"}</span>
                  </div>

                  {stats?.contract?.signature_png_url && (
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>{isRtl ? "التوقيع الإلكتروني الموثق:" : "Saved E-Signature PNG:"}</span>
                      </span>
                      <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center">
                        <img
                          src={stats.contract.signature_png_url}
                          alt="Contract Signature"
                          className="max-h-20 object-contain invert"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Signature Canvas Box */}
              <div>
                <SignatureCanvas
                  onSave={handleSaveSignature}
                  isRtl={isRtl}
                  isSubmitting={isUploadingSignature}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
