import React from "react";
import { Link } from "@tanstack/react-router";
import { User, UserX, Phone, Mail, MapPin, ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderCustomerSectionProps {
  lang: "en" | "ar";
  slug: string;
  order: any;
}

export const OrderCustomerSection: React.FC<OrderCustomerSectionProps> = ({
  lang,
  slug,
  order,
}) => {
  const isAr = lang === "ar";
  const customerName = order.customer_name?.trim() || "";
  const customerPhone = order.customer_phone?.trim() || "";
  const customerEmail = order.customer_email?.trim() || "";
  const address = order.shipping_address || order.billing_address || {};
  const isGuest = !customerName;

  const whatsappUrl = customerPhone ? `https://wa.me/${customerPhone.replace(/\D/g, "")}` : "";

  return (
    <div className="p-4 rounded-xl bg-card border border-border/60 shadow-2xs space-y-4">
      {/* Customer Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
            {isAr ? "معلومات العميل" : "Customer & Contact"}
          </h2>
        </div>
        {order.customer_id && (
          <Link
            to="/admin/b/$slug/customers/$customerId"
            params={{ slug, customerId: order.customer_id }}
            className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
          >
            {isAr ? "الملف الشخصي" : "Profile"}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Customer Details Body */}
      {isGuest ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 text-muted-foreground text-xs font-semibold">
          <UserX className="h-4 w-4 shrink-0" />
          <span>
            {isAr ? "عميل زائر (بدون حساب مسجل)" : "Guest Customer (No registered profile)"}
          </span>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="font-bold text-sm text-foreground">{customerName}</div>
          {customerPhone && (
            <div className="flex items-center justify-between text-muted-foreground">
              <a
                href={`tel:${customerPhone}`}
                className="inline-flex items-center gap-1.5 font-mono hover:text-primary"
              >
                <Phone className="h-3.5 w-3.5" />
                {customerPhone}
              </a>
              {whatsappUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[10px] gap-1 font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  asChild
                >
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageSquare className="h-3 w-3" />
                    WhatsApp
                  </a>
                </Button>
              )}
            </div>
          )}
          {customerEmail && (
            <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
              <Mail className="h-3.5 w-3.5" />
              {customerEmail}
            </div>
          )}
        </div>
      )}

      {/* Shipping Address */}
      {address && (address.address_line1 || address.area || address.city) && (
        <div className="pt-3 border-t border-border/40 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span>{isAr ? "عنوان التوصيل (البحرين)" : "Delivery Address"}</span>
          </div>
          <div className="text-muted-foreground leading-relaxed ps-5 font-mono text-[11px]">
            {address.building && `${isAr ? "مبنى" : "Bldg"} ${address.building}, `}
            {address.road && `${isAr ? "طريق" : "Road"} ${address.road}, `}
            {address.block && `${isAr ? "مجمع" : "Block"} ${address.block}, `}
            {address.area || address.city || "Bahrain"}
          </div>
        </div>
      )}
    </div>
  );
};
