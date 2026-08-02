import React from "react";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { ResponsiveImage } from "@/components/responsive-media";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { type ProductRow } from "@/routes/$slug.index";

export function ProductCard({
  product,
  badge,
  className,
}: {
  product: ProductRow;
  badge?: "trending" | "best";
  className?: string;
}) {
  const { brand, currency, lang, t, isWishlisted, toggleWishlist, settings } = useStorefront();
  const displayName = pickName(lang, product);
  const pricedVariants = product.product_variants
    .filter((variant) => Number(variant.selling_price || 0) >= 0)
    .sort((a, b) => a.selling_price - b.selling_price);
  const discountedVariant = pricedVariants.filter(
    (variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0),
  )[0];
  const displayVariant = discountedVariant ?? pricedVariants[0];
  const variantPrices = pricedVariants.map((v) => Number(v.selling_price || 0));
  const minPrice =
    variantPrices.length > 0
      ? Math.min(...variantPrices)
      : Number(displayVariant?.selling_price || 0);
  const maxPrice =
    variantPrices.length > 0
      ? Math.max(...variantPrices)
      : Number(displayVariant?.selling_price || 0);
  const originalPrice = discountedVariant ? Number(discountedVariant.original_price) : 0;
  const discountPercent = discountedVariant
    ? Math.round((1 - discountedVariant.selling_price / originalPrice) * 100)
    : 0;
  const totalStock = product.product_variants.reduce((s, v) => s + (v.stock_main || 0), 0);
  const oos = totalStock <= 0;

  const media = Array.isArray(product.media)
    ? (product.media as Array<{ type: string; url: string }>)
    : [];
  const cover = media.find((m) => m.type === "image")?.url || product.image_url;

  const wished = isWishlisted(product.id);
  const isAr = lang === "ar";

  // Muted, high-end editorial overlay badges configuration
  let badgeStyle = "";
  let badgeLabel = "";

  if (
    discountPercent > 0 &&
    settings.global_sale_badges_enabled &&
    product.show_sale_badge !== false
  ) {
    badgeStyle = "bg-[#8C6D58]/15 text-[#5F4B3C] border-[#8C6D58]/25";
    badgeLabel = isAr ? `وفر ${discountPercent}%` : `Sale ${discountPercent}% off`;
  } else if (badge === "best") {
    badgeStyle = "bg-[#4A5568]/15 text-[#2D3748] border-[#4A5568]/25";
    badgeLabel = isAr ? "الأكثر مبيعاً" : "Best Seller";
  } else if (badge === "trending") {
    badgeStyle = "bg-[#2D3748]/15 text-[#1A202C] border-[#2D3748]/25";
    badgeLabel = isAr ? "رائج" : "Trending";
  }

  return (
    <div className={`group relative ${className || "w-full"}`}>
      <button
        type="button"
        onClick={() => toggleWishlist(product.id)}
        aria-label={
          wished
            ? t("إزالة من المفضلة", "Remove from wishlist")
            : t("إضافة إلى المفضلة", "Add to wishlist")
        }
        className="absolute end-2.5 top-2.5 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/85 backdrop-blur-[4px] text-neutral-800 shadow-sm border border-neutral-200/50 transition-all duration-300 hover:scale-105 active:scale-95 hover:bg-white hover:text-red-500"
      >
        <Heart
          className={`h-4 w-4 transition-colors duration-300 ${wished ? "fill-red-600 text-red-600" : ""}`}
        />
      </button>

      <Link
        to="/$slug/product/$id"
        params={{ slug: brand.slug, id: product.id }}
        preload="intent"
        className="block"
        onClick={() => {
          void (supabase.rpc as any)("record_storefront_product_engagement", {
            p_brand_slug: brand.slug,
            p_product_id: product.id,
            p_event: "click",
          });
        }}
      >
        <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted relative">
          {badgeLabel && (
            <span
              className={`absolute start-2.5 top-2.5 z-10 rounded-md border px-2.5 py-1 text-[10px] font-medium backdrop-blur-[2px] shadow-sm select-none ${badgeStyle} ${
                isAr ? "font-display leading-none" : "tracking-widest uppercase"
              }`}
            >
              {badgeLabel}
            </span>
          )}

          {cover ? (
            <ResponsiveImage
              src={cover}
              preset="card"
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              // [TECH ADVISOR #1]: Real informational product photos MUST have dynamic/descriptive alt text
              alt={displayName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              decoding="async"
              quality={76}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
              {t("لا توجد صورة", "No image")}
            </div>
          )}

          {oos && (
            <div className="absolute inset-0 bg-black/40 grid place-items-center">
              <span className="bg-white/95 px-3 py-1 rounded-full text-xs font-semibold text-neutral-900">
                {t("نفد المخزون", "Sold out")}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 text-start">
          <div
            className="product-title text-sm font-medium truncate"
            style={{ color: "var(--sf-heading)" }}
          >
            {displayName}
          </div>
          <div
            className="price-tag flex flex-wrap items-baseline gap-2 text-sm font-semibold mt-0.5"
            style={{ color: "var(--sf-heading)" }}
          >
            {minPrice > 0 ? (
              minPrice === maxPrice ? (
                <>
                  <span>{formatPrice(minPrice, currency, lang)}</span>
                  {originalPrice > minPrice && (
                    <span className="text-xs font-normal text-muted-foreground line-through">
                      {formatPrice(originalPrice, currency, lang)}
                    </span>
                  )}
                </>
              ) : (
                <span>
                  {formatPrice(minPrice, currency, lang)} – {formatPrice(maxPrice, currency, lang)}
                </span>
              )
            ) : (
              <span>{t("السعر عند الطلب", "Price on request")}</span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
