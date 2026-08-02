import React from "react";
import { formatMoney } from "@/lib/format";
import { Users, Star, Phone, Mail, MapPin, ChevronRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomerMobileCardProps {
  lang: "en" | "ar";
  customer: any;
  defaultAddress: any;
  stats: any;
  currency: string;
  onSelect: (customerId: string) => void;
}

export const CustomerMobileCard: React.FC<CustomerMobileCardProps> = ({
  lang,
  customer,
  defaultAddress,
  stats,
  currency,
  onSelect,
}) => {
  const isAr = lang === "ar";
  const regionText = defaultAddress?.region || customer.region || customer.city || "";
  const cleanPhone = customer.phone ? customer.phone.replace(/[^\d+]/g, "") : "";

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onSelect(customer.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(customer.id);
      }}
      className="p-3.5 rounded-xl bg-card border border-border/60 shadow-2xs space-y-2.5 cursor-pointer hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
            {customer.name ? customer.name.charAt(0).toUpperCase() : "C"}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-xs text-foreground truncate flex items-center gap-1.5">
              <span>{customer.name}</span>
              {stats.badge === "VIP" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/40">
                  <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                  VIP
                </span>
              )}
            </h3>
            {customer.phone && (
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5" dir="ltr">
                {customer.phone}
              </p>
            )}
          </div>
        </div>

        <ChevronRight className={`h-4 w-4 text-muted-foreground ${isAr ? "rotate-180" : ""}`} />
      </div>

      {/* Address & Email */}
      <div className="flex flex-col gap-1 text-xs text-muted-foreground pt-1 border-t border-border/40">
        {regionText && (
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{regionText}</span>
          </div>
        )}
        {customer.email && (
          <div className="flex items-center gap-1.5 truncate font-mono text-[11px]" dir="ltr">
            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
        )}
      </div>

      {/* CRM Stats Footer & Quick WhatsApp Action */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px]">
            {isAr ? "الطلبات:" : "Orders:"} <b className="text-foreground">{stats.totalOrders}</b>
          </span>
          <span>•</span>
          <span className="font-mono text-xs font-extrabold text-foreground">
            {formatMoney(stats.lifetimeSpend, currency, lang)}
          </span>
        </div>

        {cleanPhone && (
          <a
            href={`https://wa.me/${cleanPhone.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{isAr ? "واتساب" : "WhatsApp"}</span>
          </a>
        )}
      </div>
    </div>
  );
};
