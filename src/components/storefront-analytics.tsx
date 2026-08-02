import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useStorefront } from "@/lib/storefront-context";
import { setStorefrontAnalyticsConfig, trackStorefrontEvent } from "@/lib/storefront-analytics";

type Choice = { decided: boolean; analytics: boolean; marketing: boolean };
const empty: Choice = { decided: false, analytics: false, marketing: false };

export function StorefrontAnalytics() {
  const { brand, settings, lang, t } = useStorefront();
  const location = useLocation();
  const storageKey = `boutq-consent:${brand.id}`;
  const [choice, setChoice] = useState<Choice>(empty);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Choice;
        setChoice(parsed);
        if (!parsed.decided) setVisible(true);
      } else {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, [storageKey]);
  const [customizing, setCustomizing] = useState(false);
  const effective = useMemo(
    () =>
      settings.analytics_consent_required
        ? choice
        : {
            decided: true,
            analytics: settings.google_analytics_enabled,
            marketing: settings.meta_pixel_enabled,
          },
    [choice, settings],
  );

  useEffect(() => {
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.gtag =
      w.gtag ||
      function () {
        w.dataLayer.push(arguments);
      };
    w.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }, [brand.id]);

  useEffect(() => {
    const open = () => setVisible(true);
    window.addEventListener("boutq:privacy-preferences", open);
    return () => window.removeEventListener("boutq:privacy-preferences", open);
  }, []);

  useEffect(() => {
    const gaId =
      settings.google_analytics_enabled && /^G-[A-Z0-9]+$/.test(settings.google_analytics_id || "")
        ? settings.google_analytics_id
        : null;
    const metaId =
      settings.meta_pixel_enabled && /^\d{5,30}$/.test(settings.meta_pixel_id || "")
        ? settings.meta_pixel_id
        : null;
    const w = window as any;

    const loadScripts = () => {
      if (gaId) {
        if (!document.getElementById("boutq-ga4")) {
          const script = document.createElement("script");
          script.id = "boutq-ga4";
          script.async = true;
          script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
          document.head.appendChild(script);
        }
        w.gtag("js", new Date());
        w.gtag("config", gaId, { send_page_view: false });
        w.gtag("consent", "update", {
          analytics_storage: effective.analytics ? "granted" : "denied",
        });
      } else {
        w.gtag("consent", "update", { analytics_storage: "denied" });
      }
      if (effective.marketing && metaId) {
        if (!w.fbq) {
          const fbq: any = function () {
            fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
          };
          fbq.queue = [];
          fbq.loaded = true;
          fbq.version = "2.0";
          w.fbq = fbq;
        }
        if (!document.getElementById("boutq-meta-pixel")) {
          const script = document.createElement("script");
          script.id = "boutq-meta-pixel";
          script.async = true;
          script.src = "https://connect.facebook.net/en_US/fbevents.js";
          document.head.appendChild(script);
        }
        w.fbq("init", metaId);
      }
      setStorefrontAnalyticsConfig({
        brandId: brand.id,
        gaId,
        metaId,
        analyticsAllowed: Boolean(effective.analytics),
        marketingAllowed: Boolean(effective.marketing),
      });
    };

    // Defer 3rd-party analytics until user interaction or 5s fallback to protect LCP & TBT
    let loaded = false;

    const trigger = () => {
      if (loaded) return;
      loaded = true;
      cleanup();
      loadScripts();
    };

    const timer = setTimeout(trigger, 5000);

    const cleanup = () => {
      window.removeEventListener("scroll", trigger);
      window.removeEventListener("pointermove", trigger);
      window.removeEventListener("touchstart", trigger);
      window.removeEventListener("click", trigger);
      clearTimeout(timer);
    };

    window.addEventListener("scroll", trigger, { passive: true, once: true });
    window.addEventListener("pointermove", trigger, { passive: true, once: true });
    window.addEventListener("touchstart", trigger, { passive: true, once: true });
    window.addEventListener("click", trigger, { passive: true, once: true });

    return () => {
      cleanup();
      setStorefrontAnalyticsConfig(null);
    };
  }, [
    brand.id,
    effective.analytics,
    effective.marketing,
    settings.google_analytics_enabled,
    settings.google_analytics_id,
    settings.meta_pixel_enabled,
    settings.meta_pixel_id,
  ]);

  useEffect(() => {
    if (effective.decided)
      trackStorefrontEvent(
        "page_view",
        { page_location: window.location.href, page_title: document.title },
        `${location.pathname}${location.searchStr}`,
      );
  }, [effective.decided, location.pathname, location.searchStr]);

  const save = (next: Choice) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
    setChoice(next);
    setCustomizing(false);
    setVisible(false);
  };
  if (!settings.analytics_consent_required || !visible) return null;
  return (
    <Card
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl p-4 shadow-2xl"
    >
      <h2 className="font-semibold">{t("خيارات الخصوصية", "Privacy choices")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "نستخدم ملفات ضرورية لعمل المتجر. التحليلات والتسويق لا يعملان إلا بموافقتك.",
          "Essential storage keeps the store working. Analytics and marketing only run with your permission.",
        )}
      </p>
      {customizing && (
        <div className="my-3 grid gap-2 rounded-lg border p-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>{t("التحليلات", "Analytics")}</span>
            <Switch
              checked={choice.analytics}
              onCheckedChange={(v) => setChoice((c) => ({ ...c, analytics: v }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>{t("التسويق", "Marketing")}</span>
            <Switch
              checked={choice.marketing}
              onCheckedChange={(v) => setChoice((c) => ({ ...c, marketing: v }))}
            />
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => save({ decided: true, analytics: true, marketing: true })}>
          {t("قبول الكل", "Accept all")}
        </Button>
        <Button
          variant="outline"
          onClick={() => save({ decided: true, analytics: false, marketing: false })}
        >
          {t("الضروري فقط", "Essential only")}
        </Button>
        {customizing ? (
          <Button variant="secondary" onClick={() => save({ ...choice, decided: true })}>
            {t("حفظ", "Save choices")}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setCustomizing(true)}>
            {t("تخصيص", "Customize")}
          </Button>
        )}
      </div>
    </Card>
  );
}
