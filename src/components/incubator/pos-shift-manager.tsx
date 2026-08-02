import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Clock, Play, CheckCircle2, Lock, DollarSign, Calculator, AlertCircle } from "lucide-react";

interface PosShiftManagerProps {
  brandId?: string;
  isRtl?: boolean;
}

export const PosShiftManager: React.FC<PosShiftManagerProps> = ({
  brandId = "00000000-0000-0000-0000-000000000001",
  isRtl = true,
}) => {
  const [isOpenShiftModal, setIsOpenShiftModal] = useState(false);
  const [isCloseShiftModal, setIsCloseShiftModal] = useState(false);

  // Open Shift Form
  const [openingFloat, setOpeningFloat] = useState("20.000");
  const [registerName, setRegisterName] = useState("Main Register 01");

  // Close Shift Form
  const [actualCash, setActualCash] = useState("0.000");
  const [shiftNotes, setShiftNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Fetch POS Registers
  const { data: registers = [] } = useQuery({
    queryKey: ["pos-registers", brandId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pos_registers")
        .select("*")
        .eq("brand_id", brandId);
      return data ?? [];
    },
  });

  const activeRegister = registers[0] || null;

  // 2. Fetch Current Active Shift
  const { data: activeShift, refetch: refetchActiveShift } = useQuery({
    queryKey: ["pos-active-shift", activeRegister?.id],
    enabled: !!activeRegister?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pos_shifts")
        .select("*")
        .eq("register_id", activeRegister!.id)
        .eq("status", "open")
        .maybeSingle();
      return data;
    },
  });

  // 3. Fetch Past Shifts
  const { data: shiftHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ["pos-shift-history", activeRegister?.id],
    enabled: !!activeRegister?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pos_shifts")
        .select("*")
        .eq("register_id", activeRegister!.id)
        .order("opened_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // Open Shift Action
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Ensure register exists
      let regId = activeRegister?.id;
      if (!regId) {
        const { data: newReg, error: regErr } = await supabase
          .from("pos_registers")
          .insert({
            brand_id: brandId,
            name: registerName,
            status: "active",
          })
          .select()
          .single();
        if (regErr) throw regErr;
        regId = newReg.id;
      }

      // 2. Insert Open Shift
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("pos_shifts").insert({
        register_id: regId,
        opening_cash_float: parseFloat(openingFloat || "20.000"),
        status: "open",
        opened_by: user?.user?.id || null,
        opened_at: new Date().toISOString(),
      });

      if (error) throw error;

      alert(isRtl ? "تم فتح وردية الكاشير بنجاح!" : "POS Shift opened successfully!");
      setIsOpenShiftModal(false);
      refetchActiveShift();
      refetchHistory();
    } catch (err: any) {
      alert(`Open Shift failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close Shift Action
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    setIsSubmitting(true);
    try {
      const actualVal = parseFloat(actualCash || "0.000");
      const expectedVal = Number(activeShift.opening_cash_float || 0); // Simplified baseline expected
      const variance = actualVal - expectedVal;

      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pos_shifts")
        .update({
          status: "closed",
          actual_cash: actualVal,
          expected_cash: expectedVal,
          cash_variance: variance,
          closed_by: user?.user?.id || null,
          closed_at: new Date().toISOString(),
          notes: shiftNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeShift.id);

      if (error) throw error;

      alert(
        isRtl
          ? `تم إغلاق الوردية والمطابقة بنجاح!\n- الفارق النقدي: ${variance.toFixed(3)} BHD`
          : `Shift closed & reconciled!\n- Cash Variance: ${variance.toFixed(3)} BHD`
      );

      setIsCloseShiftModal(false);
      refetchActiveShift();
      refetchHistory();
    } catch (err: any) {
      alert(`Close Shift failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Active Shift Card */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="px-6 py-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{isRtl ? "حالة وردية الكاشير الحالية (Active Shift)" : "Current POS Register Shift"}</span>
          </CardTitle>

          {activeShift ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{isRtl ? "الوردية مفتوحة" : "Shift OPEN"}</span>
            </Badge>
          ) : (
            <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs">
              {isRtl ? "الوردية مغلقة" : "Shift CLOSED"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-6">
          {activeShift ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs">
                <p className="text-slate-400">
                  {isRtl ? "تاريخ ووقت الفتح:" : "Opened At:"}{" "}
                  <span className="text-white font-mono font-semibold">
                    {new Date(activeShift.opened_at).toLocaleString()}
                  </span>
                </p>
                <p className="text-slate-400">
                  {isRtl ? "العهدة النقدية الأولية (Float):" : "Opening Cash Float:"}{" "}
                  <span className="text-amber-400 font-mono font-bold text-sm">
                    {Number(activeShift.opening_cash_float || 0).toFixed(3)} BHD
                  </span>
                </p>
              </div>

              <Button
                onClick={() => {
                  setActualCash((activeShift.opening_cash_float || 20).toString());
                  setIsCloseShiftModal(true);
                }}
                className="bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center gap-2 shadow-md"
              >
                <Lock className="w-4 h-4" />
                <span>{isRtl ? "إغلاق الوردية والمطابقة النقدية" : "Reconcile & Close Shift"}</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
              <p className="text-xs text-slate-400">
                {isRtl
                  ? "لا توجد وردية مفتوحة حالياً. يرجى إدخال عهدة صندوق الصرف وافتتاح الوردية للبدء بعمليات البيع."
                  : "No open register shift. Enter cash float to open a shift for cashier sales."}
              </p>
              <Button
                onClick={() => setIsOpenShiftModal(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                <span>{isRtl ? "افتتاح وردية جديدة" : "Open New Shift"}</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shift History Table */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="px-6 py-4 border-b border-slate-800">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-400" />
            <span>{isRtl ? "سجل الورديات السابقة والمطابقات النقدية" : "POS Shift History & Reconciliations"}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {shiftHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {isRtl ? "لا توجد ورديات مسجلة سابقاً" : "No shift records found"}
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                <tr>
                  <th className="p-3">{isRtl ? "تاريخ الفتح" : "Opened At"}</th>
                  <th className="p-3">{isRtl ? "تاريخ الإغلاق" : "Closed At"}</th>
                  <th className="p-3">{isRtl ? "عهدة البدء" : "Float (BHD)"}</th>
                  <th className="p-3">{isRtl ? "النقدي الفعلي" : "Actual Cash"}</th>
                  <th className="p-3">{isRtl ? "الفارق النقدي" : "Variance"}</th>
                  <th className="p-3 text-right">{isRtl ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {shiftHistory.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-300">
                      {new Date(s.opened_at).toLocaleString()}
                    </td>
                    <td className="p-3 font-mono text-slate-400">
                      {s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-3 font-mono font-bold text-amber-400">
                      {Number(s.opening_cash_float || 0).toFixed(3)}
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-400">
                      {s.actual_cash != null ? Number(s.actual_cash).toFixed(3) : "—"}
                    </td>
                    <td
                      className={`p-3 font-mono font-bold ${
                        Number(s.cash_variance || 0) < 0
                          ? "text-rose-400"
                          : Number(s.cash_variance || 0) > 0
                          ? "text-emerald-400"
                          : "text-slate-400"
                      }`}
                    >
                      {s.cash_variance != null ? Number(s.cash_variance).toFixed(3) : "0.000"}
                    </td>
                    <td className="p-3 text-right">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-mono ${
                          s.status === "open"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Modal: Open Shift */}
      <Dialog open={isOpenShiftModal} onOpenChange={setIsOpenShiftModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Play className="w-5 h-5 text-emerald-400" />
              <span>{isRtl ? "افتتاح وردية جديدة للكاشير" : "Open New Register Shift"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleOpenShift} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-slate-300">{isRtl ? "اسم جهاز الكاشير" : "Register Name"}</Label>
              <Input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-slate-100"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">
                {isRtl ? "العهدة النقدية الأولية بالصندوق (BHD Float)" : "Opening Cash Float (BHD)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                className="bg-slate-950 border-slate-800 text-amber-400 font-mono font-bold text-sm"
                required
              />
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpenShiftModal(false)}
                className="border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                {isSubmitting ? "جاري الافتتاح..." : isRtl ? "تأكيد وافتتاح الوردية" : "Confirm Open Shift"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Close Shift */}
      <Dialog open={isCloseShiftModal} onOpenChange={setIsCloseShiftModal}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-rose-400" />
              <span>{isRtl ? "إغلاق الوردية والمطابقة النقدية" : "Close & Reconcile POS Shift"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCloseShift} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-slate-300">
                {isRtl ? "المبلغ النقدي المجرود بالصندوق (Actual Cash Count BHD)" : "Actual Cash Counted (BHD)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="bg-slate-950 border-slate-800 text-emerald-400 font-mono font-bold text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">{isRtl ? "ملاحظات الإغلاق" : "Shift Notes"}</Label>
              <Input
                value={shiftNotes}
                onChange={(e) => setShiftNotes(e.target.value)}
                placeholder="e.g. Reconciled clean, no variance"
                className="bg-slate-950 border-slate-800 text-slate-100"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCloseShiftModal(false)}
                className="border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs"
              >
                {isSubmitting ? "جاري الإغلاق..." : isRtl ? "تأكيد وإغلاق الوردية" : "Confirm Close Shift"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
