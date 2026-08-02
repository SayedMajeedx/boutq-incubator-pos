import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SignatureCanvas } from "@/components/incubator/signature-canvas";
import {
  FileSignature,
  Building2,
  Calendar,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/vendor/sign")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: VendorSigningPage,
});

function VendorSign() {
  return <VendorSigningPage />;
}

function VendorSigningPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Fetch Contract by Token
  const { data: contractData, isLoading, error } = useQuery({
    queryKey: ["vendor-contract-by-token", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_contract_by_signing_token", {
        p_token: token,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Contract not found");
      return data;
    },
  });

  const contract = contractData?.contract;
  const vendor = contractData?.vendor;

  const handleSignAndCreateAccount = async () => {
    if (!token || !signatureDataUrl) {
      alert("يرجى رسم التوقيع الإلكتروني على الشاشة أولاً / Please draw signature first");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Sign Contract via RPC
      const { data: signResult, error: signErr } = await supabase.rpc(
        "sign_vendor_contract_by_token",
        {
          p_token: token,
          p_signature_data_url: signatureDataUrl,
        }
      );

      if (signErr) throw signErr;
      if (!signResult?.success) throw new Error(signResult?.error || "Signing failed");

      // 2. Provision / Create Auth user if email & password entered
      if (email && password) {
        const { data: authUser, error: authErr } = await supabase.auth.signUp({
          email,
          password,
        });

        if (!authErr && authUser.user) {
          // Link vendor_members
          await supabase.from("vendor_members").insert({
            vendor_id: vendor.id,
            user_id: authUser.user.id,
            role: "owner",
            status: "active",
          });
        }
      }

      alert("تم توثيق وتفعيل عقد الإيجار بنجاح! / Lease contract signed & activated!");
      navigate({ to: "/vendor/dashboard" });
    } catch (err: any) {
      alert(`Signing failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <Card className="bg-slate-900 border-slate-800 text-center p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-1">رابط التوقيع غير صالح</h2>
          <p className="text-xs text-slate-400">Missing or invalid signing token parameter.</p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="text-center space-y-3">
          <Building2 className="w-10 h-10 text-amber-400 animate-pulse mx-auto" />
          <p className="text-sm text-slate-400">جاري تحميل بيانات عقد الإيجار...</p>
        </div>
      </div>
    );
  }

  if (error || !contract || !vendor) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <Card className="bg-slate-900 border-slate-800 text-center p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-1">تعذر العثور على العقد</h2>
          <p className="text-xs text-slate-400">{error?.message || "Invalid contract token"}</p>
        </Card>
      </div>
    );
  }

  const isAlreadySigned = contract.status === "active" && !!contract.signature_png_url;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans select-none dir-rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Branding Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-xl mx-auto text-xl">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            توثيق عقد إيجار الرف الحاضن (Lease Contract E-Signature)
          </h1>
          <p className="text-xs text-slate-400">
            حاضنة بوتيك للتجزئة — توقيع العقد رسمياً وتنشيط حساب المستأجر
          </p>
        </div>

        {/* Lease Contract Details Card */}
        <Card className="bg-slate-900 border-slate-800 shadow-2xl overflow-hidden">
          <CardHeader className="bg-slate-950/80 p-6 border-b border-slate-800 flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-amber-400">
                  {vendor.name_ar || vendor.name_en}
                </span>
                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs">
                  {vendor.vendor_code}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">عقد اتفاقية استئجار رف وتصريف مبيعات</p>
            </div>

            <Badge
              className={`text-xs font-mono uppercase ${
                isAlreadySigned
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
              }`}
            >
              {isAlreadySigned ? "موقع ومفعل (ACTIVE)" : "بانتظار التوقيع (PENDING)"}
            </Badge>
          </CardHeader>

          <CardContent className="p-6 space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <div>
                <span className="text-slate-500 block">رقم الرف المخصص</span>
                <span className="font-mono font-bold text-white text-sm">{contract.rack_number || "Rack #01"}</span>
              </div>
              <div>
                <span className="text-slate-500 block">الإيجار الشهري المستحق</span>
                <span className="font-mono font-bold text-rose-400 text-sm">
                  {Number(contract.monthly_rent || 0).toFixed(3)} BHD
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">نسبة عمولة المبيعات</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {((contract.commission_bps || 1000) / 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">مدّة العقد</span>
                <span className="font-mono font-bold text-amber-400 text-xs">
                  {contract.start_date} إلى {contract.end_date}
                </span>
              </div>
            </div>

            {/* Terms Text */}
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/60 text-slate-300 leading-relaxed text-[11px] space-y-2">
              <p className="font-bold text-white">بنود الاتفاقية والشروط:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>يلتزم المستأجر بتوفير المنتجات والبارکودات الخاصة ببضاعته المعروضة في الرف المخصص.</li>
                <li>تقتطع الحاضنة نسبة العمولة المتفق عليها تلقائياً فور إتمام أي عملية بيع عبر نقطة البيع (POS).</li>
                <li>تقتطع رسوم الإيجار الشهري تلقائياً من رصيد مبيعات المستأجر المتراكم قبل ترحيل السحوبات.</li>
              </ul>
            </div>

            {/* Signature Canvas Box */}
            {!isAlreadySigned ? (
              <div className="space-y-4 pt-2">
                <SignatureCanvas
                  onSave={(dataUrl) => setSignatureDataUrl(dataUrl)}
                  isRtl={true}
                  isSubmitting={isSubmitting}
                />

                {/* Optional Account Credentials Box */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-slate-200 font-bold flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>إعداد حساب دخول بوابة المستأجر (Vendor Portal Access)</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-[11px]">البريد الإلكتروني</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vendor@example.com"
                        className="bg-slate-900 border-slate-800 text-white h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-[11px]">كلمة المرور الحساب</Label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="bg-slate-900 border-slate-800 text-white h-9"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSignAndCreateAccount}
                  disabled={!signatureDataUrl || isSubmitting}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl flex items-center justify-center gap-2"
                >
                  <FileSignature className="w-5 h-5" />
                  <span>
                    {isSubmitting ? "جاري توثيق العقد والتفعيل..." : "توقيع العقد وتفعيل حساب المستأجر رسمياً"}
                  </span>
                </Button>
              </div>
            ) : (
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">العقد موقع ومفعل رسمياً</h3>
                <p className="text-xs text-slate-400">
                  تم توثيق التوقيع الإلكتروني بتاريخ {new Date(contract.signed_at).toLocaleString()}
                </p>
                <Button
                  onClick={() => navigate({ to: "/vendor/dashboard" })}
                  className="bg-amber-500 text-slate-950 font-bold text-xs"
                >
                  الانتقال إلى بوابة المستأجر (Vendor Dashboard)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
