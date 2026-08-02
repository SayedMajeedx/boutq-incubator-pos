import React, { useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  Package,
  Pencil,
  Trash2,
  Printer,
  MoreVertical,
  AlertTriangle,
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

interface InventoryWorkQueueProps {
  lang: "en" | "ar";
  products: any[];
  variantsByProduct: Record<string, any[]>;
  isLoading: boolean;
  isError: boolean;
  onEdit: (product: any) => void;
  onDelete: (productId: string) => void;
  onPrintLabel: (product: any) => void;
  renderVariantList?: (product: any) => React.ReactNode;
}

export const InventoryWorkQueue: React.FC<InventoryWorkQueueProps> = ({
  lang,
  products,
  variantsByProduct,
  isLoading,
  isError,
  onEdit,
  onDelete,
  onPrintLabel,
  renderVariantList,
}) => {
  const isAr = lang === "ar";
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  const toggleExpand = (productId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p>{isAr ? "جاري تحميل كتالوج المنتجات..." : "Loading product catalog..."}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-xs text-destructive bg-card rounded-xl border border-destructive/20">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-80" />
        <p className="font-bold">{isAr ? "تعذر تحميل المنتجات" : "Failed to load products"}</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60 space-y-2">
        <p className="font-bold text-sm text-foreground">
          {isAr ? "لا توجد منتجات مطابقة" : "No products found"}
        </p>
        <p>
          {isAr
            ? "جرب تغيير كلمات البحث أو مسح التصفية"
            : "Try adjusting search or clearing active filters."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
              <th className="p-3 text-start">
                {isAr ? "اسم المنتج والرمز" : "Product & Identity"}
              </th>
              <th className="p-3 text-start">{isAr ? "القسم" : "Category"}</th>
              <th className="p-3 text-start">{isAr ? "المتغيرات والأنواع" : "Variants"}</th>
              <th className="p-3 text-start">{isAr ? "حالة المخزون" : "Stock Level"}</th>
              <th className="p-3 text-end">{isAr ? "سعر البيع" : "Price"}</th>
              <th className="p-3 text-center">{isAr ? "الإجراء" : "Action"}</th>
              <th className="p-3 text-center w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {products.map((product) => {
              const name = isAr ? product.name_ar || product.name : product.name_en || product.name;
              const pVariants = variantsByProduct[product.id] || [];
              const totalStock = pVariants.reduce(
                (acc: number, v: any) =>
                  acc + Number(v.stock || v.stock_main || 0) + Number(v.stock_incubator || 0),
                0,
              );
              const minPrice =
                pVariants.length > 0
                  ? Math.min(...pVariants.map((v: any) => Number(v.selling_price || 0)))
                  : Number(product.base_price || 0);

              const isLowStock = totalStock > 0 && totalStock <= 5;
              const isOutOfStock = totalStock === 0;
              const isExpanded = !!expandedProducts[product.id];

              return (
                <React.Fragment key={product.id}>
                  <tr
                    className="hover:bg-muted/30 transition-colors group cursor-pointer"
                    onClick={() => toggleExpand(product.id)}
                  >
                    {/* Product Name & Image */}
                    <td className="p-3 align-middle font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted border border-border/60 flex items-center justify-center overflow-hidden shrink-0">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package className="h-5 w-5 text-muted-foreground/60" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate max-w-[200px] flex items-center gap-1.5">
                            <span>{name}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-primary shrink-0" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-foreground" />
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            ID: {product.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3 align-middle text-muted-foreground font-medium">
                      {product.category || (isAr ? "عام" : "General")}
                    </td>

                    {/* Variants Breakdown */}
                    <td className="p-3 align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(product.id);
                        }}
                        className="h-7 px-2 text-[11px] font-mono font-bold hover:bg-primary/10 hover:text-primary"
                      >
                        {pVariants.length} {isAr ? "متغيرات" : "variants"}
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3 ms-1 text-primary" />
                        ) : (
                          <ChevronDown className="h-3 w-3 ms-1 text-muted-foreground" />
                        )}
                      </Button>
                    </td>

                    {/* Stock Level */}
                    <td className="p-3 align-middle">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${
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
                    </td>

                    {/* Price */}
                    <td className="p-3 align-middle text-end font-mono font-extrabold text-foreground">
                      {formatMoney(minPrice, "BHD", lang)}
                    </td>

                    {/* Primary Action Button */}
                    <td
                      className="p-3 align-middle text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        onClick={() => onEdit(product)}
                        className="h-8 px-3 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                      >
                        <Pencil className="h-3 w-3 me-1" />
                        {isAr ? "تعديل" : "Edit"}
                      </Button>
                    </td>

                    {/* Secondary Actions */}
                    <td
                      className="p-3 align-middle text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                        <DropdownMenuContent
                          align={isAr ? "start" : "end"}
                          className="w-40 text-xs"
                        >
                          <DropdownMenuItem onClick={() => onPrintLabel(product)}>
                            <Printer className="h-3.5 w-3.5 me-2" />
                            {isAr ? "طباعة الباركوّد" : "Print Barcode"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete(product.id)}
                            className="text-rose-600 focus:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5 me-2" />
                            {isAr ? "حذف المنتج" : "Delete Product"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>

                  {/* Expanded Variant Detail Row */}
                  {isExpanded && renderVariantList && (
                    <tr className="bg-muted/15 border-b border-border/60">
                      <td colSpan={7} className="p-3 sm:p-4">
                        <div
                          className="bg-card rounded-lg border border-border/60 p-3 shadow-2xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renderVariantList(product)}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
