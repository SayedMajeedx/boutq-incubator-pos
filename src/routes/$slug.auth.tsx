import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Loader2, LogIn, MailCheck, User, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/$slug/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: StorefrontAuth,
});

function StorefrontAuth() {
  const { brand, settings, t, lang, session, isStoreMember, membershipLoading, refreshMembership } =
    useStorefront();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  const performRedirect = () => {
    if (redirect && !redirect.includes("/auth")) {
      void navigate({ to: redirect as any });
    } else {
      navigate({ to: "/$slug", params: { slug: brand.slug } });
    }
  };

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [working, setWorking] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<string | null>(null);

  useEffect(() => {
    // Remove credentials left by the retired client-only pseudo-passkey flow.
    localStorage.removeItem(`passkey_token_${brand.slug}`);
    localStorage.removeItem(`passkey_registered_${brand.slug}`);
  }, [brand.slug]);

  const signInWithGoogle = async () => {
    setWorking(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL(
          `/${encodeURIComponent(brand.slug)}/auth-confirmed`,
          window.location.origin,
        ).toString(),
      },
    });
    if (error) {
      setWorking(false);
      toast.error(translateAuthError(error, lang));
    }
  };

  useEffect(() => {
    if (membershipLoading || !session) return;
    if (isStoreMember) {
      if (redirect && !redirect.includes("/auth")) {
        void navigate({ to: redirect as any, replace: true });
      } else {
        navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
      }
    } else {
      setTab("signup");
      setForm((current) => ({ ...current, email: session.user.email ?? current.email }));
    }
  }, [brand.slug, isStoreMember, membershipLoading, navigate, session, redirect]);

  const activateMembership = async (): Promise<boolean> => {
    const { error } = await supabase.rpc("activate_storefront_membership", {
      p_brand_slug: brand.slug,
      p_name: form.name.trim() || undefined,
      p_phone: form.phone.trim() || undefined,
    });
    if (error) {
      console.error("Membership activation failed", error);
      toast.error(
        t(
          "تعذر إنشاء حسابك في هذا المتجر. حاول مرة أخرى.",
          "Could not create your account for this store. Please try again.",
        ),
      );
      return false;
    }
    await refreshMembership();
    return true;
  };

  const signIn = async () => {
    if (!form.email || !form.password)
      return toast.error(t("البريد وكلمة المرور مطلوبان", "Email and password are required"));
    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (error) {
      setWorking(false);
      return toast.error(translateAuthError(error, lang));
    }

    const { data: member, error: membershipError } = await supabase.rpc(
      "has_storefront_membership",
      { p_brand_slug: brand.slug },
    );
    if (membershipError || member !== true) {
      await supabase.auth.signOut();
      setWorking(false);
      setTab("signup");
      toast.error(
        t(
          "لا يوجد حساب بهذا البريد في هذا المتجر. اختر «إنشاء حساب» للتسجيل لدى هذا المتجر.",
          "This email is not registered with this store. Choose Create account to register here.",
        ),
        { duration: 7000 },
      );
      return;
    }
    await refreshMembership();
    setWorking(false);
    toast.success(t("مرحباً بعودتك!", "Welcome back!"));
    performRedirect();
  };

  const signUp = async () => {
    if (!form.email || (!session && !form.password))
      return toast.error(t("البريد وكلمة المرور مطلوبان", "Email and password are required"));
    setWorking(true);

    // An existing authenticated identity must still explicitly choose Create account.
    if (session?.user) {
      const activated = await activateMembership();
      setWorking(false);
      if (!activated) return;
      toast.success(t("تم إنشاء حسابك في هذا المتجر!", "Your account for this store is ready!"));
      performRedirect();
      return;
    }

    // Correct credentials for an existing platform identity allow that person
    // to explicitly register with this otherwise unrelated brand.
    const existingLogin = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (!existingLogin.error && existingLogin.data.session) {
      const activated = await activateMembership();
      setWorking(false);
      if (!activated) return;
      toast.success(t("تم إنشاء حسابك في هذا المتجر!", "Your account for this store is ready!"));
      performRedirect();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: {
          name: form.name.trim() || undefined,
          phone: form.phone.trim() || undefined,
          storefront_slug: brand.slug,
        },
        emailRedirectTo: new URL(
          `/${encodeURIComponent(brand.slug)}/auth-confirmed`,
          window.location.origin,
        ).toString(),
      },
    });
    if (error) {
      setWorking(false);
      return toast.error(translateAuthError(error, lang));
    }
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setWorking(false);
      toast.error(
        t(
          "هذا البريد لديه حساب Boutq بالفعل. أدخل كلمة المرور الحالية الصحيحة للتسجيل في هذا المتجر.",
          "This email already has a Boutq login. Enter its correct existing password to register with this store.",
        ),
        { duration: 8000 },
      );
      return;
    }
    if (!data.session) {
      setWorking(false);
      setPendingVerification(form.email.trim());
      toast.success(t("تحقق من بريدك لتأكيد الحساب.", "Check your email to verify your account."), {
        duration: 8000,
      });
      return;
    }
    const activated = await activateMembership();
    setWorking(false);
    if (!activated) return;
    toast.success(t("تم إنشاء الحساب!", "Account created!"));
    performRedirect();
  };

  if (session && membershipLoading)
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="min-h-[85vh] w-full flex flex-col items-center justify-center relative bg-zinc-950 text-white px-4 py-8 overflow-hidden selection:bg-[#B76E79] selection:text-white rounded-3xl my-4"
    >
      {/* Dynamic Tech-Boutique Moving Luxury Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(183,110,121,0.22),transparent_60%)] z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(9,9,11,0.95))] z-0" />
      <div className="absolute top-[20%] right-[-5%] w-80 h-80 rounded-full bg-rose-500/10 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-[20%] left-[-5%] w-96 h-96 rounded-full bg-[#B76E79]/15 blur-3xl pointer-events-none" />

      {/* Subtle Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none z-0" />

      {/* Floating Tech-Boutique Apparel Canvas Elements in Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden hidden lg:block opacity-35">
        <div className="absolute top-[18%] left-10 bg-zinc-900/90 border border-emerald-500/30 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <div className="text-xs font-semibold text-zinc-200">
            {lang === "ar" ? "عميل جديد • حجز فستان مخمل" : "New Customer • Velvet Dress Order"}
          </div>
          <span className="text-xs font-bold text-emerald-400">280.000 BHD</span>
        </div>

        <div className="absolute bottom-[18%] right-10 bg-zinc-900/85 border border-zinc-800/80 backdrop-blur-md p-4 rounded-2xl shadow-xl w-60">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-zinc-400 font-bold tracking-wider uppercase flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-[#B76E79]" />
              {lang === "ar" ? "أداء المتجر" : "STORE ANALYTICS"}
            </span>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 px-2 py-0.5 rounded-full">
              ACTIVE
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">100% PRIVATE</div>
        </div>
      </div>

      {/* Center Auth Card Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        <Card className="space-y-5 p-6 sm:p-8 backdrop-blur-xl bg-zinc-900/85 border border-zinc-800/80 shadow-2xl rounded-3xl relative overflow-hidden text-white">
          {/* Top Sheen */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

          <div className="text-center">
            <div
              className="mx-auto mb-3.5 grid h-14 w-14 place-items-center rounded-2xl shadow-sm border border-zinc-800 backdrop-blur-md transition-transform hover:scale-105"
              style={{
                backgroundColor: `${settings.primary_color}25`,
                color: "#e0a2ab",
              }}
            >
              <User className="h-7 w-7 text-[#e0a2ab]" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              {t("حسابك في", "Your account at")}{" "}
              <span className="text-[#e0a2ab]">
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-zinc-300 leading-relaxed font-medium">
              {t(
                "كل متجر مستقل، وسجلك وطلباتك خاصة بهذا المتجر فقط.",
                "Each store is independent; your profile and orders remain private to this store.",
              )}
            </p>
          </div>

          {pendingVerification && (
            <div
              className="flex items-start gap-3 rounded-2xl border bg-zinc-950/80 backdrop-blur-md p-4 text-zinc-200 shadow-xs border-zinc-800"
              role="status"
            >
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#e0a2ab]" />
              <div className="space-y-1 text-sm">
                <div className="font-bold text-[#e0a2ab]">
                  {t("تحقق من بريدك الإلكتروني", "Check your email")}
                </div>
                <p className="text-xs text-zinc-300">
                  {t("أرسلنا رابط التفعيل إلى", "We sent a verification link to")}{" "}
                  <b className="text-white">{pendingVerification}</b>.
                </p>
                <button
                  type="button"
                  className="text-xs font-bold text-[#e0a2ab] hover:text-white underline"
                  onClick={() => {
                    setPendingVerification(null);
                    setTab("signin");
                  }}
                >
                  {t("الذهاب لتسجيل الدخول", "Go to sign in")}
                </button>
              </div>
            </div>
          )}

          {/* Google Single-Sign-On Method */}
          <Button
            type="button"
            className="h-12 w-full gap-3 font-semibold text-zinc-200 border border-zinc-800 bg-zinc-950/80 backdrop-blur-md shadow-xs hover:bg-zinc-800/80 active:scale-[0.99] rounded-2xl transition-all duration-200"
            onClick={signInWithGoogle}
            disabled={working}
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            {t("متابعة باستخدام Google", "Continue with Google")}
          </Button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {t("أو سجّل ببريدك", "OR SIGN IN WITH EMAIL")}
            </span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
            <TabsList className="grid h-12 w-full grid-cols-2 p-1 bg-zinc-950/80 backdrop-blur-md rounded-2xl border border-zinc-800">
              <TabsTrigger
                className="h-10 text-xs font-bold text-zinc-400 rounded-xl transition-all data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-xs"
                value="signin"
              >
                {t("تسجيل الدخول", "Sign in")}
              </TabsTrigger>
              <TabsTrigger
                className="h-10 text-xs font-bold text-zinc-400 rounded-xl transition-all data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-xs"
                value="signup"
              >
                {t("إنشاء حساب", "Create account")}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="signin"
              className="mt-4 space-y-3.5 animate-in fade-in-40 duration-200"
            >
              <Field
                label={t("البريد الإلكتروني", "Email")}
                type="email"
                value={form.email}
                onChange={(email) => setForm({ ...form, email })}
              />
              <Field
                label={t("كلمة المرور", "Password")}
                type="password"
                value={form.password}
                onChange={(password) => setForm({ ...form, password })}
              />
              <Button
                className="h-12 w-full text-white font-bold hover:opacity-95 active:scale-98 rounded-2xl transition-all shadow-lg shadow-rose-950/50 mt-1 border border-[#B76E79]/30 bg-gradient-to-r from-[#8c2028] via-[#a82a32] to-[#B76E79]"
                onClick={signIn}
                disabled={working}
              >
                {working ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="me-2 h-4 w-4" />
                )}
                {t("تسجيل الدخول", "Sign in")}
              </Button>
            </TabsContent>
            <TabsContent
              value="signup"
              className="mt-4 space-y-3.5 animate-in fade-in-40 duration-200"
            >
              <Field
                label={t("الاسم الكامل", "Full name")}
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
              />
              <Field
                label={t("رقم الهاتف", "Phone")}
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
              <Field
                label={t("البريد الإلكتروني", "Email")}
                type="email"
                value={form.email}
                disabled={Boolean(session)}
                onChange={(email) => setForm({ ...form, email })}
              />
              {!session && (
                <Field
                  label={t("كلمة المرور", "Password")}
                  type="password"
                  value={form.password}
                  onChange={(password) => setForm({ ...form, password })}
                />
              )}
              <Button
                className="h-12 w-full text-white font-bold hover:opacity-95 active:scale-98 rounded-2xl transition-all shadow-lg shadow-rose-950/50 mt-1 border border-[#B76E79]/30 bg-gradient-to-r from-[#8c2028] via-[#a82a32] to-[#B76E79]"
                onClick={signUp}
                disabled={working}
              >
                {working && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("إنشاء حساب في هذا المتجر", "Create account for this store")}
              </Button>
            </TabsContent>
          </Tabs>
          <div className="text-center text-sm pt-1">
            <Link
              to="/$slug"
              params={{ slug: brand.slug }}
              className="inline-flex min-h-11 items-center text-xs font-bold text-[#e0a2ab] hover:text-white underline underline-offset-4 transition-colors"
            >
              {t("متابعة كضيف", "Continue as guest")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const autocomplete =
    type === "email" ? "email" : type === "password" ? "current-password" : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-bold text-zinc-200">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        autoComplete={autocomplete}
        className="h-11 bg-zinc-950/80 border-zinc-800 focus:border-[#B76E79] focus:ring-2 focus:ring-[#B76E79]/30 text-white placeholder:text-zinc-500 rounded-xl transition-all font-medium"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
