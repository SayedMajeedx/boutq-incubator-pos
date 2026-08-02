import React from "react";
import { Truck, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderFulfillmentSectionProps {
  lang: "en" | "ar";
  order: any;
  onOpenCourierWhatsAppModal?: () => void;
}

export const OrderFulfillmentSection: React.FC<OrderFulfillmentSectionProps> = ({
  lang,
  order,
  onOpenCourierWhatsAppModal,
}) => {
  const isAr = lang === "ar";
  const fulfillmentMethod = order.fulfillment_method || "delivery";
  const courierName =
    order.courier_name || order.courier?.name || (isAr ? "لم يتم التعيين" : "Unassigned");

  return (
    <div className="p-4 rounded-xl bg-card border border-border/60 shadow-2xs space-y-3">
      <div className="flex items-center gap-2 border-b border-border/40 pb-3">
        <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Truck className="h-4 w-4" />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
          {isAr ? "الشحن والتنفيذ" : "Fulfillment & Courier"}
        </h2>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>{isAr ? "طريقة التسليم" : "Fulfillment Method"}</span>
          <span className="font-bold text-foreground capitalize">{fulfillmentMethod}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{isAr ? "شركة / مندوب الشحن" : "Courier Partner"}</span>
          <span className="font-bold text-foreground">{courierName}</span>
        </div>

        {onOpenCourierWhatsAppModal && (
          <div className="pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenCourierWhatsAppModal}
              className="w-full h-8 text-xs font-bold gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {isAr ? "إرسال بيانات التوصيل للمندوب (واتساب)" : "Dispatch Courier via WhatsApp"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
