import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  Zap,
  CheckCircle2,
  Clock,
  Building2,
  Copy,
  ExternalLink,
  Store,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/contracts")({
  component: ContractsPage,
});

function ContractsPage() {
  const { slug } = Route.useParams();
  const [isProcessingAutoDeduction, setIsProcessingAutoDeduction] = useState(false);
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Onboarding Form State
  const [vendorCode, setVendorCode] = useState(`VEND-${Math.floor(100 + Math.random() * 900)}`);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [rackNumber, setRackNumber] = useState("Rack #01");
  const [monthlyRent, setMonthlyRent] = useState("150.000");
  const [commissionPercent, setCommissionPercent] = useState("10.0");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  // Fetch Brand
  const { data: brand } = useQuery({
    queryKey: ["contracts-brand", slug],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("slug", slug).single();
      return data;
    },
  });

  // Fetch Contracts with signing_token and signed_at
  const { data: contracts = [], refetch: refetchContracts } = useQuery({
    queryKey: ["vendor-contracts-tokenized", brand?.id],
    enabled: !!brand?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_contracts")
        .select("*, vendors(name_en, name_ar, vendor_code)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch Rent Invoices
  const { data: rentInvoices = [], refetch: refetchInvoices } = useQuery({
    queryKey: ["vendor-rent-invoices", brand?.id],
    enabled: !!brand?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_rent_invoices")
        .select("*, vendors(name_en, name_ar, vendor_code)")
        .order("due_date", { ascending: false });
      return data ?? [];
    },
  });

  // Onboard Vendor & Generate Contract Handler
  const handleOnboardVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameEn || !nameAr) {
      alert("Please enter both English and Arabic vendor names");
      return;
    }

    setIsSaving(true);
    const bps = Math.round(parseFloat(commissionPercent || "10") * 100);
    const rentVal = parseFloat(monthlyRent || "150.000");

    try {
      // 1. Insert Vendor
      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .insert({
          brand_id: brand?.id || "00000000-0000-0000-0000-000000000001",
          vendor_code: vendorCode,
          name_en: nameEn,
          name_ar: nameAr,
          default_commission_bps: bps,
          status: "active",
        })
        .select()
        .single();

      if (vErr) throw vErr;

      // 2. Insert Contract (Postgres automatically sets signing_token DEFAULT)
      const { data: contract, error: cErr } = await supabase
        .from("vendor_contracts")
        .insert({
          vendor_id: vendor.id,
          rack_number: rackNumber,
          monthly_rent: rentVal,
          commission_bps: bps,
          start_date: startDate,
          end_date: endDate,
          status: "draft",
        })
        .select()
        .single();

      if (cErr) throw cErr;

      const tokenUrl = `${window.location.origin}/vendor/sign?token=${contract.signing_token}`;

      // 3. Generate Initial Rent Invoice
      await supabase.from("vendor_rent_invoices").insert({
        vendor_id: vendor.id,
        amount: rentVal,
        due_date: startDate,
        status: "pending",
      });

      const signUrl = `${window.location.origin}/vendor/sign?token=${signingToken}`;
      navigator.clipboard.writeText(signUrl);

      alert(
        `تم تسجيل البائع وإنشاء رابط التوقيع الإلكتروني بنجاح!\n\nرابط التوقيع التوكن المنسوخ:\n${signUrl}`
      );

      setIsOnboardModalOpen(false);
      refetchContracts();
      refetchInvoices();
    } catch (err: any) {
      alert(`Onboarding failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Rent Auto-Deduction Stored Procedure
  const handleRunRentAutoDeduction = async () => {
    if (!brand?.id) return;
    setIsProcessingAutoDeduction(true);
    try {
      const { data, error } = await supabase.rpc("process_rent_auto_deduction", {
        p_brand_id: brand.id,
      });
      if (error) throw error;

      alert(
        `خصم الإيجار التلقائي مكتمل!\n- الفواتير المخصومة: ${data.deducted_count}\n- المبلغ الكلي المقتطع: ${Number(
          data.deducted_amount
        ).toFixed(3)} BHD\n- الفواتير المتبقية: ${data.skipped_count}`
      );
      refetchInvoices();
      refetchContracts();
    } catch (e: any) {
      alert(`Auto-deduction failed: ${e.message}`);
    } finally {
      setIsProcessingAutoDeduction(false);
    }
  };

  const copyTokenizedSignLink = (signingToken: string, vendorName: string) => {
    const tokenUrl = `${window.location.origin}/vendor/sign?token=${signingToken}`;
    navigator.clipboard.writeText(tokenUrl);
    alert(`تم نسخ رابط التوقيع للبائع (${vendorName}):\n${tokenUrl}`);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white">العقود وروابط التوقيع (Lease Contracts & Signing Links)</h1>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
              Tokenized E-Sign
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            إضافة البائعين وتوليد رابط توقيع إلكتروني عام منفصل للتوقيع وتفعيل العقد
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsOnboardModalOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>+ تسجيل بائع وإنشاء عقد توكن</span>
          </Button>

          <Button
            onClick={handleRunRentAutoDeduction}
            disabled={isProcessingAutoDeduction}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg"
          >
            <Zap className="w-4 h-4" />
            <span>
              {isProcessingAutoDeduction ? "جاري الخصم..." : "خصم الإيجار من المبيعات"}
            </span>
          </Button>
        </div>
      </div>

      {/* Grid: Active Contracts & Rent Invoices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contracts Panel */}
        <Card className="bg-slate-900 border-slate-800 shadow-xl">
          <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>عقود الإيجار وروابط التوقيع ({contracts.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {contracts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">لا توجد عقود مسجلة حالياً</div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">البائع</th>
                    <th className="p-3">الرف</th>
                    <th className="p-3">الإيجار</th>
                    <th className="p-3">حالة التوقيع</th>
                    <th className="p-3 text-right">رابط التوقيع الخاص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {contracts.map((c) => {
                    const vendorName = c.vendors?.name_ar || c.vendors?.name_en || "Vendor";
                    const isSigned = c.status === "active" && !!c.signature_png_url;
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-100">{vendorName}</td>
                        <td className="p-3 font-mono text-slate-300">{c.rack_number || "Rack #1"}</td>
                        <td className="p-3 font-mono text-amber-400 font-bold">
                          {Number(c.monthly_rent || 0).toFixed(3)} BHD
                        </td>
                        <td className="p-3">
                          {isSigned ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>موقع (ACTIVE)</span>
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] flex items-center gap-1 w-fit">
                              <Clock className="w-3 h-3" />
                              <span>PENDING SIGNATURE</span>
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 text-[10px] flex items-center gap-1"
                            onClick={() => copyTokenizedSignLink(c.signing_token, vendorName)}
                          >
                            <Copy className="w-3 h-3" />
                            <span>نسخ رابط /sign</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Rent Invoices Panel */}
        <Card className="bg-slate-900 border-slate-800 shadow-xl">
          <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span>فواتير الإيجار الشهرية ({rentInvoices.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {rentInvoices.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">لا توجد فواتير إيجار مسجلة</div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">البائع</th>
                    <th className="p-3">استحقاق</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-semibold text-slate-100">
                        {inv.vendors?.name_ar || inv.vendors?.name_en || "Vendor"}
                      </td>
                      <td className="p-3 font-mono text-slate-400">{inv.due_date}</td>
                      <td className="p-3 font-mono text-rose-400 font-bold">
                        {Number(inv.amount || 0).toFixed(3)} BHD
                      </td>
                      <td className="p-3 text-right">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-mono ${
                            inv.status === "deducted_from_sales"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : inv.status === "paid"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {inv.status === "deducted_from_sales" ? "خصم من المبيعات" : inv.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal: Onboard Vendor & Generate Tokenized Contract */}
      <Dialog open={isOnboardModalOpen} onOpenChange={setIsOnboardModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-amber-400" />
              <span>تسجيل بائع وإنشاء رابط توقيع العقد</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleOnboardVendor} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">كود البائع (Vendor Code)</Label>
                <Input
                  value={vendorCode}
                  onChange={(e) => setVendorCode(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-amber-400 font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">رقم الرف المخصص (Rack #)</Label>
                <Input
                  value={rackNumber}
                  onChange={(e) => setRackNumber(e.target.value)}
                  placeholder="e.g. Rack #02"
                  className="bg-slate-950 border-slate-800 text-slate-100 font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">اسم المتجر بالإنجليزية</Label>
                <Input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Elegance Perfumes"
                  className="bg-slate-950 border-slate-800 text-slate-100"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">اسم المتجر بالعربية</Label>
                <Input
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: متجر العطور الأنيقة"
                  className="bg-slate-950 border-slate-800 text-slate-100"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">الإيجار الشهري (BHD Monthly Rent)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="150.000"
                  className="bg-slate-950 border-slate-800 text-rose-400 font-mono font-bold text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">عمولة المبيعات (Commission %)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  placeholder="10.0"
                  className="bg-slate-950 border-slate-800 text-emerald-400 font-mono font-bold text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">تاريخ بدء العقد</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">تاريخ انتهاء العقد</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100 font-mono"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOnboardModalOpen(false)}
                className="border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                {isSaving ? "جاري التوليد..." : "إنشاء العقد وتوليد رابط التوقيع"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
