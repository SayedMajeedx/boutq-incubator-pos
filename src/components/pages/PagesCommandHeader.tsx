import { Layout, Plus, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PagesCommandHeaderProps {
  lang: "ar" | "en";
  brandName: string;
  pageCount: number;
  saving: boolean;
  onAddPage: () => void;
  onSave: () => void;
}

export function PagesCommandHeader({
  lang,
  brandName,
  pageCount,
  saving,
  onAddPage,
  onSave,
}: PagesCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Layout className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? "إدارة صفحات ومحتوى المتجر" : "STOREFRONT PAGES & CONTENT CMS"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {brandName}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>{isAr ? "الصفحات التعريفية والسياسات" : "Pages & Policy Management"}</span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border/60 rounded-full">
              {pageCount} {isAr ? "صفحة" : "pages"}
            </span>
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "إنشاء وترتيب الصفحات التعريفية (عن المتجر، الشروط، الأسئلة الشائعة)، وحسابات التواصل الاجتماعي."
              : "Design and organize custom storefront pages (About Us, Policies, FAQs), SEO tags, and social profiles."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onAddPage}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            <span>{isAr ? "إضافة صفحة" : "Add Page"}</span>
          </Button>

          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold bg-primary text-primary-foreground"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>
              {saving
                ? isAr
                  ? "جاري الحفظ..."
                  : "Saving..."
                : isAr
                  ? "حفظ التغييرات"
                  : "Save Changes"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
