import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { type ProductRow } from "@/routes/$slug.index";
import { ProductGrid } from "@/components/storefront/product-grid";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { StorefrontPageContent } from "@/routes/$slug.page.$idx";
import { faviconType } from "@/lib/favicon";
import { ResponsiveImage } from "@/components/responsive-media";

function getDescendantCategories(catId: string, categories: any[]): any[] {
  const descendants: any[] = [];
  const queue = categories.filter((c) => c.parent_id === catId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    descendants.push(current);
    const children = categories.filter((c) => c.parent_id === current.id);
    queue.push(...children);
  }
  return descendants;
}

export const Route = createFileRoute("/$slug/$category")({
  headers: () => ({
    "Cache-Control": "public, max-age=10, stale-while-revalidate=60",
  }),
  loader: async ({ params }) => {
    const { data: baseBrand, error: brandError } = await supabase
      .from("brands")
      .select("id, name_en, name_ar, logo_url")
      .eq("slug", params.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (brandError || !baseBrand) return { page: null, brand: null, faviconUrl: null };
    const { data: seoBrand } = await supabase
      .from("brands")
      .select("meta_title, meta_description")
      .eq("id", baseBrand.id)
      .maybeSingle();
    const brand = {
      ...baseBrand,
      meta_title: (seoBrand as any)?.meta_title ?? null,
      meta_description: (seoBrand as any)?.meta_description ?? null,
    };
    const { data: settings } = await supabase
      .from("brand_public_settings")
      .select("pages, logo_url, favicon_url")
      .eq("brand_id", brand.id)
      .maybeSingle();
    const pages = Array.isArray((settings as any)?.pages) ? (settings as any).pages : [];
    const page = pages.find((item: any) => item?.slug === params.category) ?? null;
    return {
      page,
      brand,
      faviconUrl:
        (settings as any)?.favicon_url || (settings as any)?.logo_url || brand.logo_url || null,
    };
  },
  head: ({ loaderData }) => {
    const page = loaderData?.page as any;
    const brand = loaderData?.brand as any;
    if (!page || !brand) return {};
    const title =
      page.meta_title || page.title_en || page.title_ar || brand.meta_title || brand.name_en;
    const description =
      page.meta_description || brand.meta_description || `Learn more about ${brand.name_en}.`;
    const image = page.image_url || brand.logo_url || "https://boutq.store/og-placeholder.png";
    const favicon = loaderData?.faviconUrl;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: favicon
        ? [
            {
              rel: "icon",
              href: favicon,
              ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}),
            },
          ]
        : [],
    };
  },
  component: CategoryPage,
  notFoundComponent: CategoryUnavailable,
});

