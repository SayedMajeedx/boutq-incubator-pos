import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DiscountsCommandHeaderProps {
  lang: "ar" | "en";
  promoCount: number;
  onCreateNew: () => void;
}

export function DiscountsCommandHeader({
  lang,
  promoCount,
  onCreateNew,
}: DiscountsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Subtle Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Tag className="h-3 w-3 shrink-0" />
            <span>{isAr ? "العروض والتخفيضات" : "PROMOTIONS & DISCOUNTS"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {promoCount}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {isAr ? "رموز الخصم والعروض" : "Discount Codes & Promotions"}
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "أنشئ رموز خصم مخصصة، وحدد شروط الأهلية، وجدولة المبيعات، والحد الأقصى للاستخدام."
              : "Create custom promo codes, set eligibility rules, schedules, and redemption caps."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            onClick={onCreateNew}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2 text-xs font-bold"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? "إنشاء رمز خصم" : "Create Promo Code"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
