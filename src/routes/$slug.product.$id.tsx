import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import {
  useStorefront,
  formatPrice,
  pickName,
  pickDescription,
  readableOn,
} from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useRef, useEffect } from "react";
import { formatSizeWithUnit } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  AlertCircle,
  Heart,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import {
  fetchActiveBrandIdentity,
  fetchBestSellerRows,
  fetchProductDetail,
  fetchRecommendationCatalog,
} from "@/lib/storefront-queries";
import { uploadPublicMedia } from "@/lib/r2-upload";

export const Route = createFileRoute("/$slug/product/$id")({
  loader: async ({ params }) => {
    const brand = await fetchActiveBrandIdentity(params.slug);
    if (!brand) return { product: null, recommendationCatalog: [], bestSellerRows: [] };

    const [product, recommendationCatalog, bestSellerRows] = await Promise.all([
      fetchProductDetail(brand.id, params.id),
      fetchRecommendationCatalog(brand.id),
      fetchBestSellerRows(brand.slug, 10),
    ]);

    return { product: product as any, recommendationCatalog, bestSellerRows };
  },
  component: ProductDetail,
});

type Variant = {
  id: string;
  size: string | null;
  size_unit: string | null;
  color: string | null;
  fabric: string | null;
  selling_price: number;
  original_price: number | null;
  stock_main: number;
  image_url?: string | null;
};

type CustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
  options?: string[];
  required?: boolean;
};

type Product = {
  id: string;
  category: string | null;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  media: unknown;
  custom_fields: CustomField[] | null;
  product_variants: Variant[];
  base_price?: number | null;
  original_price?: number | null;
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
};

type RecommendationProduct = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  category: string | null;
  image_url: string | null;
  media: unknown;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock_main: number;
  }>;
};

/** Natural sort key: extract leading number so "52" < "54" < "60". */
function variantSortKey(v: Variant): [number, string] {
  const label = [v.size, v.color, v.fabric].filter(Boolean).join(" · ");
  const m = /-?\d+(?:\.\d+)?/.exec(label);
  const num = m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  return [num, label.toLowerCase()];
}

const COLOR_MAP: Record<string, string> = {
  blue: "#2563eb",
  red: "#dc2626",
  black: "#0f172a",
  white: "#ffffff",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  purple: "#9333ea",
  pink: "#db2777",
  brown: "#78350f",
  grey: "#4b5563",
  gray: "#4b5563",
  navy: "#1e3a8a",
  teal: "#0d9488",
  gold: "#d97706",
  silver: "#9ca3af",
  beige: "#fef3c7",

  أزرق: "#2563eb",
  أحمر: "#dc2626",
  أسود: "#0f172a",
  أبيض: "#ffffff",
  أخضر: "#16a34a",
  أصفر: "#eab308",
  برتقالي: "#ea580c",
  بنفسجي: "#9333ea",
  وردي: "#db2777",
  بني: "#78350f",
  رمادي: "#4b5563",
  كحلي: "#1e3a8a",
  ذهبي: "#d97706",
  فضي: "#9ca3af",
  بيج: "#fef3c7",
};

const parsePriceDelta = (valStr: string): number => {
  if (!valStr) return 0;
  const match = /\+\s*(\d+(?:\.\d+)?)\s*(?:BHD|BHD\b|د\.ب|BHD|BD\b|BD)?/i.exec(valStr);
  if (match) {
    return Number(match[1]);
  }
  return 0;
};

