import React, { useEffect, useState } from "react";
import { Grid2X2, Rows } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type ProductRow } from "@/routes/$slug.index";
import { ProductCard } from "./product-card";

export function ProductGrid({
  products,
  loading,
  categoryEmpty,
  onViewAll,
}: {
  products: ProductRow[];
  loading: boolean;
  categoryEmpty: boolean;
  onViewAll: () => void;
}) {
  const { t, lang } = useStorefront();

  // [TECH ADVISOR #2]: Hydration guard. Initial render uses "2" columns.
  // Read preference from localStorage only in useEffect after mount to completely prevent hydration mismatches!
  const [mobileCols, setMobileCols] = useState("2");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("storefront-mobile-cols");
      if (saved === "1" || saved === "2") {
        setMobileCols(saved);
      }
    } catch {}
  }, []);

  const toggleMobileCols = (cols: "1" | "2") => {
    setMobileCols(cols);
    try {
      localStorage.setItem("storefront-mobile-cols", cols);
    } catch {}
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Skeleton controls bar */}
        <div className="flex justify-end h-10" />
        <div
          className={`grid ${
            mobileCols === "1" ? "grid-cols-1" : "grid-cols-2"
          } md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6`}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[3/4] rounded-xl w-full bg-neutral-100" />
              <Skeleton className="h-3 w-3/4 bg-neutral-100" />
              <Skeleton className="h-3 w-1/3 bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <Card className="p-8 sm:p-12 text-center text-muted-foreground">
        <p>
          {categoryEmpty
            ? t(
                "لا توجد منتجات متاحة في هذا القسم حالياً.",
                "No products are currently available in this category.",
              )
            : t("لا توجد منتجات بعد.", "No products yet.")}
        </p>
        {categoryEmpty && (
          <button
            type="button"
            onClick={onViewAll}
            className="mt-4 text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--sf-link)" }}
          >
            {t("عرض كل المنتجات", "View all products")}
          </button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dynamic Grid Layout Switcher control bar */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100/50">
        <span className="text-xs text-muted-foreground font-medium">
          {products.length} {products.length === 1 ? t("منتج", "product") : t("منتجات", "products")}
        </span>

        {/* Toggle columns trigger button (strictly visible on mobile viewport <md) */}
        <div className="flex items-center gap-1.5 md:hidden">
          <button
            type="button"
            onClick={() => toggleMobileCols("2")}
            aria-label={t("عرض شبكة ثنائية", "Dense 2-Column Grid")}
            className={`grid h-11 w-11 place-items-center rounded-lg border transition-all duration-200 ${
              mobileCols === "2"
                ? "bg-neutral-900 text-white border-neutral-900 shadow-sm"
                : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleMobileCols("1")}
            aria-label={t("عرض قائمة عمودية", "Immersive 1-Column List")}
            className={`grid h-11 w-11 place-items-center rounded-lg border transition-all duration-200 ${
              mobileCols === "1"
                ? "bg-neutral-900 text-white border-neutral-900 shadow-sm"
                : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            <Rows className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid container responsive columns based on toggled preference */}
      <div
        id="products"
        className={`grid ${
          mobileCols === "1" ? "grid-cols-1" : "grid-cols-2"
        } md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6`}
      >
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
