import { Settings, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SettingsCommandHeaderProps {
  lang: "ar" | "en";
  brandName: string;
  activeTabLabel: string;
  saving: boolean;
  onSave: () => void;
}

export function SettingsCommandHeader({
  lang,
  brandName,
  activeTabLabel,
  saving,
  onSave,
}: SettingsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Settings className="h-3 w-3 shrink-0" />
            <span>{isAr ? "إعدادات المنصة والبوتيك" : "BOUTIQUE SYSTEM CONFIGURATION"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {brandName}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {activeTabLabel}
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "تعديل إعدادات الهوية التجاريّة، الفواتير، طرق الدفع والتسليم، والأمان."
              : "Manage business identity, invoicing, payment gateways, fulfillment, and security settings."}
          </p>
        </div>

        <Button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2 text-xs font-bold sm:w-auto sm:self-center bg-primary text-primary-foreground"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving Changes…"
              : isAr
                ? "حفظ التغييرات"
                : "Save All Changes"}
          </span>
        </Button>
      </div>
    </div>
  );
}
