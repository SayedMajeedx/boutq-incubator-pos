import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error(t("auth.invalidEmail"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(t("auth.resetLinkSent"));
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
          <h2 className="text-2xl font-display mb-2">{t("auth.forgotTitle")}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t("auth.forgotSubtitle")}</p>
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("common.pleaseWait") : t("auth.sendResetLink")}
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
