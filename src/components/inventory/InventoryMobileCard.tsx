import React, { useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  Package,
  Pencil,
  Trash2,
  Printer,
  MoreVertical,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface InventoryMobileCardProps {
  lang: "en" | "ar";
  product: any;
  variants: any[];
  totalStock: number;
  minPrice: number;
  onEdit: (product: any) => void;
  onDelete: (productId: string) => void;
  onPrintLabel: (product: any) => void;
  renderVariantList?: (product: any) => React.ReactNode;
}

export const InventoryMobileCard: React.FC<InventoryMobileCardProps> = ({
  lang,
  product,
  variants,
  totalStock,
  minPrice,
  onEdit,
  onDelete,
  onPrintLabel,
  renderVariantList,
}) => {
  const isAr = lang === "ar";
  const [isExpanded, setIsExpanded] = useState(false);
  const name = isAr ? product.name_ar || product.name : product.name_en || product.name;
  const isLowStock = totalStock > 0 && totalStock <= 5;
  const isOutOfStock = totalStock === 0;

  return (
    <div className="p-3.5 rounded-xl bg-card border border-border/60 shadow-2xs space-y-2.5">
      <div
        className="flex items-start justify-between gap-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0 cursor-pointer">
          <div className="h-12 w-12 rounded-lg bg-muted border border-border/60 flex items-center justify-center overflow-hidden shrink-0">
            {product.image_url ? (
              <img src={product.image_url} alt={name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground/60" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-xs text-foreground truncate flex items-center gap-1">
              <span>{name}</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {variants.length} {isAr ? "متغيرات" : "variants"}
            </p>
          </div>
        </div>

        <div className="text-end shrink-0">
          <span className="font-mono text-xs font-extrabold text-foreground">
            {formatMoney(minPrice, "BHD", lang)}
          </span>
        </div>
      </div>

      {/* Stock Status Badge */}
      <div className="flex items-center justify-between text-xs">
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
            isOutOfStock
              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              : isLowStock
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          {isOutOfStock
            ? isAr
              ? "نفذت الكمية"
              : "Out of Stock"
            : isLowStock
              ? isAr
                ? `منخفض (${totalStock})`
                : `Low Stock (${totalStock})`
              : isAr
                ? `متوفر (${totalStock})`
                : `In Stock (${totalStock})`}
        </span>

        {/* Mobile Actions */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            variant="outline"
            className="h-8 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground"
          >
            {isAr ? "المتغيرات" : "Variants"}
            {isExpanded ? (
              <ChevronUp className="h-3 w-3 ms-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ms-1" />
            )}
          </Button>

          <Button
            size="sm"
            onClick={() => onEdit(product)}
            className="h-8 px-3 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Pencil className="h-3 w-3 me-1" />
            {isAr ? "تعديل" : "Edit"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label={isAr ? "المزيد من إجراءات المنتج" : "More product actions"}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-xs">
              <DropdownMenuItem onClick={() => onPrintLabel(product)}>
                <Printer className="h-3.5 w-3.5 me-2" />
                {isAr ? "طباعة الباركوّد" : "Print Barcode"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(product.id)}
                className="text-rose-600 focus:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5 me-2" />
                {isAr ? "حذف المنتج" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded Variant Details Panel */}
      {isExpanded && renderVariantList && (
        <div className="pt-2 border-t border-border/40 overflow-x-auto">
          {renderVariantList(product)}
        </div>
      )}
    </div>
  );
};