function CategoryPage() {
  const { brand, lang, t, settings } = useStorefront();
  const { category: categorySlug } = Route.useParams();
  const cmsPage = settings.pages.find((page) => page.slug === categorySlug);
  const [sort, setSort] = useState<"new" | "old" | "price-low" | "price-high">("new");
  const navigate = useNavigate();
  const smartKind = ["new-arrivals", "new"].includes(categorySlug)
    ? "new"
    : ["most-selling", "best-sellers", "best-selling"].includes(categorySlug)
      ? "best"
      : ["offers", "sale", "discounts"].includes(categorySlug)
        ? "offers"
        : null;

  // Fetch all active categories to reconstruct full parent-child routing context locally
  const categoriesQuery = useQuery({
    queryKey: ["storefront", brand.slug, "all-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_en, name_ar, parent_id, image_url")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        slug: string;
        name_en: string;
        name_ar: string | null;
        parent_id: string | null;
        image_url: string | null;
      }>;
    },
    staleTime: 5 * 60_000,
  });

  const activeCategory = useMemo(() => {
    if (smartKind) return null;
    return categoriesQuery.data?.find((c) => c.slug === categorySlug) || null;
  }, [categoriesQuery.data, categorySlug, smartKind]);

  // URL Deep-Linking & Client-side filter State
  const [selectedSubCategorySlugs, setSelectedSubCategorySlugs] = useState<string[]>([]);
  const selectedSubCategorySlug = selectedSubCategorySlugs[0] || null;
  const selectedSubSubCategorySlug = selectedSubCategorySlugs[1] || null;

  useEffect(() => {
    setSelectedSubCategorySlugs([]);
  }, [categorySlug]);

  const categoryQuery = useQuery({
    queryKey: ["storefront", brand.slug, "category", categorySlug],
    queryFn: async () => {
      if (smartKind)
        return {
          id: smartKind,
          slug: categorySlug,
          name_en:
            smartKind === "new" ? "New arrivals" : smartKind === "best" ? "Most selling" : "Sale",
          name_ar:
            smartKind === "new" ? "وصل حديثاً" : smartKind === "best" ? "الأكثر مبيعاً" : "تنزيلات",
          image_url: null,
        };
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, slug, name_en, name_ar, image_url, parent_id")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .eq("slug", categorySlug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as {
        id: string;
        slug: string;
        name_en: string;
        name_ar: string | null;
        image_url: string | null;
        parent_id: string | null;
      };
    },
    enabled: !cmsPage,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const category = categoryQuery.data;

  // Parent Category Product Rollup
  const productsQuery = useQuery({
    queryKey: [
      "storefront",
      brand.slug,
      "category-products-rollup",
      categorySlug,
      activeCategory?.id,
      smartKind,
      categoriesQuery.data?.length,
    ],
    enabled:
      (Boolean(activeCategory) || Boolean(smartKind)) && !cmsPage && !categoriesQuery.isLoading,
    queryFn: async () => {
      if (smartKind === "best") {
        const { data: ranked, error: rankError } = await (supabase.rpc as any)(
          "get_storefront_best_sellers",
          { p_brand_slug: brand.slug, p_limit: 24 },
        );
        if (rankError) throw rankError;
        const ids = (ranked ?? []).map((row: any) => row.product_id);
        if (!ids.length) return [] as ProductRow[];
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)",
          )
          .eq("brand_id", brand.id)
          .eq("is_active", true)
          .in("id", ids);
        if (error) throw error;
        const order = new Map<string, number>(
          ids.map((id: string, index: number) => [id, index] as [string, number]),
        );
        return ((data ?? []) as unknown as ProductRow[]).sort(
          (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99),
        );
      }
      if (smartKind === "new" || smartKind === "offers") {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)",
          )
          .eq("brand_id", brand.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(smartKind === "new" ? 60 : 200);
        if (error) throw error;
        const rows = (data ?? []) as unknown as ProductRow[];
        return smartKind === "offers"
          ? rows.filter((product) =>
              product.product_variants.some(
                (variant) =>
                  Number(variant.original_price || 0) > Number(variant.selling_price || 0),
              ),
            )
          : rows;
      }

      const descendants = getDescendantCategories(activeCategory!.id, categoriesQuery.data ?? []);
      const rollupCategories = [activeCategory!, ...descendants];

      const values = [
        ...new Set(rollupCategories.flatMap((c) => [c.slug, c.name_en]).filter(Boolean)),
      ];
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .in("category", values)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const title = category
    ? lang === "ar"
      ? category.name_ar || category.name_en
      : category.name_en
    : "";

  // Construct dynamic rows of pills recursively for each selected subcategory level
  const rows = useMemo(() => {
    if (!activeCategory || categoriesQuery.isLoading) return [];

    const rowsList = [];
    const products = productsQuery.data ?? [];
    const categories = categoriesQuery.data ?? [];

    // Determine the starting parent ID for subcategories
    let currentParentId = activeCategory.id;
    let levelIndex = 0;

    while (true) {
      // Fetch subcategories under currentParentId
      const levelCategories = categories.filter((c) => c.parent_id === currentParentId);

      if (levelCategories.length > 0) {
        // Filter out empty subcategory chips that do not have active products in their subtree
        const activeLevelCategories = levelCategories.filter((cat) => {
          const descendants = getDescendantCategories(cat.id, categories);
          const matchValues = new Set(
            [
              cat.slug,
              cat.name_en,
              ...descendants.map((d) => d.slug).filter(Boolean),
              ...descendants.map((d) => d.name_en).filter(Boolean),
            ].filter(Boolean),
          );
          return products.some((p) => p.category && matchValues.has(p.category));
        });

        if (activeLevelCategories.length > 0) {
          rowsList.push({
            levelIndex,
            categories: activeLevelCategories,
            activeSlug: selectedSubCategorySlugs[levelIndex] || null,
          });
        } else {
          break;
        }
      } else {
        break;
      }

      // Move to the next level down the selected path
      const selectedSlugForLevel = selectedSubCategorySlugs[levelIndex];
      if (selectedSlugForLevel) {
        const selectedCategoryItem = levelCategories.find(
          (c) => c.slug === selectedSlugForLevel || c.name_en === selectedSlugForLevel,
        );
        if (selectedCategoryItem) {
          currentParentId = selectedCategoryItem.id;
          levelIndex++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return rowsList;
  }, [
    categoriesQuery.data,
    categoriesQuery.isLoading,
    productsQuery.data,
    selectedSubCategorySlugs,
    activeCategory,
  ]);

  const filteredProducts = useMemo(() => {
    let list = productsQuery.data ?? [];
    const leafSlug = selectedSubCategorySlugs[selectedSubCategorySlugs.length - 1] || null;
    if (leafSlug) {
      const selectedCat = categoriesQuery.data?.find(
        (c) => c.slug === leafSlug || c.name_en === leafSlug,
      );
      if (selectedCat) {
        const descendants = getDescendantCategories(selectedCat.id, categoriesQuery.data ?? []);
        const targetValues = new Set(
          [
            selectedCat.slug,
            selectedCat.name_en,
            ...descendants.map((d) => d.slug).filter(Boolean),
            ...descendants.map((d) => d.name_en).filter(Boolean),
          ].filter(Boolean),
        );
        list = list.filter((p) => p.category && targetValues.has(p.category));
      } else {
        const targetValues = new Set([leafSlug.toLowerCase().replace(/\s+/g, "-")]);
        list = list.filter((p) => p.category && targetValues.has(p.category.toLowerCase()));
      }
    }
    const rows = [...list];
    if (smartKind === "best" && sort === "new") return rows;
    const price = (product: ProductRow) =>
      Math.min(
        ...product.product_variants
          .map((variant) => Number(variant.selling_price))
          .filter((value) => value >= 0),
        Number.MAX_SAFE_INTEGER,
      );
    return rows.sort((a, b) =>
      sort === "old"
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : sort === "price-low"
          ? price(a) - price(b)
          : sort === "price-high"
            ? price(b) - price(a)
            : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [productsQuery.data, selectedSubCategorySlugs, sort, smartKind, categoriesQuery.data]);

  const breadcrumbs = useMemo(() => {
    if (smartKind || !activeCategory || categoriesQuery.isLoading) return null;
    const list: Array<{ label: string; to: string; params: Record<string, string> }> = [
      {
        label: t("الرئيسية", "Home"),
        to: "/$slug",
        params: { slug: brand.slug },
      },
    ];

    if (activeCategory.parent_id) {
      const parentCat = categoriesQuery.data?.find((c) => c.id === activeCategory.parent_id);
      if (parentCat) {
        list.push({
          label:
            (lang === "ar"
              ? parentCat.name_ar || parentCat.name_en
              : parentCat.name_en || parentCat.name_ar) ?? "",
          to: "/$slug/$category",
          params: { slug: brand.slug, category: parentCat.slug || parentCat.name_en },
        });
      }
    }

    list.push({
      label:
        (lang === "ar"
          ? activeCategory.name_ar || activeCategory.name_en
          : activeCategory.name_en || activeCategory.name_ar) ?? "",
      to: "/$slug/$category",
      params: { slug: brand.slug, category: activeCategory.slug || activeCategory.name_en },
    });

    return list;
  }, [
    activeCategory,
    categoriesQuery.data,
    categoriesQuery.isLoading,
    brand.slug,
    lang,
    t,
    smartKind,
  ]);

  const BackIcon = lang === "ar" ? ChevronRight : ChevronLeft;

  if (cmsPage) return <StorefrontPageContent page={cmsPage} />;

  return (
    <main>
      <section
        className="border-b"
        style={{ backgroundColor: "var(--sf-header-bg)", color: "var(--sf-header-fg)" }}
      >
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          {breadcrumbs ? (
            <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs font-semibold opacity-70">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <div key={idx} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="opacity-50">/</span>}
                    {isLast ? (
                      <span className="opacity-100">{crumb.label}</span>
                    ) : (
                      <Link
                        to={crumb.to as any}
                        params={crumb.params as any}
                        className="hover:underline opacity-80 hover:opacity-100 transition-opacity"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </div>
                );
              })}
            </nav>
          ) : (
            <Link
              to="/$slug"
              params={{ slug: brand.slug }}
              className="mb-5 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
            >
              <BackIcon className="h-4 w-4" />
              {t("العودة للمتجر", "Back to store")}
            </Link>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-5">
              {category?.image_url && (
                <ResponsiveImage
                  src={category.image_url}
                  preset="thumb"
                  sizes="112px"
                  alt=""
                  className="h-20 w-20 rounded-2xl object-cover sm:h-28 sm:w-28"
                />
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                  {t("القسم", "Category")}
                </p>
                <h1
                  className="mt-1 font-display text-3xl sm:text-5xl"
                  style={{ color: "var(--sf-heading)" }}
                >
                  {title}
                </h1>
              </div>
            </div>

            {/* Horizontal Subcategory Filter Chips */}
            {rows.length > 0 && (
              <div className="w-full space-y-3">
                <style>{`
                  .no-scrollbar::-webkit-scrollbar { display: none; }
                  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                `}</style>
                {rows.map((row) => (
                  <div
                    key={`row-level-${row.levelIndex}`}
                    className={`w-full ${row.levelIndex > 0 ? "border-t border-slate-100/50 pt-2 animate-in fade-in slide-in-from-top-1 duration-200" : "mt-4"}`}
                  >
                    <div className="flex flex-wrap gap-2 items-center overflow-x-auto no-scrollbar py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubCategorySlugs(
                            selectedSubCategorySlugs.slice(0, row.levelIndex),
                          );
                        }}
                        className={`min-h-9 px-4 py-1.5 rounded-full text-sm transition-all shrink-0 ${
                          row.activeSlug === null
                            ? "bg-slate-900 text-white shadow-sm font-medium"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 font-normal"
                        }`}
                      >
                        {t("الكل", "All")}
                      </button>
                      {row.categories.map((sub) => {
                        const label =
                          lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
                        const active = row.activeSlug === sub.slug;
                        const hasSubSubs = categoriesQuery.data?.some(
                          (c) => c.parent_id === sub.id,
                        );
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              if (active) {
                                setSelectedSubCategorySlugs(
                                  selectedSubCategorySlugs.slice(0, row.levelIndex),
                                );
                              } else {
                                setSelectedSubCategorySlugs([
                                  ...selectedSubCategorySlugs.slice(0, row.levelIndex),
                                  sub.slug,
                                ]);
                              }
                            }}
                            className={`min-h-9 px-4 py-1.5 rounded-full text-sm transition-all shrink-0 flex items-center gap-1.5 ${
                              active
                                ? "bg-slate-900 text-white shadow-sm font-medium"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700 font-normal"
                            }`}
                          >
                            <span>{label}</span>
                            {hasSubSubs && (
                              <ChevronDown
                                className={`h-3 w-3 transition-transform duration-200 ${active ? "rotate-180" : ""}`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex justify-end">
          <select
            id="category-sort"
            name="category-sort"
            aria-label={t("ترتيب المنتجات", "Sort products")}
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="h-11 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="new">{t("الأحدث أولاً", "Newest first")}</option>
            <option value="old">{t("الأقدم أولاً", "Oldest first")}</option>
            <option value="price-low">{t("السعر: الأقل أولاً", "Price: low to high")}</option>
            <option value="price-high">{t("السعر: الأعلى أولاً", "Price: high to low")}</option>
          </select>
        </div>

        <ProductGrid
          products={filteredProducts}
          loading={categoryQuery.isLoading || productsQuery.isLoading || categoriesQuery.isLoading}
          categoryEmpty
          onViewAll={() => {
            void navigate({ to: "/$slug", params: { slug: brand.slug } });
          }}
        />
      </section>
    </main>
  );
}

function CategoryUnavailable() {
  const { brand, t } = useStorefront();
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-3xl font-display">{t("القسم غير متاح", "Category unavailable")}</h1>
      <Link to="/$slug" params={{ slug: brand.slug }} className="mt-5 inline-block underline">
        {t("العودة للمتجر", "Back to store")}
      </Link>
    </div>
  );
}
