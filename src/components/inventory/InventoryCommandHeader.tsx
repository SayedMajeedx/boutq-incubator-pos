import React from "react";
import { Package, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface InventoryCommandHeaderProps {
  lang: "en" | "ar";
  productCount: number;
  isCourier: boolean;
  onCreateNew: () => void;
  renderImporters?: React.ReactNode;
}

export const InventoryCommandHeader: React.FC<InventoryCommandHeaderProps> = ({
  lang,
  productCount,
  isCourier,
  onCreateNew,
  renderImporters,
}) => {
  const isAr = lang === "ar";

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-card border border-border/60 shadow-2xs">
      {/* Title + Icon + Context Badge */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
          <Package className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1
              data-route-heading="inventory"
              tabIndex={-1}
              className="font-display text-lg sm:text-xl font-bold tracking-tight text-foreground"
            >
              {isAr ? "المخزون والمنتجات" : "Inventory & Products"}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
              {productCount} {isAr ? "منتج" : "products"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "متابعة كتل المخزون، الأسعار، والمتغيرات وطباعة البارکود"
              : "Manage product catalog, stock levels, variants, and barcode printing."}
          </p>
        </div>
      </div>

      {/* Primary & Secondary Actions Group */}
      {!isCourier && (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={onCreateNew}
            className="h-9 px-3.5 gap-1.5 font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs text-xs"
          >
            <Plus className="h-4 w-4" />
            {isAr ? "إضافة منتج" : "Add Product"}
          </Button>

          {renderImporters && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-border/70 text-foreground hover:bg-muted"
                  aria-label={isAr ? "خيارات الاستيراد والطباعة" : "Import & Print Options"}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isAr ? "start" : "end"}
                className="w-80 p-1.5 shadow-xl border border-border/80 rounded-xl"
              >
                {renderImporters}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
};
