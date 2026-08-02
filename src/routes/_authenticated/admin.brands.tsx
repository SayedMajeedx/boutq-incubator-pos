import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  Plus,
  Store,
  Pencil,
  Trash2,
  Building2,
  Percent,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";

export const Route = createFileRoute("/_authenticated/admin/brands")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const email = (user.email || "").toLowerCase();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL || profile?.role === "super_admin";
    if (!isSuperAdmin) throw redirect({ to: "/admin" });
  },
  component: VendorsAndBrandsPage,
});

type VendorRecord = {
  id: string;
  brand_id: string | null;
  vendor_code: string;
  name_en: string;
  name_ar: string;
  status: "active" | "suspended" | "inactive";
  default_commission_bps: number;
  created_at: string;
};

function VendorsAndBrandsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorRecord | null>(null);

  // Form State
  const [vendorCode, setVendorCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("10.0");
  const [status, setStatus] = useState<"active" | "suspended" | "inactive">("active");
  const [isSaving, setIsSaving] = useState(false);

  // 1. Fetch Brand & Vendors
  const { data: brand } = useQuery({
    queryKey: ["boutq-main-brand"],
    queryFn: async () => {
      const { data } = await supabase
        .from("brands")
        .select("*")
        .eq("slug", "boutq")
        .maybeSingle();
      return data;
    },
  });

  const { data: vendors = [], refetch } = useQuery({
    queryKey: ["incubator-vendors-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) console.error("Vendors fetch error:", error);
      return (data as VendorRecord[]) ?? [];
    },
  });

  // Open Form for New Vendor
  const handleOpenNew = () => {
    setEditingVendor(null);
    setVendorCode(`VEND-${Math.floor(100 + Math.random() * 900)}`);
    setNameEn("");
    setNameAr("");
    setCommissionPercent("10.0");
    setStatus("active");
    setIsDialogOpen(true);
  };

  // Open Form to Edit Vendor
  const handleOpenEdit = (v: VendorRecord) => {
    setEditingVendor(v);
    setVendorCode(v.vendor_code);
    setNameEn(v.name_en);
    setNameAr(v.name_ar);
    setCommissionPercent((v.default_commission_bps / 100).toString());
    setStatus(v.status);
    setIsDialogOpen(true);
  };

  // Submit Handler
  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameEn || !nameAr) {
      alert("Please fill in both English and Arabic vendor names");
      return;
    }

    setIsSaving(true);
    const bps = Math.round(parseFloat(commissionPercent || "10") * 100);

    try {
      if (editingVendor) {
        // Update
        const { error } = await supabase
          .from("vendors")
          .update({
            vendor_code: vendorCode,
            name_en: nameEn,
            name_ar: nameAr,
            default_commission_bps: bps,
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingVendor.id);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from("vendors").insert({
          brand_id: brand?.id || "00000000-0000-0000-0000-000000000001",
          vendor_code: vendorCode,
          name_en: nameEn,
          name_ar: nameAr,
          default_commission_bps: bps,
          status: status,
        });

        if (error) throw error;
      }

      setIsDialogOpen(false);
      refetch();
    } catch (err: any) {
      alert(`Failed to save vendor: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Vendor
  const handleDeleteVendor = async (id: string) => {
    if (!confirm("Are you sure you want to remove this incubator vendor?")) return;
    try {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
      refetch();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-bold shadow-lg">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-white">إدارة البائعين والعلامات التجارية (Incubator Vendors)</h1>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                Phase 1 Schema
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              إضافة وإدارة علامات المشاريع الحاضنة، ضبط كود البائع ونسبة عمولة المبيعات
            </p>
          </div>
        </div>

        <Button
          onClick={handleOpenNew}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة بائع / متجر جديد</span>
        </Button>
      </div>

      {/* Vendors Table Card */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            <span>قائمة البائعين المسجلين بالحاضنة ({vendors.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {vendors.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm space-y-3">
              <Store className="w-12 h-12 mx-auto text-slate-700 animate-pulse" />
              <p>لا يوجد بائعون مسجلون بالحاضنة حالياً</p>
              <Button size="sm" onClick={handleOpenNew} className="bg-amber-500 text-slate-950 font-semibold text-xs">
                إضافة أول بائع الآن
              </Button>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                <tr>
                  <th className="p-3">كود البائع (Code)</th>
                  <th className="p-3">اسم المتجر (EN)</th>
                  <th className="p-3">اسم المتجر (AR)</th>
                  <th className="p-3">نسبة العمولة (Commission)</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-bold text-amber-400">{v.vendor_code}</td>
                    <td className="p-3 font-semibold text-slate-100">{v.name_en}</td>
                    <td className="p-3 text-slate-200">{v.name_ar}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">
                      {(v.default_commission_bps / 100).toFixed(1)}%
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-mono ${
                          v.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                        }`}
                      >
                        {v.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                          onClick={() => handleOpenEdit(v)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                          onClick={() => handleDeleteVendor(v.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-amber-400" />
              <span>{editingVendor ? "تعديل بيانات البائع" : "إضافة بائع جديد للحاضنة"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveVendor} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-slate-300">كود البائع (Vendor Code)</Label>
              <Input
                value={vendorCode}
                onChange={(e) => setVendorCode(e.target.value)}
                placeholder="e.g. VEND-001"
                className="bg-slate-950 border-slate-800 text-amber-400 font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">اسم المتجر بالإنجليزية (English Name)</Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Royal Oud Luxury"
                className="bg-slate-950 border-slate-800 text-slate-100"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">اسم المتجر بالعربية (Arabic Name)</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثال: متجر العود الملكي"
                className="bg-slate-950 border-slate-800 text-slate-100"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">نسبة العمولة (Commission %)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  placeholder="10.0"
                  className="bg-slate-950 border-slate-800 text-emerald-400 font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">الحالة (Status)</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-9 bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-md px-3 outline-none"
                >
                  <option value="active">Active (نشط)</option>
                  <option value="suspended">Suspended (موقف)</option>
                  <option value="inactive">Inactive (غير نشط)</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                {isSaving ? "جاري الحفظ..." : editingVendor ? "تحديث البيانات" : "إضافة البائع"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
