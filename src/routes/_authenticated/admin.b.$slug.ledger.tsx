import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownLeft, Plus, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/ledger")({
  component: VendorLedgerPage,
});

function VendorLedgerPage() {
  const { slug } = Route.useParams();
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>("all");

  // Fetch Brand
  const { data: brand } = useQuery({
    queryKey: ["ledger-brand", slug],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("slug", slug).single();
      return data;
    },
  });

  // Fetch Vendors
  const { data: vendors = [] } = useQuery({
    queryKey: ["ledger-vendors", brand?.id],
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

  // Fetch Ledger Entries
  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ["all-vendor-ledger", brand?.id, selectedVendorFilter],
    enabled: !!brand?.id,
    queryFn: async () => {
      let query = supabase
        .from("vendor_ledger_entries")
        .select("*, vendors(name_en, name_ar, vendor_code)")
        .eq("brand_id", brand!.id)
        .order("created_at", { ascending: false });

      if (selectedVendorFilter !== "all") {
        query = query.eq("vendor_id", selectedVendorFilter);
      }

      const { data } = await query;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white">دفتر أستاذ البائعين والأرصدة (Vendor Ledger & Balances)</h1>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
              Double-Entry
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            كشف حساب ثنائي القيود لكل بائع (مبيعات، خصم عمولة الحاضنة، اقتطاع الإيجار، وسحوبات الأرباح)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedVendorFilter}
            onChange={(e) => setSelectedVendorFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-400"
          >
            <option value="all">جميع البائعين (All Vendors)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name_ar || v.name_en} ({v.vendor_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Entries Table */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span>سجل المعاملات والقيود المالية ({ledgerEntries.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {ledgerEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">لا توجد قيود مالية مسجلة في دفتر الأستاذ</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">اسم البائع</th>
                  <th className="p-3">نوع القيد</th>
                  <th className="p-3">الوصف</th>
                  <th className="p-3 text-right">المبلغ (دينار)</th>
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
                      <td className="p-3 font-semibold text-slate-100">
                        {entry.vendors?.name_ar || entry.vendors?.name_en || "Vendor"}
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
    </div>
  );
}
