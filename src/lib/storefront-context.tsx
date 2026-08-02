import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { westernNumeralLocale } from "@/lib/format";

export type StoreLang = "ar" | "en";
export type HomePromoCard = {
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
  image_url: string;
  href: string;
  background_color: string;
  text_color: string;
};
export type HeroMediaItem = { type: "image" | "video"; url: string };
export type HeroContentSlide = {
  id: string;
  type: "text" | "image" | "video";
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  media_url: string;
  media_url_en?: string;
  media_url_ar?: string;
  media_stream_uid_en?: string;
  media_stream_uid_ar?: string;
  media_iframe_url_en?: string;
  media_iframe_url_ar?: string;
  media_poster_url?: string;
  media_poster_url_en?: string;
  media_poster_url_ar?: string;
  button_en: string;
  button_ar: string;
  button_href: string;
};
export type HeroMediaConfig = { background: HeroMediaItem | null; slides: HeroContentSlide[] };

export type Brand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  hero_media: HeroMediaConfig;
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export type PublicSettings = {
  brand_id: string;
  business_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  currency: string;
  primary_color: string;
  storefront_accent_color: string;
  text_color: string;
  background_color: string;
  cod_enabled: boolean;
  card_enabled: boolean;
  benefit_enabled: boolean;
  benefit_qr_url: string | null;
  benefit_account_number: string | null;
  footer_note: string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  digital_delivery_enabled: boolean;
  delivery_fee: number;
  // Theme customizer
  logo_size: number;
  logo_align: "left" | "center" | "right";
  show_header_name: boolean;
  show_hero_title: boolean;
  show_hero_about: boolean;
  show_footer_name: boolean;
  storefront_font_en: string;
  storefront_font_ar: string;
  storefront_font_en_url: string | null;
  storefront_font_ar_url: string | null;
  hero_title_en: string | null;
  hero_title_ar: string | null;
  hero_title_size: number;
  hero_title_color: string | null;
  hero_title_align: "start" | "center" | "end";
  header_bg: string | null;
  header_fg: string | null;
  footer_bg: string | null;
  footer_fg: string | null;
  heading_color: string | null;
  link_color: string | null;
  btn_primary_bg: string | null;
  btn_primary_fg: string | null;
  btn_secondary_bg: string | null;
  btn_secondary_fg: string | null;
  btn_checkout_bg: string | null;
  btn_checkout_fg: string | null;
  pages: Array<{
    slug: string;
    title_ar: string | null;
    title_en: string | null;
    content_ar: string | null;
    content_en: string | null;
    image_url: string | null;
    menu_icon_url: string | null;
    image_position: "top" | "bottom";
    meta_title: string | null;
    meta_description: string | null;
  }>;
  socials: Array<{ name: string; url: string }>;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  menu_bg: string | null;
  menu_fg: string | null;
  menu_title_en: string | null;
  menu_title_ar: string | null;
  menu_show_home: boolean;
  menu_show_account: boolean;
  menu_show_orders: boolean;
  menu_show_pages: boolean;
  home_promo_cards: HomePromoCard[];
  show_new_arrivals: boolean;
  show_best_sellers: boolean;
  new_arrivals_title_en: string | null;
  new_arrivals_title_ar: string | null;
  best_sellers_title_en: string | null;
  best_sellers_title_ar: string | null;
  announcement_enabled: boolean;
  announcement_text_en: string | null;
  announcement_text_ar: string | null;
  announcement_bg: string;
  announcement_fg: string;
  announcement_bold: boolean;
  announcement_italic: boolean;
  announcement_dismissible: boolean;
  announcement_scope: "all" | "home" | "catalog" | "checkout";
  announcement_audience: "all" | "guest" | "authenticated";
  global_sale_badges_enabled: boolean;
  cart_drawer_checkout_bg: string | null;
  cart_drawer_checkout_fg: string | null;
  vat_inclusive?: boolean;
  shipping_zones?: Array<{ id: string; name_en: string; name_ar: string; fee: number }>;
  google_analytics_enabled: boolean;
  google_analytics_id: string | null;
  meta_pixel_enabled: boolean;
  meta_pixel_id: string | null;
  analytics_consent_required: boolean;
  storefront_loader_text_en?: string | null;
  storefront_loader_text_ar?: string | null;
};

