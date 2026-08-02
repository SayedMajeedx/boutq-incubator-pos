import {
  Building2,
  CreditCard,
  Mail,
  MapPin,
  MoreHorizontal,
  Receipt,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SettingsTabId =
  | "business"
  | "invoice"
  | "storefront"
  | "checkout"
  | "payments"
  | "branches"
  | "emails"
  | "security"
  | "subscription";

interface SettingsScopeSwitcherProps {
  lang: "ar" | "en";
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

export function SettingsScopeSwitcher({
  lang,
  activeTab,
  onTabChange,
}: SettingsScopeSwitcherProps) {
  const isAr = lang === "ar";
  const tabs = [
    { id: "business", icon: Building2, ar: "الملف التجاري", en: "Business Profile" },
    { id: "invoice", icon: Receipt, ar: "الفاتورة والطباعة", en: "Invoicing" },
    { id: "storefront", icon: Store, ar: "واجهة المتجر", en: "Storefront SEO" },
    { id: "checkout", icon: Truck, ar: "الشحن والتسليم", en: "Fulfillment" },
    { id: "payments", icon: CreditCard, ar: "طرق الدفع", en: "Payments" },
    { id: "branches", icon: MapPin, ar: "الفروع والمواقع", en: "Branches" },
    { id: "emails", icon: Mail, ar: "الإشعارات والبريد", en: "Notifications" },
    { id: "security", icon: ShieldCheck, ar: "الأمان والبصمة", en: "Security" },
    { id: "subscription", icon: CreditCard, ar: "الاشتراك والترخيص", en: "Subscription" },
  ] satisfies Array<{ id: SettingsTabId; icon: React.ElementType; ar: string; en: string }>;
  const primary = tabs.slice(0, 2);
  const secondary = tabs.slice(2);
  const activeSecondary = secondary.find((tab) => tab.id === activeTab);

  const tabButton = (tab: (typeof tabs)[number], mobile = false) => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        aria-pressed={active}
        onClick={() => onTabChange(tab.id)}
        className={cn(
          "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          mobile ? "min-w-0 flex-1" : "whitespace-nowrap",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{isAr ? tab.ar : tab.en}</span>
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/40 p-1">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1 sm:hidden">
        {primary.map((tab) => tabButton(tab, true))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={isAr ? "المزيد من الإعدادات" : "More settings"}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-xl px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                activeSecondary ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {activeSecondary ? (
                <activeSecondary.icon className="h-4 w-4" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isAr ? "start" : "end"}>
            {secondary.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onSelect={() => onTabChange(tab.id)}
                className="min-h-11 gap-2"
              >
                <tab.icon className="h-4 w-4" />
                {isAr ? tab.ar : tab.en}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
        {tabs.map((tab) => tabButton(tab))}
      </div>
    </div>
  );
}
