import React from "react";
import { Boxes, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CategoriesWorkQueueProps {
  lang: "en" | "ar";
  categories: any[];
  isLoading: boolean;
  onEdit: (category: any) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, dir: "up" | "down") => void;
}

export const CategoriesWorkQueue: React.FC<CategoriesWorkQueueProps> = ({
  lang,
  categories,
  isLoading,
  onEdit,
  onDelete,
  onReorder,
}) => {
  const isAr = lang === "ar";

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p>{isAr ? "جاري تحميل الأقسام..." : "Loading categories..."}</p>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60 space-y-2">
        <Boxes className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
        <p className="font-bold text-sm text-foreground">
          {isAr ? "لا توجد أقسام مضافة" : "No categories found"}
        </p>
        <p>
          {isAr
            ? "قم بإضافة قسم جديد لتنظيم المنتجات في متجرك"
            : "Create a new category to organize your products."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs">
      <div className="space-y-2 p-2 sm:hidden">
        {categories.map((cat, index) => {
          const name = isAr ? cat.name_ar || cat.name : cat.name_en || cat.name;
          return (
            <article
              key={cat.id}
              className="rounded-xl border border-border/60 bg-background/70 p-3 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-foreground">{name}</h2>
                  <p
                    className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                    dir="ltr"
                  >
                    /{cat.slug || cat.id.slice(0, 8)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                  {cat.product_count || 0} {isAr ? "منتج" : "items"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                <div
                  className="flex items-center gap-1"
                  aria-label={isAr ? "تغيير ترتيب القسم" : "Reorder category"}
                >
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    disabled={index === 0}
                    onClick={() => onReorder(cat.id, "up")}
                    aria-label={isAr ? "تحريك القسم لأعلى" : "Move category up"}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    disabled={index === categories.length - 1}
                    onClick={() => onReorder(cat.id, "down")}
                    aria-label={isAr ? "تحريك القسم لأسفل" : "Move category down"}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 text-rose-600"
                    onClick={() => onDelete(cat.id)}
                    aria-label={isAr ? "حذف القسم" : "Delete category"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-10 px-4 text-xs font-bold"
                    onClick={() => onEdit(cat)}
                  >
                    <Pencil className="me-1.5 h-3.5 w-3.5" />
                    {isAr ? "تعديل" : "Edit"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
              <th className="p-3 text-start">{isAr ? "اسم القسم" : "Category Name"}</th>
              <th className="p-3 text-start">{isAr ? "الرابط اللطيف (Slug)" : "Slug"}</th>
              <th className="p-3 text-start">{isAr ? "عدد المنتجات" : "Products"}</th>
              <th className="p-3 text-center">{isAr ? "الترتيب" : "Reorder"}</th>
              <th className="p-3 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {categories.map((cat, index) => {
              const name = isAr ? cat.name_ar || cat.name : cat.name_en || cat.name;

              return (
                <tr key={cat.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 align-middle font-bold text-foreground">{name}</td>
                  <td className="p-3 align-middle font-mono text-[11px] text-muted-foreground">
                    {cat.slug || cat.id.slice(0, 8)}
                  </td>
                  <td className="p-3 align-middle font-mono text-xs font-semibold">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                      {cat.product_count || 0} {isAr ? "منتجات" : "items"}
                    </span>
                  </td>
                  <td className="p-3 align-middle text-center">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        disabled={index === 0}
                        onClick={() => onReorder(cat.id, "up")}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        disabled={index === categories.length - 1}
                        onClick={() => onReorder(cat.id, "down")}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-3 align-middle text-end">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => onEdit(cat)}
                        className="h-8 px-3 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Pencil className="h-3 w-3 me-1" />
                        {isAr ? "تعديل" : "Edit"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(cat.id)}
                        className="h-8 px-2 text-rose-600 border-rose-200 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