export type CustomFieldValue = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  value: string;
};

export type CartItem = {
  cart_line_id: string;
  variant_id: string;
  product_id: string;
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  image: string | null;
  price: number;
  original_price?: number | null;
  size: string | null;
  color: string | null;
  fabric?: string | null;
  qty: number;
  max_stock: number;
  custom_fields?: CustomFieldValue[];
};

/** Pick the localized product name, falling back through en → ar → base name. */
export function pickName(
  lang: StoreLang,
  p: { name?: string | null; name_ar?: string | null; name_en?: string | null },
): string {
  if (lang === "ar") return p.name_ar || p.name_en || p.name || "";
  return p.name_en || p.name_ar || p.name || "";
}

/** Pick the localized product description with the same fallback chain. */
export function pickDescription(
  lang: StoreLang,
  p: {
    description?: string | null;
    description_ar?: string | null;
    description_en?: string | null;
  },
): string {
  if (lang === "ar") return p.description_ar || p.description_en || p.description || "";
  return p.description_en || p.description_ar || p.description || "";
}

type StoreCtx = {
  brand: Brand;
  settings: PublicSettings;
  lang: StoreLang;
  setLang: (l: StoreLang) => void;
  dir: "rtl" | "ltr";
  t: (ar: string, en: string) => string;
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (cart_line_id: string) => void;
  updateQty: (cart_line_id: string, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  wishlist: string[];
  wishlistCount: number;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => void;
  currency: string;
  session: Session | null;
  isStoreMember: boolean;
  membershipLoading: boolean;
  refreshMembership: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<StoreCtx | null>(null);

function cartLineId(
  item: Pick<CartItem, "variant_id" | "size" | "color" | "fabric" | "custom_fields">,
): string {
  const fields = [...(item.custom_fields ?? [])]
    .map((field) => ({ key: field.key, value: field.value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify({
    variant: item.variant_id,
    size: item.size ?? "",
    color: item.color ?? "",
    fabric: item.fabric ?? "",
    fields,
  });
}

export function StorefrontProvider({
  brand,
  settings,
  children,
}: {
  brand: Brand;
  settings: PublicSettings;
  children: ReactNode;
}) {
  const cartKey = `storefront-cart:${brand.slug}`;
  const langKey = `storefront-lang:${brand.slug}`;
  const wishlistKey = `storefront-wishlist:${brand.slug}`;

  const [lang, setLangState] = useState<StoreLang>("ar");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const l = localStorage.getItem(langKey);
      if (l === "en" || l === "ar") setLangState(l);

      const c = localStorage.getItem(cartKey);
      if (c) {
        const stored = JSON.parse(c) as Array<Partial<CartItem> & { variant_id: string }>;
        setCart(
          stored.map((item) => ({
            ...item,
            cart_line_id: item.cart_line_id || cartLineId(item as CartItem),
          })) as CartItem[],
        );
      }

      const w = localStorage.getItem(wishlistKey);
      if (w) {
        setWishlist(Array.from(new Set(JSON.parse(w) as string[])));
      }
    } catch {}
  }, [brand.slug, cartKey, langKey, wishlistKey]);

  const [session, setSession] = useState<Session | null>(null);
  const [isStoreMember, setIsStoreMember] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {}
  }, [cart, cartKey]);

  useEffect(() => {
    try {
      localStorage.setItem(wishlistKey, JSON.stringify(wishlist));
    } catch {}
  }, [wishlist, wishlistKey]);

  const checkMembership = useCallback(
    async (activeSession: Session | null): Promise<boolean> => {
      if (!activeSession?.user) {
        setIsStoreMember(false);
        setMembershipLoading(false);
        return false;
      }
      setMembershipLoading(true);
      const { data, error } = await supabase.rpc("has_storefront_membership", {
        p_brand_slug: brand.slug,
      });
      const member = !error && data === true;
      if (error) console.error("Storefront membership check failed", error);
      setIsStoreMember(member);
      setMembershipLoading(false);
      return member;
    },
    [brand.slug],
  );

  const refreshMembership = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    const activeSession = data.session ?? null;
    setSession(activeSession);
    return checkMembership(activeSession);
  }, [checkMembership]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const nextSession = data.session ?? null;
      setSession(nextSession);
      void checkMembership(nextSession);
    });
    const { data } = supabase.auth.onAuthStateChange((_evt, nextSession) => {
      setSession(nextSession);
      // Run the RPC outside the auth callback to avoid blocking token storage.
      window.setTimeout(() => {
        if (active) void checkMembership(nextSession);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [checkMembership]);

  const setLang = useCallback(
    (l: StoreLang) => {
      setLangState(l);
      try {
        localStorage.setItem(langKey, l);
      } catch {}
    },
    [langKey],
  );

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);

  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);

  const addToCart = useCallback(
    (item: CartItem) => {
      setCart((prev) => {
        const lineId = cartLineId(item);
        const existing = prev.find((c) => c.cart_line_id === lineId);
        const usedByOtherConfigurations = prev
          .filter((c) => c.variant_id === item.variant_id && c.cart_line_id !== lineId)
          .reduce((sum, c) => sum + c.qty, 0);
        const availableForLine = Math.max(0, item.max_stock - usedByOtherConfigurations);
        if (existing) {
          return prev.map((c) =>
            c.cart_line_id === lineId
              ? { ...c, qty: Math.min(availableForLine, c.qty + item.qty) }
              : c,
          );
        }
        if (availableForLine <= 0) return prev;
        return [
          ...prev,
          { ...item, cart_line_id: lineId, qty: Math.min(item.qty, availableForLine) },
        ];
      });
      trackStorefrontEvent("add_to_cart", {
        currency: settings.currency,
        value: Number((item.price * item.qty).toFixed(3)),
        content_ids: [item.product_id],
        content_type: "product",
        items: [
          { item_id: item.product_id, item_name: item.name, price: item.price, quantity: item.qty },
        ],
      });
    },
    [settings.currency],
  );

  const removeFromCart = useCallback((cart_line_id: string) => {
    setCart((prev) => prev.filter((c) => c.cart_line_id !== cart_line_id));
  }, []);

  const updateQty = useCallback((cart_line_id: string, qty: number) => {
    setCart((prev) => {
      const target = prev.find((c) => c.cart_line_id === cart_line_id);
      if (!target) return prev;
      const usedByOthers = prev
        .filter((c) => c.variant_id === target.variant_id && c.cart_line_id !== cart_line_id)
        .reduce((sum, c) => sum + c.qty, 0);
      const availableForLine = Math.max(1, target.max_stock - usedByOthers);
      return prev.map((c) =>
        c.cart_line_id === cart_line_id
          ? { ...c, qty: Math.min(availableForLine, Math.max(1, qty)) }
          : c,
      );
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsStoreMember(false);
  }, []);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.qty * c.price, 0), [cart]);
  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((items) =>
      items.includes(productId) ? items.filter((id) => id !== productId) : [...items, productId],
    );
  }, []);
  const isWishlisted = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const value: StoreCtx = {
    brand,
    settings,
    lang,
    setLang,
    dir,
    t,
    cart,
    addToCart,
    removeFromCart,
    updateQty,
    clearCart,
    cartCount,
    cartTotal,
    wishlist,
    wishlistCount: wishlist.length,
    isWishlisted,
    toggleWishlist,
    currency: settings.currency || "BHD",
    session,
    isStoreMember,
    membershipLoading,
    refreshMembership,
    signOut,
  };

  return (
    <Ctx.Provider value={value}>
      <DirectionProvider dir={dir}>{children}</DirectionProvider>
    </Ctx.Provider>
  );
}

export function useStorefront() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStorefront must be used within StorefrontProvider");
  return v;
}

export function formatPrice(amount: number, currency: string, lang: StoreLang) {
  const normalizedCurrency = (currency || "").toUpperCase();
  const isThreeDecimals = ["BHD", "KWD", "OMR", "IQD", "LYD"].includes(normalizedCurrency);
  const fractionDigits = isThreeDecimals ? 3 : 2;
  const n = new Intl.NumberFormat(
    westernNumeralLocale(lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH"),
    {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
  );
  try {
    return n.format(amount);
  } catch {
    return `${amount.toFixed(fractionDigits)} ${normalizedCurrency}`;
  }
}

/** Pick a readable foreground (#000 or #fff) for a given hex background. */
export function readableOn(hex: string | null | undefined, fallback = "#111111"): string {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Relative luminance approximation
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#111111" : "#ffffff";
}
