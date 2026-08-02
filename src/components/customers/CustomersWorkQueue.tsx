import React from "react";
import { formatMoney } from "@/lib/format";
import {
  Users,
  Star,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomersWorkQueueProps {
  lang: "en" | "ar";
  customers: any[];
  defaultByCustomer: Map<string, any>;
  customerCrmStats: Map<string, any>;
  currency: string;
  isLoading: boolean;
  isError: boolean;
  onSelectCustomer: (customerId: string) => void;
  onDeleteCustomer: (customer: any) => void;
}

export const CustomersWorkQueue: React.FC<CustomersWorkQueueProps> = ({
  lang,
  customers,
  defaultByCustomer,
  customerCrmStats,
  currency,
  isLoading,
  isError,
  onSelectCustomer,
}) => {
  const isAr = lang === "ar";

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p>{isAr ? "جاري تحميل قاعدة بيانات العملاء..." : "Loading customer records..."}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-xs text-destructive bg-card rounded-xl border border-destructive/20">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-80" />
        <p className="font-bold">
          {isAr ? "تعذر تحميل قائمة العملاء" : "Failed to load customer list"}
        </p>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60 space-y-2">
        <Users className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
        <p className="font-bold text-sm text-foreground">
          {isAr ? "لا يوجد عملاء مطابقون" : "No matching customers found"}
        </p>
        <p>
          {isAr
            ? "جرب تغيير كلمات البحث أو مسح تصفية الشريحة"
            : "Try adjusting search query or clearing filter tabs."}
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
              <th className="p-3 text-start">{isAr ? "العميل والتصنيف" : "Customer & Segment"}</th>
              <th className="p-3 text-start">{isAr ? "معلومات التواصل" : "Contact Details"}</th>
              <th className="p-3 text-start">
                {isAr ? "عنوان التوصيل الافتراضي" : "Delivery Address"}
              </th>
              <th className="p-3 text-center">{isAr ? "عدد الطلبات" : "Orders"}</th>
              <th className="p-3 text-end">{isAr ? "إجمالي الإنفاق" : "Lifetime Spend"}</th>
              <th className="p-3 text-center w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {customers.map((c) => {
              const defAddress = defaultByCustomer.get(c.id);
              const regionText = defAddress?.region || c.region || c.city || "";
              const stats = customerCrmStats.get(c.id) || {
                totalOrders: 0,
                lifetimeSpend: 0,
                lastOrderDate: null,
                badge: null,
              };

              const cleanPhone = c.phone ? c.phone.replace(/[^\d+]/g, "") : "";

              return (
                <tr
                  key={c.id}
                  onClick={() => onSelectCustomer(c.id)}
                  className="hover:bg-muted/30 transition-colors group cursor-pointer"
                >
                  {/* Customer Name & Segment Badge */}
                  <td className="p-3 align-middle font-medium">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0">
                        {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-foreground truncate max-w-[180px] flex items-center gap-1.5">
                          <span>{c.name}</span>
                          {stats.badge === "VIP" && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/40">
                              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                              VIP
                            </span>
                          )}
                          {stats.badge === "Churn Risk" && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                              {isAr ? "راكد" : "Churn"}
                            </span>
                          )}
                          {stats.badge === "New Buyer" && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {isAr ? "جديد" : "New"}
                            </span>
                          )}
                        </div>
                        {c.notes &&
                          !/(migrated_shopify|(?:^|\|)\s*(?:tags|notes):)/i.test(c.notes) && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {c.notes}
                            </div>
                          )}
                      </div>
                    </div>
                  </td>

                  {/* Contact Info (Phone & Email + WhatsApp Link) */}
                  <td className="p-3 align-middle text-start text-muted-foreground font-mono text-[11px]">
                    <div className="flex flex-col gap-1 items-start">
                      {c.phone && (
                        <div className="inline-flex items-center gap-1.5 text-foreground">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span dir="ltr" className="font-mono">
                            {c.phone}
                          </span>
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone.replace("+", "")}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={isAr ? "مراسلة عبر الواتساب" : "Chat on WhatsApp"}
                              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 p-0.5 inline-flex items-center"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      )}
                      {c.email && (
                        <div className="inline-flex items-center gap-1.5 text-muted-foreground max-w-[200px] truncate">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span dir="ltr" className="truncate font-mono">
                            {c.email}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Default Delivery Address */}
                  <td className="p-3 align-middle text-muted-foreground">
                    {regionText ? (
                      <div className="flex items-center gap-1 truncate max-w-[200px]">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate font-medium">{regionText}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60 italic">—</span>
                    )}
                  </td>

                  {/* Order Count */}
                  <td className="p-3 align-middle text-center font-mono font-bold text-foreground">
                    {stats.totalOrders}
                  </td>

                  {/* Lifetime Spend */}
                  <td className="p-3 align-middle text-end font-mono font-extrabold text-foreground">
                    {formatMoney(stats.lifetimeSpend, currency, lang)}
                  </td>

                  {/* Arrow Action */}
                  <td className="p-3 align-middle text-center">
                    <ChevronRight
                      className={`h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform ${isAr ? "rotate-180" : ""}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
