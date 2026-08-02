import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Loader2, LogIn, MailCheck, User } from "lucide-react";
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
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <Card className="space-y-5 p-6">
        <div className="text-center">
          <div
            className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full"
            style={{
              backgroundColor: `${settings.primary_color}15`,
              color: settings.primary_color,
            }}
          >
            <User className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl">
            {t("حسابك في", "Your account at")}{" "}
            {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "كل متجر مستقل، وسجلك وطلباتك خاصة بهذا المتجر فقط.",
              "Each store is independent; your profile and orders remain private to this store.",
            )}
          </p>
        </div>

        {pendingVerification && (
          <div
            className="flex items-start gap-3 rounded-lg border-2 bg-white p-4 text-slate-900"
            style={{ borderColor: settings.primary_color }}
            role="status"
          >
            <MailCheck
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: settings.primary_color }}
            />
            <div className="space-y-1 text-sm">
              <div className="font-semibold" style={{ color: settings.primary_color }}>
                {t("تحقق من بريدك الإلكتروني", "Check your email")}
              </div>
              <p>
                {t("أرسلنا رابط التفعيل إلى", "We sent a verification link to")}{" "}
                <b>{pendingVerification}</b>.
              </p>
              <button
                type="button"
                className="text-xs font-medium underline"
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
          className="h-11 w-full gap-3 font-semibold text-slate-700 border border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99] rounded-xl transition-all duration-200"
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
          <div className="flex-grow border-t border-slate-100"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-muted-foreground/80">
            {t("أو سجّل ببريدك", "OR SIGN IN WITH EMAIL")}
          </span>
          <div className="flex-grow border-t border-slate-100"></div>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
          <TabsList className="grid h-11 w-full grid-cols-2 bg-slate-50">
            <TabsTrigger className="h-9" value="signin">
              {t("تسجيل الدخول", "Sign in")}
            </TabsTrigger>
            <TabsTrigger className="h-9" value="signup">
              {t("إنشاء حساب", "Create account")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-4 space-y-3 animate-in fade-in-40 duration-200">
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
              className="h-11 w-full text-white font-medium hover:opacity-95 active:scale-98 transition-all"
              style={{ backgroundColor: settings.primary_color }}
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
          <TabsContent value="signup" className="mt-4 space-y-3 animate-in fade-in-40 duration-200">
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
              className="h-11 w-full text-white font-medium hover:opacity-95 active:scale-98 transition-all"
              style={{ backgroundColor: settings.primary_color }}
              onClick={signUp}
              disabled={working}
            >
              {working && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("إنشاء حساب في هذا المتجر", "Create account for this store")}
            </Button>
          </TabsContent>
        </Tabs>
        <div className="text-center text-sm">
          <Link
            to="/$slug"
            params={{ slug: brand.slug }}
            className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4"
          >
            {t("متابعة كضيف", "Continue as guest")}
          </Link>
        </div>
      </Card>
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
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        autoComplete={autocomplete}
        className="h-11"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
