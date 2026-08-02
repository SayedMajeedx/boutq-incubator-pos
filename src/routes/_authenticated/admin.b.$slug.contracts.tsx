import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, Plus, Zap, CheckCircle2, AlertCircle, Clock, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/contracts")({
  component: ContractsPage,
});

function ContractsPage() {
  const { slug } = Route.useParams();
  const [isProcessingAutoDeduction, setIsProcessingAutoDeduction] = useState(false);

  // Fetch Brand
  const { data: brand } = useQuery({
    queryKey: ["contracts-brand", slug],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("slug", slug).single();
      return data;
    },
  });

  // Fetch Contracts
  const { data: contracts = [], refetch: refetchContracts } = useQuery({
    queryKey: ["vendor-contracts", brand?.id],
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
        `Rent Auto-Deduction Engine Completed!\n- Invoices Deducted: ${data.deducted_count}\n- Total Deducted Amount: ${Number(data.deducted_amount).toFixed(3)} BHD\n- Skipped (Insufficient Balance): ${data.skipped_count}`
      );
      refetchInvoices();
      refetchContracts();
    } catch (e: any) {
      alert(`Auto-deduction failed: ${e.message}`);
    } finally {
      setIsProcessingAutoDeduction(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white">العقود وفواتير الإيجار (Lease Contracts & Rent)</h1>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
              Phase 4
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            إدارة عقود الإيجار للرفوف واقتطاع رسوم الإيجار تلقائياً من دفتر مبيعات البائعين
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleRunRentAutoDeduction}
            disabled={isProcessingAutoDeduction}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg"
          >
            <Zap className="w-4 h-4" />
            <span>
              {isProcessingAutoDeduction
                ? "جاري الخصم التلقائي..."
                : "خصم الإيجار التلقائي من المبيعات"}
            </span>
          </Button>
        </div>
      </div>

      {/* Grid: Active Contracts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contracts Panel */}
        <Card className="bg-slate-900 border-slate-800 shadow-xl">
          <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>عقود الإيجار المبرمة ({contracts.length})</span>
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
                    <th className="p-3">التوقيع</th>
                    <th className="p-3 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-semibold text-slate-100">
                        {c.vendors?.name_ar || c.vendors?.name_en || "Vendor"}
                      </td>
                      <td className="p-3 font-mono text-slate-300">{c.rack_number || "Rack #1"}</td>
                      <td className="p-3 font-mono text-amber-400 font-bold">
                        {Number(c.monthly_rent || 0).toFixed(3)} BHD
                      </td>
                      <td className="p-3">
                        {c.signature_png_url ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>موقع</span>
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" />
                            <span>بانتظار التوقيع</span>
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-mono ${
                            c.status === "active"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {c.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
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
                    <th className="p-3">تاريخ الاستحقاق</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3 text-right">طريقة الدفع والحالة</th>
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
    </div>
  );
}
