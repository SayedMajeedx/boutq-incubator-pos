import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
import { Fingerprint, Languages, ShieldCheck } from "lucide-react";
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

  useEffect(() => {
    setPasskeySupported(
      window.isSecureContext && typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user!.id)
        .maybeSingle();
      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
        await supabase.auth.signOut();
        throw new Error(
          lang === "ar"
            ? "هذا حساب عميل متجر وليس حساب لوحة تحكم."
            : "This is a storefront customer account, not a dashboard account.",
        );
      }
      applyRememberMe(remember);
      await new Promise((r) => setTimeout(r, 100));
      navigate({ to: "/admin" });
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
        .select("role, status")
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
      await navigate({ to: "/admin" });
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display text-primary">{t("app.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("app.portalSubtitle")}</p>
        </div>
        <Card className="p-8">
          <h2 className="text-2xl font-display mb-2">{t("auth.welcomeBack")}</h2>
          <p className="text-sm text-muted-foreground mb-6 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <span>
              {lang === "ar"
                ? "يقتصر الدخول على الشركاء المعتمدين ومندوبي التوصيل. يرجى استخدام بيانات الاعتماد الصادرة عن إدارة البوتيك."
                : "Access restricted to authorized partners and logistics couriers. Please use your credentials issued by the boutique administrator."}
            </span>
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                <span>{t("auth.rememberMe")}</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("common.pleaseWait") : t("auth.signIn")}
            </Button>
          </form>
          {passkeySupported && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>{lang === "ar" ? "أو" : "or"}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2 border-primary/30 bg-primary/5 font-medium hover:bg-primary/10"
                disabled={passkeyLoading || loading}
                onClick={() => void signInWithPasskey()}
              >
                <Fingerprint className="h-5 w-5 text-primary" />
                {passkeyLoading
                  ? t("common.pleaseWait")
                  : lang === "ar"
                    ? "تسجيل الدخول بالبصمة"
                    : "Sign in with Biometric"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "استخدم Face ID أو Touch ID أو مفتاح أمان مسجّل."
                  : "Use a registered Face ID, Touch ID, device PIN, or security key."}
              </p>
            </div>
          )}
        </Card>
        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            {t("auth.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
