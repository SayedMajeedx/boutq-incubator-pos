import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Fingerprint,
  Languages,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Lock,
  TrendingUp,
} from "lucide-react";
import { applyRememberMe } from "@/lib/session-persistence";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  // Auto-redirect if user already has an active authenticated session
  useEffect(() => {
    setPasskeySupported(
      window.isSecureContext && typeof window.PublicKeyCredential !== "undefined",
    );

    let isSubscribed = true;

    async function checkExistingSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isSubscribed) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, brand_id")
          .eq("id", session.user.id)
          .maybeSingle();

        let slug = "boutq";
        if (profile?.brand_id) {
          const { data: brand } = await supabase
            .from("brands")
            .select("slug")
            .eq("id", profile.brand_id)
            .maybeSingle();
          if (brand?.slug) slug = brand.slug;
        }

        navigate({ to: "/admin/b/$slug/pos", params: { slug } });
      }
    }

    checkExistingSession();
    return () => {
      isSubscribed = false;
    };
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = authData.user;
      if (!user) throw new Error("Authentication failed to return user.");

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status, brand_id")
        .eq("id", user.id)
        .maybeSingle();

      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
        await supabase.auth.signOut();
        throw new Error(
          lang === "ar"
            ? "هذا حساب غير مخول لدخول لوحة كاشير POS."
            : "This account is not authorized for POS access.",
        );
      }

      applyRememberMe(remember);

      // Resolve target brand slug
      let slug = "boutq";
      if (profile.brand_id) {
        const { data: brand } = await supabase
          .from("brands")
          .select("slug")
          .eq("id", profile.brand_id)
          .maybeSingle();
        if (brand?.slug) slug = brand.slug;
      }

      toast.success(lang === "ar" ? "تم تسجيل الدخول بنجاح" : "Sign in successful!");
      await new Promise((r) => setTimeout(r, 150));

      // Direct navigation to POS
      navigate({ to: "/admin/b/$slug/pos", params: { slug } });
    } catch (err: any) {
      toast.error(translateAuthError(err, lang as any));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.user) throw new Error("Passkey sign-in did not return a user.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, status, brand_id")
        .eq("id", data.user.id)
        .maybeSingle();

      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (
        profileError ||
        !profile ||
        profile.status !== "active" ||
        !dashboardRoles.has(profile.role ?? "")
      ) {
        await supabase.auth.signOut();
        throw new Error(
          lang === "ar"
            ? "هذا الحساب غير مخوّل لدخول لوحة التحكم."
            : "This account is not authorized for dashboard access.",
        );
      }

      applyRememberMe(true);

      let slug = "boutq";
      if (profile.brand_id) {
        const { data: brand } = await supabase
          .from("brands")
          .select("slug")
          .eq("id", profile.brand_id)
          .maybeSingle();
        if (brand?.slug) slug = brand.slug;
      }

      await navigate({ to: "/admin/b/$slug/pos", params: { slug } });
    } catch (err: any) {
      const cancelled =
        err?.name === "NotAllowedError" || /cancel|not allowed/i.test(err?.message ?? "");
      toast.error(
        cancelled
          ? lang === "ar"
            ? "تم إلغاء تسجيل الدخول بالبصمة."
            : "Biometric sign-in was cancelled."
          : translateAuthError(err, lang as any),
      );
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="min-h-screen w-full flex flex-col items-center justify-center relative bg-zinc-950 text-white px-4 py-8 overflow-hidden select-none"
    >
      {/* Dynamic Tech-Boutique Moving Luxury Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(183,110,121,0.22),transparent_60%)] z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(9,9,11,0.95))] z-0" />
      <div className="absolute top-[20%] right-[-5%] w-80 h-80 rounded-full bg-rose-500/10 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-[20%] left-[-5%] w-96 h-96 rounded-full bg-[#B76E79]/15 blur-3xl pointer-events-none" />

      {/* Subtle Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none z-0" />

      {/* Top Header Controls Bar */}
      <div className="w-full max-w-md flex justify-end mb-6 relative z-10">
        <div className="flex items-center gap-2 h-9 px-3.5 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-xs">
          <Languages className="h-4 w-4 text-[#e0a2ab]" />
          <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
            <SelectTrigger className="h-7 border-0 bg-transparent text-xs font-bold text-zinc-200 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 backdrop-blur-xl border-zinc-800 text-zinc-200">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Center Auth Card Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Branding Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#B76E79]/20 backdrop-blur-md border border-[#B76E79]/40 text-[#e0a2ab] font-mono text-xs font-bold uppercase tracking-widest shadow-xs">
            <Sparkles
              className="h-3.5 w-3.5 text-[#e0a2ab] animate-spin"
              style={{ animationDuration: "6s" }}
            />
            <span>BOUTQ INCUBATOR POS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-heading tracking-tight text-white drop-shadow-md">
            {t("app.title")}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-300 font-medium">
            {lang === "ar" ? "تسجيل دخول كاشير وإدارة الحاضنة" : "Cashier POS Login Portal"}
          </p>
        </div>

        {/* Semi-Glossy Tech-Boutique Glass Card */}
        <div className="backdrop-blur-xl bg-zinc-900/85 border border-zinc-800/80 shadow-2xl rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          {/* Top Sheen Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

          <div className="mb-6 space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold font-heading text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#B76E79] shrink-0" />
              <span>{t("auth.welcomeBack")}</span>
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2 bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-800">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-[#B76E79]" />
              <span>
                {lang === "ar"
                  ? "تسجيل دخول كاشير وموظفي نقطة البيع للحاضنة."
                  : "Cashier POS station sign in for Boutq Incubator."}
              </span>
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold text-zinc-200">
                {t("auth.email")}
              </Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="admin@boutq.com or cashier@boutq.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-zinc-950/80 border-zinc-800 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/30 text-white placeholder:text-zinc-500 rounded-xl transition-all font-medium text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-bold text-zinc-200">
                {t("auth.password")}
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 bg-zinc-950/80 border-zinc-800 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/30 text-white placeholder:text-zinc-500 rounded-xl transition-all font-medium text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer select-none">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  className="border-zinc-700 data-[state=checked]:bg-[#B76E79] data-[state=checked]:border-[#B76E79] data-[state=checked]:text-white"
                />
                <span>{t("auth.rememberMe")}</span>
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 font-bold text-white bg-gradient-to-r from-[#8c2028] via-[#a82a32] to-[#B76E79] hover:from-[#9c252e] hover:to-[#c87a84] shadow-lg shadow-rose-950/50 active:scale-[0.99] rounded-xl transition-all duration-200 mt-2 border border-[#B76E79]/30"
            >
              {loading ? (
                t("common.pleaseWait")
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>{t("auth.signIn")}</span>
                  <ArrowRight className={`h-4 w-4 ${lang === "ar" ? "rotate-180" : ""}`} />
                </span>
              )}
            </Button>
          </form>

          {passkeySupported && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                <span className="h-px flex-1 bg-zinc-800" />
                <span>{lang === "ar" ? "أو باستخدام" : "or biometric"}</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2.5 border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800/80 text-zinc-200 font-semibold rounded-xl backdrop-blur-md shadow-xs transition-all active:scale-[0.99]"
                disabled={passkeyLoading || loading}
                onClick={() => void signInWithPasskey()}
              >
                <Fingerprint className="h-5 w-5 text-[#B76E79]" />
                <span>
                  {passkeyLoading
                    ? t("common.pleaseWait")
                    : lang === "ar"
                      ? "تسجيل الدخول بالبصمة"
                      : "Sign in with Biometric"}
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
