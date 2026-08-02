import React from "react";
import { Boxes, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CategoriesCommandHeaderProps {
  lang: "en" | "ar";
  categoryCount: number;
  onCreateNew: () => void;
}

export const CategoriesCommandHeader: React.FC<CategoriesCommandHeaderProps> = ({
  lang,
  categoryCount,
  onCreateNew,
}) => {
  const isAr = lang === "ar";

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-card border border-border/60 shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
          <Boxes className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-foreground">
              {isAr ? "الأقسام والتصنيفات" : "Categories & Catalog Hierarchy"}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
              {categoryCount} {isAr ? "قسم" : "categories"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "تنظيم أقسام المتجر، الترتيب، وإدارة تصنيف المنتجات"
              : "Organize store categories, display order, and product catalog hierarchy."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          onClick={onCreateNew}
          className="h-9 px-3.5 gap-1.5 font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs text-xs"
        >
          <Plus className="h-4 w-4" />
          {isAr ? "قسم جديد" : "New Category"}
        </Button>
      </div>
    </header>
  );
};
