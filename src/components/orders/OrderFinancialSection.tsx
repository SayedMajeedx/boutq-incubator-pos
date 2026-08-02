import React from "react";
import { CreditCard, Eye, CheckCircle2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface OrderFinancialSectionProps {
  lang: "en" | "ar";
  order: any;
  isAdmin: boolean;
  onViewBenefitReceipt?: () => void;
  onApproveBenefitReceipt?: () => void;
  onRejectBenefitReceipt?: () => void;
}

export const OrderFinancialSection: React.FC<OrderFinancialSectionProps> = ({
  lang,
  order,
  isAdmin,
  onViewBenefitReceipt,
  onApproveBenefitReceipt,
  onRejectBenefitReceipt,
}) => {
  const isAr = lang === "ar";
  const subtotal = order.subtotal_amount || order.total_amount || 0;
  const deliveryFee = order.delivery_fee || order.shipping_fee || 0;
  const discount = order.discount_amount || 0;
  const grandTotal = order.total_amount || 0;
  const paymentMethod = String(order.payment_method || "").toLowerCase();
  const isBenefit = paymentMethod.includes("benefit");

  return (
    <div className="p-4 rounded-xl bg-card border border-border/60 shadow-2xs space-y-3">
      <div className="flex items-center gap-2 border-b border-border/40 pb-3">
        <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <CreditCard className="h-4 w-4" />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
          {isAr ? "الملخص المالي والدفع" : "Financial Breakdown"}
        </h2>
      </div>

      <div className="space-y-1.5 text-xs font-mono">
        <div className="flex justify-between text-muted-foreground">
          <span>{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
          <span>{formatMoney(subtotal, order.currency || "BHD", lang)}</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{isAr ? "رسوم التوصيل" : "Delivery Fee"}</span>
            <span>{formatMoney(deliveryFee, order.currency || "BHD", lang)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-bold">
            <span>{isAr ? "الخصم" : "Discount"}</span>
            <span>-{formatMoney(discount, order.currency || "BHD", lang)}</span>
          </div>
        )}
        <div className="pt-2 border-t border-border/60 flex justify-between font-extrabold text-sm text-foreground">
          <span>{isAr ? "الإجمالي الكلي" : "Grand Total"}</span>
          <span className="text-primary">
            {formatMoney(grandTotal, order.currency || "BHD", lang)}
          </span>
        </div>
      </div>

      {/* BenefitPay Proof Verification Panel */}
      {isBenefit && isAdmin && onViewBenefitReceipt && (
        <div className="pt-3 border-t border-border/40 space-y-2">
          <div className="text-[11px] font-bold text-foreground">
            {isAr ? "إثبات تحويل بنفت بي" : "BenefitPay Transfer Receipt"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onViewBenefitReceipt}
              className="h-7 px-2.5 text-[10px] gap-1 font-bold"
            >
              <Eye className="h-3 w-3" />
              {isAr ? "عرض الإيصال" : "View Receipt"}
            </Button>
            {onApproveBenefitReceipt && (
              <Button
                variant="default"
                size="sm"
                onClick={onApproveBenefitReceipt}
                className="h-7 px-2.5 text-[10px] gap-1 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-3 w-3" />
                {isAr ? "اعتماد الدفع" : "Approve"}
              </Button>
            )}
            {onRejectBenefitReceipt && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRejectBenefitReceipt}
                className="h-7 px-2 text-[10px] gap-1 font-bold text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <XCircle className="h-3 w-3" />
                {isAr ? "رفض" : "Reject"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
