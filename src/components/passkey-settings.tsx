import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

type Passkey = {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
};

export function PasskeySettings() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.passkey.list();
    if (error) toast.error(error.message);
    else setPasskeys((data ?? []) as Passkey[]);
    setLoading(false);
  };

  useEffect(() => {
    const available = window.isSecureContext && typeof window.PublicKeyCredential !== "undefined";
    setSupported(available);
    if (available) void load();
    else setLoading(false);
  }, []);

  const register = async () => {
    setRegistering(true);
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      toast.success(isAr ? "تم تسجيل البصمة بنجاح" : "Biometric login registered successfully");
      await load();
    } catch (error: any) {
      const cancelled =
        error?.name === "NotAllowedError" || /cancel|not allowed/i.test(error?.message ?? "");
      toast.error(
        cancelled
          ? isAr
            ? "تم إلغاء تسجيل البصمة."
            : "Passkey registration was cancelled."
          : (error?.message ?? "Could not register passkey"),
      );
    } finally {
      setRegistering(false);
    }
  };

  const remove = async (passkeyId: string) => {
    setDeletingId(passkeyId);
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    if (error) toast.error(error.message);
    else {
      setPasskeys((current) => current.filter((item) => item.id !== passkeyId));
      toast.success(isAr ? "تم حذف مفتاح الدخول" : "Passkey removed");
    }
    setDeletingId(null);
  };

  if (supported === false)
    return (
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {isAr ? "البصمة غير مدعومة" : "Biometric login unavailable"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr
                ? "استخدم متصفحاً حديثاً واتصال HTTPS، أو تابع باستخدام كلمة المرور."
                : "Use a modern browser over HTTPS, or continue with your password."}
            </p>
          </div>
        </div>
      </Card>
    );

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Fingerprint className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl">
                {isAr ? "تسجيل الدخول بالبصمة" : "Biometric & Passkey Login"}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {isAr
                  ? "سجّل Face ID أو Touch ID أو قفل جهازك للدخول الآمن بدون كلمة مرور."
                  : "Register Face ID, Touch ID, your device lock, or a security key for secure passwordless access."}
              </p>
            </div>
          </div>
          <Button
            className="shrink-0 gap-2 shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
            onClick={() => void register()}
            disabled={registering || loading}
          >
            {registering ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            {isAr ? "تسجيل دخول بيومتري" : "Register Biometric Login"}
          </Button>
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {isAr
              ? "بيانات بصمتك لا تغادر جهازك. يتم حفظ المفتاح العام فقط لدى Supabase."
              : "Your biometric data never leaves your device. Only the public passkey is stored and verified by Supabase."}
          </span>
        </div>
      </Card>
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
        <div className="border-b border-border/60 p-4">
          <h3 className="font-medium">
            {isAr ? "أجهزة الدخول المسجّلة" : "Registered sign-in devices"}
          </h3>
        </div>
        {loading ? (
          <div className="flex justify-center p-8">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {isAr ? "لم يتم تسجيل أي مفتاح دخول بعد." : "No passkeys registered yet."}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <KeyRound className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {passkey.friendly_name || (isAr ? "مفتاح دخول" : "Passkey")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? "أضيف في" : "Added"}{" "}
                      {new Date(passkey.created_at).toLocaleDateString(
                        isAr ? "ar-BH-u-nu-latn" : "en-US",
                      )}
                      {passkey.last_used_at
                        ? ` · ${isAr ? "آخر استخدام" : "Last used"} ${new Date(passkey.last_used_at).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-US")}`
                        : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive transition-all hover:bg-destructive/10"
                  disabled={deletingId === passkey.id}
                  onClick={() => void remove(passkey.id)}
                  aria-label={isAr ? "حذف مفتاح الدخول" : "Remove passkey"}
                >
                  {deletingId === passkey.id ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
