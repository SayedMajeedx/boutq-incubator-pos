import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { ResponsiveImage } from "@/components/responsive-media";
import { ProductGrid } from "@/components/storefront/product-grid";
import { fetchActiveBrandIdentity, fetchStorefrontSearch } from "@/lib/storefront-queries";

type SearchParams = { q: string };

type ProductRow = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string | null;
  image_url: string | null;
  media: Array<{ type: "image" | "video"; url: string }> | null;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock_main: number;
  }>;
};

export const Route = createFileRoute("/$slug/search")({
  validateSearch: (s): SearchParams => ({ q: typeof s.q === "string" ? s.q : "" }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ params, deps }) => {
    const term = String(deps.q || "").trim();
    const brand = await fetchActiveBrandIdentity(params.slug);
    return {
      term,
      results: brand ? await fetchStorefrontSearch(brand.id, term) : [],
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { brand, currency, lang, t } = useStorefront();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const term = String(search.q || "").trim();
  const [sort, setSort] = useState<"new" | "price-low" | "price-high">("new");

  const { data, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "search", term],
    queryFn: () => fetchStorefrontSearch(brand.id, term) as Promise<ProductRow[]>,
    initialData: loaderData.term === term ? (loaderData.results as ProductRow[]) : undefined,
    enabled: Boolean(term),
  });

  useEffect(() => {
    if (term) {
      trackStorefrontEvent("search", { query: term });
    }
  }, [term]);

  const results = useMemo(() => {
    const rows = data ?? [];
    if (sort === "new") return rows;
    const price = (product: ProductRow) =>
      Number(product.product_variants?.[0]?.selling_price ?? Number.MAX_SAFE_INTEGER);
    return rows.sort((a, b) =>
      sort === "price-low" ? price(a) - price(b) : sort === "price-high" ? price(b) - price(a) : 0,
    );
  }, [data, sort]);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12 text-start">
      <h1 className="font-display text-2xl sm:text-3xl mb-2" style={{ color: "var(--sf-heading)" }}>
        {t("نتائج البحث", "Search results")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {term ? t(`عن "${term}"`, `for "${term}"`) : t("اكتب كلمة للبحث", "Type a search term")}
      </p>
      <div className="mb-6 flex justify-end">
        <select
          id="search-sort"
          name="search-sort"
          aria-label={t("ترتيب نتائج البحث", "Sort search results")}
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="h-11 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="new">{t("الأحدث", "Newest")}</option>
          <option value="price-low">{t("السعر: الأقل أولاً", "Price: low to high")}</option>
          <option value="price-high">{t("السعر: الأعلى أولاً", "Price: high to low")}</option>
        </select>
      </div>

      {term ? (
        <ProductGrid
          products={results as any[]}
          loading={isLoading}
          categoryEmpty={false}
          onViewAll={() => {}}
        />
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          {t("اكتب كلمة للبحث", "Type a search term")}
        </Card>
      )}
    </section>
  );
}
