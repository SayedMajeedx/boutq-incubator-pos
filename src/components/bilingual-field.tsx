import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { translateProductText } from "@/lib/translate.functions";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

/**
 * Reusable bilingual AR/EN input with one-click AI translation.
 * Wire it wherever the admin needs matching Arabic + English text
 * (product names, descriptions, category names, page titles, etc.).
 */
export function BilingualField({
  labelAr,
  labelEn,
  valueAr,
  valueEn,
  onChangeAr,
  onChangeEn,
  multiline = false,
  rows = 3,
  placeholderAr,
  placeholderEn,
}: {
  labelAr: string;
  labelEn: string;
  valueAr: string;
  valueEn: string;
  onChangeAr: (v: string) => void;
  onChangeEn: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholderAr?: string;
  placeholderEn?: string;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const translate = useServerFn(translateProductText);
  const [busy, setBusy] = useState<"ar->en" | "en->ar" | null>(null);

  const run = async (direction: "ar->en" | "en->ar") => {
    const from = direction === "ar->en" ? "ar" : "en";
    const to = direction === "ar->en" ? "en" : "ar";
    const source = from === "ar" ? valueAr : valueEn;
    if (!source.trim()) {
      toast.error(isAr ? "اكتب النص أولاً" : "Type the text first");
      return;
    }
    setBusy(direction);
    try {
      const { text } = await translate({ data: { text: source, from, to } });
      const cleaned = text.trim();
      if (!cleaned) throw new Error("empty");
      if (to === "en") onChangeEn(cleaned);
      else onChangeAr(cleaned);
      toast.success(isAr ? "تمت الترجمة" : "Translated");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("CREDITS_EXHAUSTED"))
        toast.error(isAr ? "نفدت الأرصدة" : "AI credits exhausted");
      else if (msg.includes("RATE_LIMITED"))
        toast.error(isAr ? "الكثير من الطلبات، حاول بعد قليل" : "Rate limited — try again shortly");
      else toast.error((isAr ? "تعذر الترجمة: " : "Translation failed: ") + msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{labelAr}</Label>
          <button
            type="button"
            onClick={() => run("ar->en")}
            disabled={busy === "ar->en" || !valueAr.trim()}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline"
            title={isAr ? "ترجمة تلقائية إلى الإنجليزية" : "Auto-translate to English"}
          >
            {busy === "ar->en" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>✨ {isAr ? "ترجم → EN" : "Translate → EN"}</span>
          </button>
        </div>
        {multiline ? (
          <Textarea
            dir="rtl"
            value={valueAr}
            onChange={(e) => onChangeAr(e.target.value)}
            className="text-right"
            rows={rows}
            placeholder={placeholderAr}
          />
        ) : (
          <Input
            dir="rtl"
            value={valueAr}
            onChange={(e) => onChangeAr(e.target.value)}
            className="text-right"
            placeholder={placeholderAr}
          />
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{labelEn}</Label>
          <button
            type="button"
            onClick={() => run("en->ar")}
            disabled={busy === "en->ar" || !valueEn.trim()}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline"
            title={isAr ? "ترجمة تلقائية إلى العربية" : "Auto-translate to Arabic"}
          >
            {busy === "en->ar" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>✨ {isAr ? "ترجم → AR" : "Translate → AR"}</span>
          </button>
        </div>
        {multiline ? (
          <Textarea
            dir="ltr"
            value={valueEn}
            onChange={(e) => onChangeEn(e.target.value)}
            rows={rows}
            placeholder={placeholderEn}
          />
        ) : (
          <Input
            dir="ltr"
            value={valueEn}
            onChange={(e) => onChangeEn(e.target.value)}
            placeholder={placeholderEn}
          />
        )}
      </div>
    </div>
  );
}
