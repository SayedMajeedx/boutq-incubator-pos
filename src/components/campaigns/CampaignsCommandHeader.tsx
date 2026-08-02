import { Megaphone, Plus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampaignsCommandHeaderProps {
  lang: "ar" | "en";
  brandName: string;
  templateCount: number;
  selectedCount: number;
  onNewTemplate: () => void;
  onStartBulk: () => void;
}

export function CampaignsCommandHeader({
  lang,
  brandName,
  templateCount,
  selectedCount,
  onNewTemplate,
  onStartBulk,
}: CampaignsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Megaphone className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? "الحملات والتسويق عبر الواتساب" : "WHATSAPP MARKETING & CAMPAIGNS"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {brandName}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>{isAr ? "مركز الحملات والرسائل الجماعية" : "Broadcasts & Campaign Studio"}</span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border/60 rounded-full">
              {templateCount} {isAr ? "قوالب" : "templates"}
            </span>
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "إنشاء وإرسال حملات الواتساب الترويجية لشرائح العملاء، العملاء المميزين، والمعرضين للتسرب."
              : "Design, segment, and dispatch targeted WhatsApp promotional broadcasts to customer cohorts."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onNewTemplate}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            <span>{isAr ? "قالب جديد" : "New Template"}</span>
          </Button>

          <Button
            type="button"
            onClick={onStartBulk}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="h-3.5 w-3.5" />
            <span>
              {isAr ? `إطلاق حملة جماعية (${selectedCount})` : `Launch Campaign (${selectedCount})`}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
