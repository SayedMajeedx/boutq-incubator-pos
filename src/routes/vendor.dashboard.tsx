import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Wallet,
  TrendingUp,
  Package,
  FileText,
  Building2,
  Calendar,
  Receipt,
  CheckCircle2,
  Languages,
} from "lucide-react";

export const Route = createFileRoute("/vendor/dashboard")({
  component: DedicatedVendorDashboard,
});

function VendorDashboard() {
  return <DedicatedVendorDashboard />;
}

function DedicatedVendorDashboard() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const isRtl = lang === "ar";
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // Fetch Vendors
  const { data: vendors = [] } = useQuery({
    queryKey: ["dedicated-vendor-list"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("*").order("name_en", { ascending: true });
      return data ?? [];
    },
  });

  const activeVendor = useMemo(() => {
    if (!vendors.length) return null;
    if (selectedVendorId) {
      return vendors.find((v) => v.id === selectedVendorId) || vendors[0];
    }
    return vendors[0];
  }, [vendors, selectedVendorId]);

  const activeVendorId = activeVendor?.id || null;

  // Fetch Vendor Stats
  const { data: stats } = useQuery({
    queryKey: ["dedicated-vendor-stats", activeVendorId],
    enabled: !!activeVendorId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_dashboard_stats", {
        p_vendor_id: activeVendorId!,
      });
      if (error) console.error("Vendor stats error:", error);
      return data;
    },
  });

  // Fetch Ledger Entries
  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ["dedicated-vendor-ledger", activeVendorId],
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

  // Fetch Products
  const { data: products = [] } = useQuery({
    queryKey: ["dedicated-vendor-products", activeVendorId],
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

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans select-none ${
        isRtl ? "dir-rtl" : "dir-ltr"
      }`}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:px-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-bold shadow-lg">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">
                  {isRtl ? "بوابة المستأجر الخاصة" : "Vendor Self-Service Portal"}
                </h1>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                  Vendor
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                {isRtl ? "لوحة تحكم مبيعات الرف، العقد، وكشف الحساب" : "Rack Sales, Contract & Ledger Balance"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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

            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 text-xs flex items-center gap-2"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
            >
              <Languages className="w-4 h-4" />
              <span>{lang === "en" ? "العربية (AR)" : "English (EN)"}</span>
            </Button>
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
                {isRtl ? "عمولة الحاضنة:" : "Incubator Commission:"}{" "}
                <span className="text-white font-semibold">
                  {((activeVendor.default_commission_bps || 1000) / 100).toFixed(1)}%
                </span>
              </p>
            </div>

            {stats?.contract && (
              <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-xs">
                <Calendar className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-slate-400">{isRtl ? "الرف المخصص:" : "Rack #:"}</span>{" "}
                  <span className="text-white font-bold">{stats.contract.rack_number || "Rack #1"}</span>
                  <span className="mx-2 text-slate-600">|</span>
                  <span className="text-slate-400">{isRtl ? "الإيجار:" : "Rent:"}</span>{" "}
                  <span className="text-amber-400 font-bold">
                    {Number(stats.contract.monthly_rent || 0).toFixed(3)} BHD
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "الرصيد المتاح للسحب" : "Available Balance"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-emerald-400">
                {Number(stats?.current_balance || 0).toFixed(3)} BHD
              </div>
            </CardContent>
          </Card>

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
            </CardContent>
          </Card>

          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "المخزون المعروض" : "Active Inventory"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-blue-400">
                {stats?.active_stock || 0} {isRtl ? "قطعة" : "Units"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/90 border-slate-800 shadow-lg">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-slate-400">
                {isRtl ? "الإيجار المستحق" : "Pending Rent"}
              </CardTitle>
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-rose-400">
                {Number(stats?.pending_rent || 0).toFixed(3)} BHD
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="ledger" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-2xl grid grid-cols-3">
            <TabsTrigger value="ledger" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              {isRtl ? "دفتر الحسابات والعمليات" : "Sales Ledger"}
            </TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              {isRtl ? "المخزون المعروض" : "Rack Inventory"}
            </TabsTrigger>
            <TabsTrigger value="contract" className="text-xs font-semibold data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              {isRtl ? "عقد الإيجار والتوقيع" : "Lease Contract"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">النوع</th>
                      <th className="p-3">الوصف</th>
                      <th className="p-3 text-right">المبلغ (BHD)</th>
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
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px] uppercase font-mono bg-slate-800 text-slate-300">
                              {entry.type}
                            </Badge>
                          </td>
                          <td className="p-3 text-slate-200">{entry.description || "POS Entry"}</td>
                          <td className={`p-3 font-mono font-bold text-right ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
                            {isCredit ? "+" : ""}{Number(entry.amount).toFixed(3)} BHD
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">اسم المنتج</th>
                      <th className="p-3">السعر</th>
                      <th className="p-3 text-right">المخزون المتاح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {products.map((p) => {
                      const variant = p.product_variants?.[0];
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-semibold text-slate-100">{isRtl ? p.name_ar || p.name : p.name_en || p.name}</td>
                          <td className="p-3 font-mono text-slate-200">{Number(p.base_price || 0).toFixed(3)} BHD</td>
                          <td className="p-3 text-right font-mono font-bold text-amber-400">
                            {variant?.stock_incubator || 0} قطعة
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contract" className="mt-4">
            <Card className="bg-slate-900 border-slate-800 p-6 text-xs space-y-3">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">حالة العقد:</span>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  {stats?.contract?.status || "ACTIVE"}
                </Badge>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">رقم الرف المخصص:</span>
                <span className="font-bold text-white">{stats?.contract?.rack_number || "Rack #1"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">الإيجار الشهري:</span>
                <span className="font-bold text-amber-400">{Number(stats?.contract?.monthly_rent || 0).toFixed(3)} BHD</span>
              </div>
              {stats?.contract?.signature_png_url && (
                <div className="pt-2">
                  <span className="text-slate-400 block mb-2 font-semibold">التوقيع الإلكتروني الموثق:</span>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center">
                    <img src={stats.contract.signature_png_url} alt="Contract Signature" className="max-h-24 object-contain invert" />
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
