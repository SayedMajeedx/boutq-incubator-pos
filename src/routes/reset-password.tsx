import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Recovery links deliver a PASSWORD_RECOVERY event via onAuthStateChange
    // once Supabase parses the URL fragment and establishes a session.
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setReady(true);
      }
    });

    // If the user reloads on this page and already has a session, allow it.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true);
    });

    // Guard: if nothing arrives shortly, treat the link as invalid.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setReady((r) => {
        if (!r) toast.error(t("auth.invalidRecoveryLink"));
        return r;
      });
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success(t("auth.passwordUpdated"));
      navigate({ to: "/auth" });
    } catch (err: any) {
      toast.error(err.message ?? t("auth.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display text-primary">{t("app.title")}</h1>
        </div>
        <Card className="p-8">
          <h2 className="text-2xl font-display mb-2">{t("auth.resetTitle")}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t("auth.resetSubtitle")}</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="password">{t("auth.newPassword")}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading ? t("common.pleaseWait") : t("auth.updatePassword")}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <Link to="/auth" className="text-sm text-primary hover:underline">
              {t("auth.backToSignIn")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
