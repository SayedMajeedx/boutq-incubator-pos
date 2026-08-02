import { createFileRoute, Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/$slug/thank-you/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    fulfillment:
      search.fulfillment === "pickup"
        ? ("pickup" as const)
        : search.fulfillment === "digital"
          ? ("digital" as const)
          : ("delivery" as const),
    channel: search.channel === "whatsapp" ? ("whatsapp" as const) : ("email" as const),
  }),
  component: ThankYou,
});

function ThankYou() {
  const { brand, settings, t, clearCart } = useStorefront();
  const { fulfillment, channel } = Route.useSearch();
  const isPickup = fulfillment === "pickup";
  const isDigital = fulfillment === "digital";

  useEffect(() => {
    clearCart();
  }, []);

  return (
    <div className="mx-auto max-w-lg p-6 sm:p-8 animate-in fade-in duration-500">
      <Card className="p-6 sm:p-8 text-center relative overflow-hidden">
        {/* Ambient top design flourish */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: settings.primary_color }}
        ></div>

        <CheckCircle2
          className="h-14 w-14 mx-auto mb-4 animate-bounce duration-1000"
          style={{ color: settings.primary_color }}
        />
        <h1 className="font-display text-2xl sm:text-3xl mb-2">
          {t("شكراً لطلبك!", "Thank you for your order!")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mb-6 leading-relaxed">
          {isDigital
            ? channel === "whatsapp"
              ? t(
                  "تم استلام طلبك وسيتم إرسال المنتج الرقمي إليك عبر واتساب بعد تجهيز الطلب.",
                  "We received your order. Your digital product will be sent through WhatsApp once it is ready.",
                )
              : t(
                  "تم استلام طلبك وسيتم إرسال المنتج الرقمي إلى بريدك الإلكتروني بعد تجهيز الطلب.",
                  "We received your order. Your digital product will be sent to your email once it is ready.",
                )
            : isPickup
              ? t(
                  "تم استلام طلبكم وسيتم التواصل معكم فور تجهيز الطلب للاستلام من الفرع.",
                  "We received your order and will contact you as soon as it is ready for pickup from the branch.",
                )
              : t(
                  "تم استلام طلبك وسيتم التواصل معك قريباً لتأكيد التوصيل.",
                  "We received your order and will contact you shortly to confirm delivery.",
                )}
        </p>

        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="inline-flex px-8 py-3 rounded-full text-white font-medium active:scale-95 transition-all shadow-md hover:shadow-lg"
          style={{ backgroundColor: settings.primary_color }}
        >
          {t("متابعة التسوق", "Continue shopping")}
        </Link>
      </Card>
    </div>
  );
}
