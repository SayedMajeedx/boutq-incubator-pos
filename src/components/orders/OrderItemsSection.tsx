import React from "react";
import { ShoppingBag, Package } from "lucide-react";
import { formatMoney } from "@/lib/format";

interface OrderItemsSectionProps {
  lang: "en" | "ar";
  order: any;
}

export const OrderItemsSection: React.FC<OrderItemsSectionProps> = ({ lang, order }) => {
  const isAr = lang === "ar";
  const items = order.items || order.order_items || [];

  return (
    <div className="p-4 rounded-xl bg-card border border-border/60 shadow-2xs space-y-3">
      <div className="flex items-center gap-2 border-b border-border/40 pb-3">
        <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <ShoppingBag className="h-4 w-4" />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
          {isAr ? "المنتجات المشتراة" : "Order Items"} ({items.length})
        </h2>
      </div>

      <div className="divide-y divide-border/40">
        {items.map((item: any, idx: number) => {
          const itemTitle = item.product_title || item.title || "Product";
          const variantTitle = item.variant_title || item.variant_name || "";
          const qty = item.quantity || 1;
          const unitPrice = item.unit_price || item.price || 0;
          const lineTotal = item.total_price || qty * unitPrice;
          const imgUrl = item.image_url || item.thumbnail_url;

          return (
            <div
              key={item.id || idx}
              className="py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-muted border border-border/60 flex items-center justify-center overflow-hidden shrink-0">
                  {imgUrl ? (
                    <img src={imgUrl} alt={itemTitle} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-foreground truncate">{itemTitle}</div>
                  {variantTitle && (
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {variantTitle}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {qty} × {formatMoney(unitPrice, order.currency || "BHD", lang)}
                  </div>
                </div>
              </div>

              <div className="font-mono font-extrabold text-foreground shrink-0">
                {formatMoney(lineTotal, order.currency || "BHD", lang)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