function ProductDetail({ splatId }: { splatId?: string } = {}) {
  const loaderData = Route.useLoaderData() as
    | {
        product: Product | null;
        recommendationCatalog: RecommendationProduct[];
        bestSellerRows: Array<{ product_id: string; units_sold: number }>;
      }
    | undefined;
  const params = Route.useParams() as any;
  const id = splatId || params?.id || params?._splat || params?.["_"] || params?.["$"] || "";
  const { brand, settings, currency, lang, t, addToCart, isWishlisted, toggleWishlist } =
    useStorefront();
  const navigate = useNavigate();
  const [mediaIdx, setMediaIdx] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [cfValues, setCfValues] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedFabric, setSelectedFabric] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<Record<string, boolean>>({});
  const optionsRef = useRef<HTMLDivElement | null>(null);

  const { data: product, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "product", id],
    initialData: loaderData?.product ?? undefined,
    queryFn: async () => {
      const primaryFields =
        "id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, base_price, product_variants(id, size, size_unit, color, fabric, selling_price, original_price, stock_main, image_url)";
      const fullFields = `${primaryFields}, variant_label_size_ar, variant_label_size_en, variant_label_color_ar, variant_label_color_en, variant_label_fabric_ar, variant_label_fabric_en`;

      const fetchByTargetId = async (targetId: string) => {
        // Try full fields with custom variant labels
        const { data: fullData, error: fullError } = await supabase
          .from("products")
          .select(fullFields)
          .eq("id", targetId)
          .eq("brand_id", brand.id)
          .eq("is_active", true)
          .maybeSingle();

        if (fullData) return fullData as unknown as Product;

        // Resilient fallback if full fields query fails due to missing column permissions
        if (fullError) {
          const { data: fallbackData } = await supabase
            .from("products")
            .select(primaryFields)
            .eq("id", targetId)
            .eq("brand_id", brand.id)
            .eq("is_active", true)
            .maybeSingle();

          if (fallbackData) return fallbackData as unknown as Product;
        }

        return null;
      };

      // 1. Try direct exact match with id
      const directData = await fetchByTargetId(id);
      if (directData) return directData;

      // 2. Extract full path after /product/ to catch corrupted URLs with slashes (e.g. 6d8a9ec5-ed96-461b-b5/a-33d84/9e04b8)
      let fullPathSuffix = id;
      if (typeof window !== "undefined") {
        const match = window.location.pathname.match(/\/product\/(.+)$/i);
        if (match?.[1]) {
          fullPathSuffix = decodeURIComponent(match[1]);
        }
      }

      // Repair corrupted URL where '7' was replaced by '/' or encoded
      const repairedId = fullPathSuffix.replace(/\//g, "7").trim();
      if (repairedId && repairedId !== id) {
        const repairedData = await fetchByTargetId(repairedId);
        if (repairedData) {
          // Silently clean up browser URL to canonical format
          if (typeof window !== "undefined" && window.history?.replaceState) {
            const canonicalUrl = `/${brand.slug}/product/${repairedData.id}`;
            window.history.replaceState(null, "", canonicalUrl);
          }
          return repairedData;
        }
      }

      return null;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!product) return;
    const first = product.product_variants?.[0];
    trackStorefrontEvent(
      "view_item",
      {
        currency,
        value: Number(first?.selling_price ?? 0),
        content_ids: [product.id],
        content_type: "product",
        items: [
          {
            item_id: product.id,
            item_name: pickName(lang, product),
            price: Number(first?.selling_price ?? 0),
          },
        ],
      },
      product.id,
    );
  }, [product, currency, lang]);

  const { data: recommendationCatalog = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "product-recommendations"],
    initialData: loaderData?.recommendationCatalog ?? undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, category, image_url, media, product_variants(id, selling_price, original_price, stock_main)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecommendationProduct[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: bestSellerRows = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "best-sellers"],
    initialData: loaderData?.bestSellerRows ?? undefined,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_storefront_best_sellers", {
        p_brand_slug: brand.slug,
        p_limit: 10,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; units_sold: number }>;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const relatedProducts = useMemo(
    () =>
      product?.category
        ? recommendationCatalog
            .filter((item) => item.id !== product.id && item.category === product.category)
            .slice(0, 8)
        : [],
    [product, recommendationCatalog],
  );
  const relatedIds = useMemo(
    () => new Set(relatedProducts.map((item) => item.id)),
    [relatedProducts],
  );
  const bestSellingProducts = useMemo(() => {
    const ranks = new Map(bestSellerRows.map((row, index) => [row.product_id, index]));
    return recommendationCatalog
      .filter((item) => item.id !== product?.id && !relatedIds.has(item.id) && ranks.has(item.id))
      .sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99))
      .slice(0, 8);
  }, [bestSellerRows, product?.id, recommendationCatalog, relatedIds]);

  const media = useMemo(() => {
    if (!product) return [];
    const arr = Array.isArray(product.media)
      ? (product.media as Array<{
          type: "image" | "video";
          url: string;
          stream_uid?: string;
          stream_iframe_url?: string;
          poster_url?: string;
        }>)
      : [];
    if (arr.length > 0) return arr;
    if (product.image_url) return [{ type: "image" as const, url: product.image_url }];
    return [];
  }, [product]);

  const variants = useMemo<Variant[]>(() => {
    const list = product?.product_variants ?? [];
    return [...list].sort((a, b) => {
      const [an, al] = variantSortKey(a);
      const [bn, bl] = variantSortKey(b);
      if (an !== bn) return an - bn;
      return al.localeCompare(bl, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [product]);
  const variant = variantId ? variants.find((v) => v.id === variantId) : null;

  const uniqueColors = useMemo(() => {
    const colors = variants.map((v) => v.color).filter(Boolean) as string[];
    return Array.from(new Set(colors));
  }, [variants]);

  const uniqueSizes = useMemo(() => {
    const sizes = variants.map((v) => v.size).filter(Boolean) as string[];
    return Array.from(new Set(sizes));
  }, [variants]);

  const uniqueFabrics = useMemo(() => {
    const fabrics = variants.map((v) => v.fabric).filter(Boolean) as string[];
    return Array.from(new Set(fabrics));
  }, [variants]);

  // Dynamic out of stock maps for each option dimension, checking current other active options
  const isColorOutOfStock = useMemo(() => {
    return uniqueColors.reduce(
      (acc, col) => {
        const matching = variants.filter((v) => {
          const colorMatch = v.color === col;
          const sizeMatch = !selectedSize || v.size === selectedSize;
          const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
          return colorMatch && sizeMatch && fabricMatch;
        });
        acc[col] = matching.length === 0 || matching.every((v) => (v.stock_main ?? 0) <= 0);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [uniqueColors, selectedSize, selectedFabric, variants]);

  const isSizeOutOfStock = useMemo(() => {
    return uniqueSizes.reduce(
      (acc, sz) => {
        const matching = variants.filter((v) => {
          const sizeMatch = v.size === sz;
          const colorMatch = !selectedColor || v.color === selectedColor;
          const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
          return colorMatch && sizeMatch && fabricMatch;
        });
        acc[sz] = matching.length === 0 || matching.every((v) => (v.stock_main ?? 0) <= 0);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [uniqueSizes, selectedColor, selectedFabric, variants]);

  const isFabricOutOfStock = useMemo(() => {
    return uniqueFabrics.reduce(
      (acc, fb) => {
        const matching = variants.filter((v) => {
          const fabricMatch = v.fabric === fb;
          const colorMatch = !selectedColor || v.color === selectedColor;
          const sizeMatch = !selectedSize || v.size === selectedSize;
          return colorMatch && sizeMatch && fabricMatch;
        });
        acc[fb] = matching.length === 0 || matching.every((v) => (v.stock_main ?? 0) <= 0);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [uniqueFabrics, selectedColor, selectedSize, variants]);

  // Auto-initialize attributes only when a single variant is available
  useEffect(() => {
    if (variants.length === 1 && !variantId) {
      const first = variants[0];
      setVariantId(first.id);
      setSelectedColor(first.color ?? null);
      setSelectedSize(first.size ?? null);
      setSelectedFabric(first.fabric ?? null);
    }
  }, [variants, variantId]);

  // Sync selected attributes back to variantId
  useEffect(() => {
    const match = variants.find((v) => {
      const colorMatch = !selectedColor || v.color === selectedColor;
      const sizeMatch = !selectedSize || v.size === selectedSize;
      const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
      return colorMatch && sizeMatch && fabricMatch;
    });
    if (match) {
      setVariantId(match.id);
    } else {
      setVariantId(null);
    }
  }, [selectedColor, selectedSize, selectedFabric, variants]);

  // Dynamic image swapping based on selected color name matching media filename/URL
  useEffect(() => {
    if (!selectedColor) return;
    const colorLower = selectedColor.toLowerCase();
    const idx = media.findIndex((m) => {
      if (m.type !== "image") return false;
      const urlLower = m.url.toLowerCase();
      return urlLower.includes(colorLower) || urlLower.includes(encodeURIComponent(colorLower));
    });
    if (idx !== -1) {
      setMediaIdx(idx);
    }
  }, [selectedColor, media]);

  const customFields = useMemo<CustomField[]>(
    () => (Array.isArray(product?.custom_fields) ? (product!.custom_fields as CustomField[]) : []),
    [product],
  );
  useEffect(() => {
    if (!product?.id) return;
    const key = `product-view:${product.id}:${new Date().toISOString().slice(0, 10)}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    void (supabase.rpc as any)("record_storefront_product_engagement", {
      p_brand_slug: brand.slug,
      p_product_id: product.id,
      p_event: "view",
    });
  }, [brand.slug, product?.id]);

  const selectedAddOnPrice = useMemo(() => {
    let total = 0;
    for (const f of customFields) {
      const val = cfValues[f.key];
      if (val) {
        total += parsePriceDelta(val);
      }
    }
    return total;
  }, [customFields, cfValues]);

  const basePrice = Number(product?.base_price || 0);

  // Find all variants that match the currently selected attributes (even if partially selected)
  const matchingVariants = useMemo(() => {
    return variants.filter((v) => {
      const colorMatch = !selectedColor || v.color === selectedColor;
      const sizeMatch = !selectedSize || v.size === selectedSize;
      const fabricMatch = !selectedFabric || v.fabric === selectedFabric;
      return colorMatch && sizeMatch && fabricMatch;
    });
  }, [selectedColor, selectedSize, selectedFabric, variants]);

  // Compute prices for matching variants
  const matchingPrices = useMemo(() => {
    return matchingVariants.map(
      (v) => basePrice + Number(v.selling_price || 0) + selectedAddOnPrice,
    );
  }, [matchingVariants, basePrice, selectedAddOnPrice]);

  if (isLoading && !product) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid md:grid-cols-2 gap-8">
        <Skeleton className="aspect-square rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Card className="p-8">
          <p className="mb-4">{t("لم يتم العثور على المنتج.", "Product not found.")}</p>
          <Link to="/$slug" params={{ slug: brand.slug }} className="underline">
            {t("العودة للمتجر", "Back to store")}
          </Link>
        </Card>
      </div>
    );
  }

  const hasVariants = variants.length > 0;

  const minMatchingPrice =
    matchingPrices.length > 0 ? Math.min(...matchingPrices) : basePrice + selectedAddOnPrice;
  const maxMatchingPrice =
    matchingPrices.length > 0 ? Math.max(...matchingPrices) : basePrice + selectedAddOnPrice;

  // Single matched variant (if unique)
  const isUniqueVariantMatched = matchingVariants.length === 1;
  const matchedVariant = isUniqueVariantMatched ? matchingVariants[0] : null;

  // Final displayPrice (use the unique matched variant, or fallback to minMatchingPrice)
  const displayPrice = matchedVariant
    ? basePrice + Number(matchedVariant.selling_price || 0) + selectedAddOnPrice
    : minMatchingPrice;

  const maxStock = variant?.stock_main ?? 0;

  const displayName = pickName(lang, product);
  const displayDescription = pickDescription(lang, product);

  const cfLabel = (f: CustomField) => {
    const label = lang === "ar" ? f.label_ar || f.label_en : f.label_en || f.label_ar;
    if (label) return label;
    if (/^f\d+$/.test(f.key)) {
      return lang === "ar"
        ? "النص المطلوب / تفاصيل إضافية"
        : "Required Text / Special Instructions";
    }
    return f.key;
  };

  const primary = settings.primary_color || "#111111";
  const primaryFg = readableOn(primary);

  const scrollToOptions = () => {
    optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const validate = (): string | null => {
    if (hasVariants && !variant) {
      return t("يرجى اختيار مقاس/خيار أولاً", "Please select a size or option first");
    }
    if (variant && variant.stock_main <= 0) {
      return t("هذا الخيار غير متوفر حالياً", "This option is out of stock");
    }
    for (const f of customFields) {
      if (f.required && !(cfValues[f.key] ?? "").trim()) {
        return t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`);
      }
    }
    return null;
  };

  const doAdd = (thenBuy = false) => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      toast.error(err);
      scrollToOptions();
      return;
    }
    if (!variant) {
      const msg = t("يرجى اختيار خيار أولاً", "Please select an option first");
      setErrorMsg(msg);
      toast.error(msg);
      scrollToOptions();
      return;
    }
    setErrorMsg(null);
    const custom = customFields
      .map((f) => {
        const val = (cfValues[f.key] ?? "").trim();
        const price_delta = parsePriceDelta(val);
        return {
          key: f.key,
          label_ar: f.label_ar,
          label_en: f.label_en,
          value: val,
          type: f.type,
          price_delta,
        };
      })
      .filter((v) => v.value.length > 0);

    const fileField = customFields.find((f) => f.type === "file");
    const file_url = fileField ? (cfValues[fileField.key] ?? "").trim() : "";
    const textField = customFields.find((f) => f.type === "text");
    const custom_text = textField ? (cfValues[textField.key] ?? "").trim() : "";

    const selected_customizations = {
      options: custom.map((c) => ({
        name: lang === "ar" ? c.label_ar || c.label_en : c.label_en || c.label_ar,
        value: c.value,
        price_delta: c.price_delta,
      })),
      custom_text,
      file_url,
    };

    addToCart({
      cart_line_id: "",
      variant_id: variant!.id,
      product_id: product.id,
      name: displayName,
      name_ar: product.name_ar,
      name_en: product.name_en,
      image:
        variant?.image_url ||
        media.find((m) => m.type === "image")?.url ||
        product.image_url ||
        null,
      price: displayPrice,
      original_price: originalPriceWithAddons > displayPrice ? originalPriceWithAddons : null,
      size: variant!.size,
      color: variant!.color,
      fabric: variant!.fabric,
      qty,
      max_stock: variant!.stock_main,
      custom_fields: custom,
      selected_customizations,
    } as any);
    if (thenBuy) {
      navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
    } else {
      toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));
    }
  };

  const isRange = minMatchingPrice !== maxMatchingPrice;
  const priceLabel = isRange
    ? `${formatPrice(minMatchingPrice, currency, lang)} – ${formatPrice(maxMatchingPrice, currency, lang)}`
    : displayPrice > 0
      ? formatPrice(displayPrice, currency, lang)
      : t("السعر عند الطلب", "Price on request");

  // Calculate original price only when displaying a single price
  const variantPriceDelta = variant ? Number(variant.selling_price || 0) : 0;
  const variantOriginalDelta = variant ? Number(variant.original_price || 0) : 0;
  const productOriginalPrice = Number((product as any).original_price || 0);

  const originalPrice =
    !isRange && variantOriginalDelta > variantPriceDelta
      ? basePrice + variantOriginalDelta
      : !isRange && productOriginalPrice > basePrice
        ? productOriginalPrice + variantPriceDelta
        : 0;

  const originalPriceWithAddons = originalPrice > 0 ? originalPrice + selectedAddOnPrice : 0;
  const discountPercent =
    originalPriceWithAddons > displayPrice
      ? Math.round((1 - displayPrice / originalPriceWithAddons) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-10 pb-28 md:pb-10">
      <div className="grid md:grid-cols-2 gap-4 sm:gap-8">
        <div>
          <div className="relative aspect-square bg-muted rounded-2xl overflow-hidden">
            {variant?.image_url ? (
              <ResponsiveImage
                src={variant.image_url}
                preset="product"
                sizes="(min-width: 1024px) 55vw, 100vw"
                alt={displayName}
                className="w-full h-full object-cover"
                fetchPriority="high"
                loading="eager"
              />
            ) : media.length > 0 ? (
              <>
                {media[mediaIdx].type === "video" ? (
                  <OptimizedVideo
                    src={media[mediaIdx].stream_iframe_url ? undefined : media[mediaIdx].url}
                    streamIframeUrl={media[mediaIdx].stream_iframe_url}
                    poster={media[mediaIdx].poster_url ?? media[mediaIdx].url}
                    className="h-full w-full bg-black object-contain"
                    wrapperClassName="h-full w-full overflow-hidden bg-black"
                  />
                ) : (
                  <ResponsiveImage
                    src={media[mediaIdx].url}
                    preset="product"
                    sizes="(min-width: 1024px) 55vw, 100vw"
                    alt={displayName}
                    className="w-full h-full object-cover"
                    fetchPriority="high"
                    loading="eager"
                  />
                )}
                {media.length > 1 && (
                  <>
                    <button
                      onClick={() => setMediaIdx((i) => (i - 1 + media.length) % media.length)}
                      className="absolute top-1/2 left-2 -translate-y-1/2 bg-white/80 rounded-full p-2 shadow"
                      aria-label="previous"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setMediaIdx((i) => (i + 1) % media.length)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 bg-white/80 rounded-full p-2 shadow"
                      aria-label="next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </>
            ) : product.image_url ? (
              <ResponsiveImage
                src={product.image_url}
                preset="product"
                sizes="(min-width: 1024px) 55vw, 100vw"
                alt={displayName}
                className="w-full h-full object-cover"
                fetchPriority="high"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground">
                {t("لا توجد صورة", "No image")}
              </div>
            )}
          </div>
          {media.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {media.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setMediaIdx(i)}
                  className={`h-16 w-16 rounded-lg overflow-hidden shrink-0 border-2 ${
                    i === mediaIdx ? "border-current" : "border-transparent"
                  }`}
                  style={i === mediaIdx ? { borderColor: primary } : undefined}
                >
                  {m.type === "video" ? (
                    <div className="w-full h-full bg-black grid place-items-center text-white text-[10px]">
                      ▶
                    </div>
                  ) : (
                    <ResponsiveImage
                      src={m.url}
                      preset="thumb"
                      sizes="80px"
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-start justify-between gap-3 sm:mb-2">
            <h1 className="font-display text-2xl sm:text-3xl">{displayName}</h1>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => toggleWishlist(product.id)}
              aria-label={t("المفضلة", "Wishlist")}
            >
              <Heart
                className={`h-5 w-5 ${isWishlisted(product.id) ? "fill-red-600 text-red-600" : ""}`}
              />
            </Button>
          </div>
          <div
            className="mb-3 flex flex-wrap items-center gap-3 text-xl font-semibold sm:mb-4 sm:text-2xl"
            style={{ color: primary }}
          >
            <span>{priceLabel}</span>
            {originalPrice > displayPrice && (
              <span className="text-base font-normal text-muted-foreground line-through">
                {formatPrice(originalPrice, currency, lang)}
              </span>
            )}
            {discountPercent > 0 && (
              <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs text-white">
                {t(`وفر ${discountPercent}%`, `Save ${discountPercent}%`)}
              </span>
            )}
          </div>
          {displayDescription && (
            <p className="text-muted-foreground mb-4 sm:mb-6 whitespace-pre-line text-sm sm:text-base">
              {displayDescription}
            </p>
          )}

          {hasVariants && (
            <div ref={optionsRef} className="mb-6 space-y-4 scroll-mt-24">
              {/* 🔵 Circular Color Swatches */}
              {uniqueColors.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <span>
                      {(lang === "ar"
                        ? product.variant_label_color_ar
                        : product.variant_label_color_en) ||
                        product.variant_label_color_en ||
                        product.variant_label_color_ar ||
                        t("اللون", "Color")}
                      :
                    </span>
                    <span className="text-muted-foreground font-normal">{selectedColor}</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {uniqueColors.map((color) => {
                      const active = selectedColor === color;
                      const oos = isColorOutOfStock[color];
                      const hex = COLOR_MAP[color.toLowerCase()] || COLOR_MAP[color] || null;
                      const ringStyle = active ? { borderColor: primary } : {};
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            setSelectedColor(color);
                            setErrorMsg(null);
                          }}
                          className={`h-11 w-11 rounded-full border-2 transition-all flex items-center justify-center relative ${
                            active ? "scale-110 shadow-sm" : "border-transparent hover:scale-105"
                          } ${oos ? "opacity-45 cursor-not-allowed" : ""}`}
                          style={ringStyle}
                          title={color + (oos ? ` (${t("غير متوفر", "out of stock")})` : "")}
                          aria-label={color}
                        >
                          {hex ? (
                            <span
                              className="h-7 w-7 rounded-full border shadow-inner block relative overflow-hidden"
                              style={{ backgroundColor: hex }}
                            >
                              {oos && (
                                <span className="absolute inset-0 w-full h-[2px] bg-red-600/80 rotate-45 origin-center top-1/2 -translate-y-1/2" />
                              )}
                            </span>
                          ) : (
                            <span className="h-7 w-7 rounded-full border bg-muted flex items-center justify-center text-[10px] font-bold uppercase truncate shadow-inner relative overflow-hidden">
                              {color.slice(0, 2)}
                              {oos && (
                                <span className="absolute inset-0 w-full h-[2px] bg-red-600/80 rotate-45 origin-center top-1/2 -translate-y-1/2" />
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 📏 Size Selection Pills */}
              {uniqueSizes.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">
                    {(lang === "ar"
                      ? product.variant_label_size_ar
                      : product.variant_label_size_en) ||
                      product.variant_label_size_en ||
                      product.variant_label_size_ar ||
                      t("المقاس / خيار", "Size / Option")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uniqueSizes.map((sz) => {
                      const active = selectedSize === sz;
                      const oos = isSizeOutOfStock[sz];
                      const style = active
                        ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                        : {};
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => {
                            setSelectedSize(sz);
                            setErrorMsg(null);
                          }}
                          className={`min-h-11 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                            active ? "shadow-sm border-transparent" : "border-input bg-background"
                          } ${oos ? "line-through opacity-45 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 text-muted-foreground border-dashed" : "hover:border-foreground/45"}`}
                          style={style}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 🧵 Fabric Selection Pills (if any) */}
              {uniqueFabrics.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">
                    {(lang === "ar"
                      ? product.variant_label_fabric_ar
                      : product.variant_label_fabric_en) ||
                      product.variant_label_fabric_en ||
                      product.variant_label_fabric_ar ||
                      t("الخامة", "Fabric")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uniqueFabrics.map((fb) => {
                      const active = selectedFabric === fb;
                      const oos = isFabricOutOfStock[fb];
                      const style = active
                        ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                        : {};
                      return (
                        <button
                          key={fb}
                          type="button"
                          onClick={() => {
                            setSelectedFabric(fb);
                            setErrorMsg(null);
                          }}
                          className={`min-h-11 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                            active ? "shadow-sm border-transparent" : "border-input bg-background"
                          } ${oos ? "line-through opacity-45 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 text-muted-foreground border-dashed" : "hover:border-foreground/45"}`}
                          style={style}
                        >
                          {fb}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fallback general buttons if no properties could be isolated */}
              {uniqueColors.length === 0 &&
                uniqueSizes.length === 0 &&
                uniqueFabrics.length === 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">{t("الخيارات", "Options")}</div>
                    <div className="flex flex-wrap gap-2">
                      {variants.map((v) => {
                        const oos = v.stock_main <= 0;
                        const active = v.id === variantId;
                        const label =
                          [formatSizeWithUnit(v.size, v.size_unit, lang), v.color, v.fabric]
                            .filter(Boolean)
                            .join(" · ") || t("متغيّر", "Variant");
                        const style = active
                          ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                          : {};
                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={oos}
                            onClick={() => {
                              setVariantId(v.id);
                              setQty(1);
                              setErrorMsg(null);
                            }}
                            className={`min-h-11 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                              active
                                ? "shadow-sm"
                                : "border-input bg-background hover:border-foreground/40"
                            } ${oos ? "opacity-40 line-through cursor-not-allowed" : ""}`}
                            style={style}
                            aria-pressed={active}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}

          {customFields.length > 0 && (
            <div className="mb-4 space-y-4">
              {customFields.map((f) => {
                const label = cfLabel(f);
                const val = cfValues[f.key] ?? "";
                const set = (v: string) => {
                  setCfValues((s) => ({ ...s, [f.key]: v }));
                  setErrorMsg(null);
                };
                const isUploading = uploadingField[f.key];

                const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setUploadingField((prev) => ({ ...prev, [f.key]: true }));
                    const url = await uploadPublicMedia(brand.id, file, "product");
                    set(url);
                    toast.success(t("تم رفع الملف بنجاح", "File uploaded successfully"));
                  } catch (err: any) {
                    toast.error(err.message ?? t("فشل في رفع الملف", "File upload failed"));
                  } finally {
                    setUploadingField((prev) => ({ ...prev, [f.key]: false }));
                  }
                };

                return (
                  <div key={f.key} className="space-y-1">
                    <label className="block text-sm font-semibold mb-1">
                      {label}
                      {f.required && <span className="text-destructive ms-1">*</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">{t("اختر...", "Select...")}</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "file" ? (
                      <div className="space-y-2">
                        {val ? (
                          <div className="flex items-center justify-between p-3 border rounded-xl bg-muted/30">
                            <div className="flex items-center gap-3 min-w-0">
                              {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(val) ? (
                                <img
                                  src={val}
                                  alt=""
                                  className="h-12 w-12 rounded object-cover border"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded bg-primary/10 grid place-items-center text-primary text-xs font-bold uppercase">
                                  FILE
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground truncate">
                                  {t("الملف المرفوع", "Uploaded file")}
                                </div>
                                <a
                                  href={val}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary font-medium hover:underline truncate block"
                                >
                                  {val}
                                </a>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => set("")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={handleFileChange}
                              className="hidden"
                              id={`file-input-${f.key}`}
                              disabled={isUploading}
                            />
                            <label
                              htmlFor={`file-input-${f.key}`}
                              className={`flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-dashed border-muted-foreground/30 px-4 py-3 text-sm font-medium transition hover:bg-muted/40 ${
                                isUploading ? "pointer-events-none opacity-50" : ""
                              }`}
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {t("جاري الرفع...", "Uploading...")}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {t(
                                      "انقر لرفع الشعار أو الملف الخاص بك",
                                      "Click to upload your logo or file",
                                    )}
                                  </span>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        placeholder={
                          lang === "ar"
                            ? "اكتب التفاصيل أو النص المطلوب هنا..."
                            : "Type the required text or details here..."
                        }
                        className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {variant && (
            <div className="mb-4">
              <div className="text-sm font-medium mb-2">{t("الكمية", "Quantity")}</div>
              <div className="inline-flex items-center border rounded-lg">
                <button
                  type="button"
                  aria-label={t("تقليل الكمية", "Decrease quantity")}
                  className="grid h-11 w-11 place-items-center"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="px-4">{qty}</span>
                <button
                  type="button"
                  aria-label={t("زيادة الكمية", "Increase quantity")}
                  className="grid h-11 w-11 place-items-center disabled:opacity-40"
                  disabled={qty >= maxStock}
                  onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
                >
                  +
                </button>
              </div>
              <span className="ms-3 inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-white/95 text-neutral-900">
                {maxStock} {t("متوفر", "available")}
              </span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="hidden md:flex gap-2">
            <Button
              className="flex-1 h-12 font-semibold shadow-sm hover:opacity-90"
              style={{
                backgroundColor: "var(--sf-btn-primary-bg)",
                color: "var(--sf-btn-primary-fg)",
                opacity: 1,
              }}
              onClick={() => doAdd(false)}
            >
              <ShoppingBag className="h-4 w-4 me-2" />
              {t("أضف للسلة", "Add to cart")}
            </Button>
            <Button
              className="h-12 border-2 font-semibold hover:opacity-90"
              style={{
                backgroundColor: "var(--sf-btn-secondary-bg)",
                color: "var(--sf-btn-secondary-fg)",
                borderColor: "var(--sf-btn-secondary-bg)",
                opacity: 1,
              }}
              onClick={() => doAdd(true)}
            >
              {t("اشتر الآن", "Buy now")}
            </Button>
          </div>
        </div>

        {/* Mobile sticky purchase bar */}
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto max-w-6xl flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                {variant
                  ? [
                      formatSizeWithUnit(variant.size, variant.size_unit, lang),
                      variant.color,
                      variant.fabric,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("مختار", "Selected")
                  : t("اختر الخيار", "Choose option")}
              </div>
              <div className="text-base font-semibold truncate" style={{ color: primary }}>
                {priceLabel}
              </div>
            </div>
            <Button
              className="h-11 px-3 font-semibold"
              style={{
                backgroundColor: "var(--sf-btn-primary-bg)",
                color: "var(--sf-btn-primary-fg)",
                opacity: 1,
              }}
              onClick={() => doAdd(false)}
              aria-label={t("أضف للسلة", "Add to cart")}
            >
              <ShoppingBag className="h-4 w-4" />
            </Button>
            <Button
              className="h-11 px-4 font-semibold border-2"
              style={{
                backgroundColor: "var(--sf-btn-checkout-bg, var(--sf-btn-secondary-bg))",
                color: "var(--sf-btn-checkout-fg, var(--sf-btn-secondary-fg))",
                borderColor: "var(--sf-btn-checkout-bg, var(--sf-btn-secondary-bg))",
                opacity: 1,
              }}
              onClick={() => doAdd(true)}
            >
              {t("اشتر الآن", "Buy now")}
            </Button>
          </div>
        </div>
      </div>

      {(relatedProducts.length > 0 || bestSellingProducts.length > 0) && (
        <div className="mt-10 space-y-9 border-t pt-8 sm:mt-14 sm:pt-10">
          {relatedProducts.length > 0 && (
            <RecommendationRail
              title={t("قد يعجبك أيضاً", "You may also like")}
              products={relatedProducts}
            />
          )}
          {bestSellingProducts.length > 0 && (
            <RecommendationRail
              title={t("اشتراها العملاء أيضاً", "Customers also bought")}
              products={bestSellingProducts}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationRail({
  title,
  products,
}: {
  title: string;
  products: RecommendationProduct[];
}) {
  const { brand, currency, lang, t } = useStorefront();

  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {t("اسحب للمزيد", "Scroll for more")}
        </span>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0 [scrollbar-width:thin]">
        {products.map((item) => {
          const variants = item.product_variants
            .filter((variant) => Number(variant.selling_price || 0) >= 0)
            .sort((a, b) => Number(a.selling_price) - Number(b.selling_price));
          const discounted = variants.find(
            (variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0),
          );
          const priced = discounted ?? variants[0];
          const media = Array.isArray(item.media)
            ? (item.media as Array<{ type: string; url: string }>)
            : [];
          const cover = media.find((entry) => entry.type === "image")?.url || item.image_url;
          const name = pickName(lang, item);

          return (
            <Link
              key={item.id}
              to="/$slug/product/$id"
              params={{ slug: brand.slug, id: item.id }}
              className="group w-[8.75rem] shrink-0 snap-start sm:w-[10.5rem]"
              onClick={() => {
                void (supabase.rpc as any)("record_storefront_product_engagement", {
                  p_brand_slug: brand.slug,
                  p_product_id: item.id,
                  p_event: "click",
                });
              }}
            >
              <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {cover ? (
                  <ResponsiveImage
                    src={cover}
                    preset="thumb"
                    sizes="(min-width: 640px) 168px, 140px"
                    alt={name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-3 text-center text-xs text-muted-foreground">
                    {t("لا توجد صورة", "No image")}
                  </div>
                )}
              </div>
              <div className="mt-2 min-w-0">
                <div className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{name}</div>
                {priced && (
                  <div
                    className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold"
                    style={{ color: "var(--sf-heading)" }}
                  >
                    <span>{formatPrice(Number(priced.selling_price), currency, lang)}</span>
                    {Number(priced.original_price || 0) > Number(priced.selling_price) && (
                      <span className="font-normal text-muted-foreground line-through">
                        {formatPrice(Number(priced.original_price), currency, lang)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
