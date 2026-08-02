import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { useBrandOptional } from "@/lib/brand-context";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Package,
  Users,
  ReceiptText,
  Settings,
  Megaphone,
  Wallet,
  BadgePercent,
  BarChart,
  Plus,
  Store,
  Languages,
  Search,
} from "lucide-react";

export function SpotlightCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false }) as { slug?: string };
  const { lang, setLang, t } = useI18n();
  const brand = useBrandOptional();
  const isAr = lang === "ar";
  const [searchQuery, setSearchQuery] = useState("");

  const activeSlug = brand?.slug || routeParams?.slug || "";

  // Query live matching orders, products, and customers
  const liveSearchResults = useQuery({
    queryKey: ["spotlight-search", activeSlug, brand?.id, searchQuery],
    queryFn: async () => {
      const q = searchQuery.trim();
      if (!q) {
        return { orders: [], products: [], customers: [] };
      }

      // First resolve brandId if brand context is not loaded yet
      let bId = brand?.id;
      if (!bId && activeSlug) {
        const { data: bData } = await supabase
          .from("brands")
          .select("id")
          .eq("slug", activeSlug)
          .maybeSingle();
        bId = bData?.id;
      }

      if (!bId) return { orders: [], products: [], customers: [] };

      const term = `%${q}%`;
      const isNum = !isNaN(Number(q));

      // Build order query safely without invalid ilike on integer invoice_number
      let orderQuery = supabase
        .from("orders")
        .select("id, invoice_number, total, currency, created_at, customer_name_snapshot")
        .eq("brand_id", bId);

      if (isNum) {
        orderQuery = orderQuery.or(`invoice_number.eq.${parseInt(q, 10)},customer_name_snapshot.ilike.${term}`);
      } else {
        orderQuery = orderQuery.or(`customer_name_snapshot.ilike.${term},customer_phone_snapshot.ilike.${term}`);
      }

      const [ordersRes, productsRes, customersRes] = await Promise.all([
        orderQuery.limit(6),
        supabase
          .from("products")
          .select("id, name_en, name_ar, base_price, image_url, product_variants(selling_price)")
          .eq("brand_id", bId)
          .or(`name_en.ilike.${term},name_ar.ilike.${term}`)
          .limit(6),
        supabase
          .from("customers")
          .select("id, name, phone, email")
          .eq("brand_id", bId)
          .or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
          .limit(6),
      ]);

      return {
        orders: ordersRes.data ?? [],
        products: productsRes.data ?? [],
        customers: customersRes.data ?? [],
      };
    },
    enabled: open && searchQuery.trim().length > 0,
    staleTime: 5_000,
  });

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    setSearchQuery("");
    callback();
  };

  const navItems = [
    {
      label: isAr ? "لوحة التحكم" : "Dashboard",
      icon: LayoutDashboard,
      to: "/admin/b/$slug/dashboard",
    },
    {
      label: isAr ? "الطلبات والفواتير" : "Orders & Invoices",
      icon: ReceiptText,
      to: "/admin/b/$slug/orders",
    },
    {
      label: isAr ? "إدارة المخزون والمنتجات" : "Products & Inventory",
      icon: Package,
      to: "/admin/b/$slug/inventory",
    },
    {
      label: isAr ? "قاعدة العملاء" : "Customer Database",
      icon: Users,
      to: "/admin/b/$slug/customers",
    },
    {
      label: isAr ? "حملات الواتساب" : "WhatsApp Campaigns",
      icon: Megaphone,
      to: "/admin/b/$slug/campaigns",
    },
    {
      label: isAr ? "رموز الخصم" : "Discount Codes",
      icon: BadgePercent,
      to: "/admin/b/$slug/discounts",
    },
    {
      label: isAr ? "سجل المصروفات" : "Expenses",
      icon: Wallet,
      to: "/admin/b/$slug/expenses",
    },
    {
      label: isAr ? "التقارير والتحليلات" : "Reports & Analytics",
      icon: BarChart,
      to: "/admin/b/$slug/reports",
    },
    {
      label: isAr ? "إعدادات المتجر" : "Store Settings",
      icon: Settings,
      to: "/admin/b/$slug/settings",
    },
  ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} commandProps={{ shouldFilter: false }}>
      <CommandInput
        placeholder={
          isAr
            ? "ابحث عن طلب، منتج، عميل، أو اكتب أمرًا... (Cmd + K)"
            : "Search order #, product, customer, or type a command... (Cmd + K)"
        }
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="max-h-[380px] p-2">
        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
          {isAr ? "لم يتم العثور على نتائج مطابقة." : "No matching results found."}
        </CommandEmpty>

        {/* Live Order Search Results */}
        {liveSearchResults.data?.orders && liveSearchResults.data.orders.length > 0 && (
          <CommandGroup heading={isAr ? "الطلبات المطابقة" : "Matching Orders"}>
            {liveSearchResults.data.orders.map((o) => (
              <CommandItem
                key={o.id}
                onSelect={() =>
                  handleSelect(() =>
                    navigate({
                      to: "/admin/b/$slug/orders/$id",
                      params: { slug: activeSlug, id: o.id },
                    }),
                  )
                }
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  <span className="font-semibold">#{o.invoice_number}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {o.customer_name_snapshot || (isAr ? "عميل زائر" : "Guest Customer")}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold">
                  {formatMoney(Number(o.total || 0), o.currency || "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Live Product Search Results */}
        {liveSearchResults.data?.products && liveSearchResults.data.products.length > 0 && (
          <CommandGroup heading={isAr ? "المنتجات المطابقة" : "Matching Products"}>
            {liveSearchResults.data.products.map((p) => (
              <CommandItem
                key={p.id}
                onSelect={() =>
                  handleSelect(() =>
                    navigate({
                      to: "/admin/b/$slug/inventory",
                      params: { slug: activeSlug },
                    }),
                  )
                }
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="h-6 w-6 rounded object-cover border"
                    />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">
                    {isAr ? p.name_ar || p.name_en : p.name_en || p.name_ar}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(
                    Number(p.base_price) > 0
                      ? Number(p.base_price)
                      : p.product_variants?.[0]?.selling_price
                        ? Number(p.product_variants[0].selling_price)
                        : 0,
                    "BHD",
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Navigation Routes */}
        <CommandGroup heading={isAr ? "التنقل السريع" : "Quick Navigation"}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.to}
                onSelect={() =>
                  handleSelect(() =>
                    navigate({
                      to: item.to as any,
                      params: { slug: activeSlug } as any,
                    }),
                  )
                }
                className="flex items-center gap-2 cursor-pointer"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {/* Quick Actions */}
        <CommandGroup heading={isAr ? "الإجراءات السريعة" : "Quick Actions"}>
          <CommandItem
            onSelect={() =>
              handleSelect(() =>
                navigate({
                  to: "/admin/b/$slug/inventory",
                  params: { slug: activeSlug },
                }),
              )
            }
            className="flex items-center gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4 text-emerald-500" />
            <span>{isAr ? "إضافة منتج جديد" : "Create New Product"}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => setLang(lang === "en" ? "ar" : "en"))}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Languages className="h-4 w-4 text-amber-500" />
            <span>
              {isAr ? "تغيير اللغة إلى الإنجليزية" : "Switch Language to Arabic (العربية)"}
            </span>
          </CommandItem>
          {activeSlug && (
            <CommandItem
              onSelect={() =>
                handleSelect(() =>
                  window.open(
                    typeof window !== "undefined" &&
                      window.location.hostname.toLowerCase() !== "localhost" &&
                      window.location.hostname.toLowerCase() !== "127.0.0.1"
                      ? `https://${activeSlug}.boutq.store`
                      : `/${activeSlug}`,
                    "_blank",
                  ),
                )
              }
              className="flex items-center gap-2 cursor-pointer"
            >
              <Store className="h-4 w-4 text-sky-500" />
              <span>{isAr ? "فتح المتجر الإلكتروني" : "View Live Storefront"}</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
