import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { BarChart3, TrendingUp, Package, Users, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports")({
  beforeLoad: async ({ params }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role, status, email, permissions")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;
    const permissions = (profile?.permissions as string[]) || [];
    const allowed =
      (user.email || "").toLowerCase() === "majeed@hotmail.it" ||
      (profile?.status !== "disabled" &&
        (["admin", "super_admin", "brand_admin"].includes(role) ||
          (role === "staff" && permissions.includes("view_financials"))));

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: ReportsLayout,
});

const navItems = [
  {
    id: "overview",
    path: "/admin/b/$slug/reports",
    icon: BarChart3,
    en: "Overview",
    ar: "نظرة عامة",
  },
  {
    id: "sales",
    path: "/admin/b/$slug/reports/sales",
    icon: TrendingUp,
    en: "Sales",
    ar: "المبيعات",
  },
  {
    id: "products",
    path: "/admin/b/$slug/reports/products",
    icon: Package,
    en: "Products",
    ar: "المنتجات",
  },
  {
    id: "customers",
    path: "/admin/b/$slug/reports/customers",
    icon: Users,
    en: "Customers",
    ar: "العملاء",
  },
  {
    id: "export",
    path: "/admin/b/$slug/reports/export",
    icon: Download,
    en: "Export",
    ar: "التصدير",
  },
] as const;

function ReportsLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const { slug } = Route.useParams();
  const current =
    navItems.find((item) =>
      item.id === "overview"
        ? location.pathname.endsWith("/reports")
        : location.pathname.includes(`/reports/${item.id}`),
    )?.id ?? "overview";

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#faf8f7_0%,#ffffff_24rem)]">
      <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="relative overflow-hidden rounded-2xl border border-[#6b1d24]/10 bg-white shadow-[0_18px_60px_-42px_rgba(69,18,22,.55)]">
          <div className="absolute inset-y-0 end-0 w-72 bg-[radial-gradient(circle_at_center,rgba(107,29,36,.12),transparent_68%)]" />
          <div className="relative flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#6b1d24]/7 px-3 py-1 text-xs font-semibold tracking-wide text-[#6b1d24]">
                <Sparkles className="h-3.5 w-3.5" />
                {lang === "ar" ? "رؤى الأعمال" : "BUSINESS INTELLIGENCE"}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#24191a] sm:text-4xl">
                {lang === "ar" ? "التقارير والتحليلات" : "Reports & analytics"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {lang === "ar"
                  ? "حوّل بيانات متجرك إلى قرارات واضحة حول المبيعات والمنتجات والعملاء."
                  : "Turn store activity into clear decisions across sales, products, and customers."}
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {lang === "ar" ? "بيانات آمنة وخاصة بمتجرك" : "Secure, store-scoped data"}
            </div>
          </div>
        </section>

        <nav className="scrollbar-none flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2 shadow-[0_10px_35px_-28px_rgba(44,24,26,.45)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = current === item.id;
            return (
              <Link
                key={item.id}
                to={item.path}
                params={{ slug }}
                className={cn(
                  "flex min-w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                  active
                    ? "bg-[#5b141a] text-white shadow-[0_8px_20px_-10px_rgba(91,20,26,.8)]"
                    : "text-muted-foreground hover:bg-[#6b1d24]/6 hover:text-[#5b141a]",
                )}
              >
                <Icon className="h-4 w-4" />
                {lang === "ar" ? item.ar : item.en}
              </Link>
            );
          })}
        </nav>

        <Outlet />
      </div>
    </div>
  );
}
