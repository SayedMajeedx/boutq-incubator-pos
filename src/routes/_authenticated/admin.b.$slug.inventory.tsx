import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { importProductCatalog } from "@/lib/universal-importer";
import {
  fetchInstagramPosts,
  checkScraperStatus,
  fetchScraperDataset,
  batchParseCaptionsWithAI,
  batchRehostImages,
  bulkInsertProducts,
  scanCaptionForSoldOut,
  type InstagramPostPreview,
} from "@/lib/instagram-ai-importer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  TrendingUp,
  Wand as Wand2,
  Printer,
  Search,
  AlertTriangle,
  Boxes,
  ChevronDown,
  Sparkles,
  Upload,
  Loader2,
  Check,
  Instagram,
  Filter,
  CheckSquare,
  Square,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Sliders,
  X,
  Zap,
  Barcode,
  TableProperties,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { PrintLabelButton, printLabels, type LabelData } from "@/components/barcode-label";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { Switch } from "@/components/ui/switch";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { BilingualField } from "@/components/bilingual-field";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { parseVariantPrompt, type VariantGenerationPlan } from "@/lib/generate-variants.functions";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { InventoryCommandHeader } from "@/components/inventory/InventoryCommandHeader";
import {
  InventoryScopeSwitcher,
  type InventoryScopeTab,
} from "@/components/inventory/InventoryScopeSwitcher";
import { InventoryToolbar } from "@/components/inventory/InventoryToolbar";
import { InventoryWorkQueue } from "@/components/inventory/InventoryWorkQueue";
import { InventoryMobileCard } from "@/components/inventory/InventoryMobileCard";

/** Common measurement units the admin can pick from for a "size" variant. */
const SIZE_UNITS = ["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"] as const;

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  component: Inventory,
});

type MediaItem = {
  type: "image" | "video";
  url: string;
  stream_uid?: string;
  stream_iframe_url?: string;
  poster_url?: string;
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
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  featured_trending: boolean;
  show_sale_badge: boolean;
  media: MediaItem[];
  custom_fields: CustomField[] | null;
  base_price?: number | null;
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
};
type Variant = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  fabric: string | null;
  cost_price: number;
  selling_price: number;
  original_price: number | null;
  stock: number;
  stock_main: number;
  stock_incubator: number;
  barcode: string | null;
  size_unit: string | null;
  created_at?: string;
  image_url: string | null;
};
type Customization = { id: string; name: string; price_delta: number };

function InventoryDeleteAction({
  message,
  onConfirm,
  mobile = false,
}: {
  message: string;
  onConfirm: () => void | Promise<void>;
  mobile?: boolean;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          className={mobile ? "h-11 w-11 touch-manipulation text-destructive" : "text-destructive"}
          variant="ghost"
          size="icon"
          aria-label={t("common.delete")}
        >
          <Trash2 className={mobile ? "h-5 w-5" : "h-4 w-4"} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void onConfirm()}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Inventory() {
  const t = useT();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const [tab, setTab] = useState<"products" | "customizations">("products");

  useRealtimeInvalidate(
    [
      { table: "products", brandId, queryKey: ["products", brandId] },
      { table: "product_variants", brandId, queryKey: ["variants", brandId] },
      { table: "customization_options", brandId, queryKey: ["customizations", brandId] },
    ],
    `inventory-${brandId}`,
  );

  const products = useQuery({
    queryKey: ["products", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        media: Array.isArray(p.media) ? p.media : [],
        custom_fields: Array.isArray(p.custom_fields) ? p.custom_fields : [],
      })) as Product[];
    },
  });

  const variants = useQuery({
    queryKey: ["variants", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as Variant[];
    },
  });

  const customizations = useQuery({
    queryKey: ["customizations", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customization_options")
        .select("*")
        .eq("brand_id", brandId)
        .order("name");
      if (error) throw error;
      return data as Customization[];
    },
  });

  const businessName = useQuery({
    queryKey: ["business-name", brandId],
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("business_name, currency")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const salesHistory = useQuery({
    queryKey: ["inventory-sales-past45", brandId],
    queryFn: async () => {
      const past45Days = new Date();
      past45Days.setDate(past45Days.getDate() - 45);
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, order_items(variant_id, quantity)")
        .eq("brand_id", brandId)
        .in("status", ["confirmed", "paid", "shipped", "completed"])
        .gte("created_at", past45Days.toISOString());
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-1 sm:p-2 animate-fade-in">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300 sm:text-4xl">
            {t("inventory.title")}
          </h2>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">{t("inventory.subtitle")}</p>
        </div>
      </div>

      <div className="flex p-1.5 gap-1.5 bg-muted/40 rounded-xl border border-border/40 backdrop-blur-sm max-w-md mb-6">
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "products" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("products")}
        >
          {t("inventory.products")}
        </button>
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "customizations" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("customizations")}
        >
          {t("inventory.customizations")}
        </button>
      </div>

      {tab === "products" ? (
        <ProductsSection
          products={products.data ?? []}
          variants={variants.data ?? []}
          businessName={businessName.data?.business_name ?? null}
          currency={businessName.data?.currency ?? "BHD"}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["products"] });
            qc.invalidateQueries({ queryKey: ["variants"] });
          }}
          salesHistory={salesHistory.data ?? []}
        />
      ) : (
        <CustomizationsSection
          brandId={brandId}
          items={customizations.data ?? []}
          onChanged={() => qc.invalidateQueries({ queryKey: ["customizations"] })}
        />
      )}

      <div className="mt-8">
        <ActivityLogList scope="inventory" brandId={brandId} />
      </div>
    </div>
  );
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      row.push(currentVal.trim());
      lines.push(row);
      row = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  return lines.filter((r) => r.length > 0 && r.some((val) => val !== ""));
}

const PRODUCT_HEADER_MAPS = {
  name: ["title", "name", "اسم المنتج", "عنوان المنتج", "product name", "product_name"],
  price: [
    "price",
    "price (bhd)",
    "price (sar)",
    "السعر",
    "سعر البيع",
    "selling_price",
    "price_bhd",
  ],
  image: [
    "image src",
    "image",
    "media",
    "صورة المنتج",
    "روابط الصور",
    "image_url",
    "image url",
    "image_src",
  ],
  stock: [
    "variant inventory qty",
    "stock",
    "الكمية",
    "المخزون",
    "inventory",
    "qty",
    "quantity",
    "stock_main",
  ],
};

function ProductImporterModal({
  brandId,
  onComplete,
  renderTrigger,
}: {
  brandId: string;
  onComplete: () => void;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<"shopify" | "salla" | "zid" | "woocommerce" | "custom">(
    "custom",
  );
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    price: -1,
    image: -1,
    stock: -1,
  });
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const handleOpen = () => {
    setIsOpen(true);
    setStep("preset");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(
          isAr
            ? "ملف الـ CSV فارغ أو يحتوي على صف الرأس فقط."
            : "CSV file is empty or only contains the header row.",
        );
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Mapping Detector
      const newMappings = { name: -1, price: -1, image: -1, stock: -1 };
      Object.entries(PRODUCT_HEADER_MAPS).forEach(([field, aliases]) => {
        const foundIdx = fileHeaders.findIndex((h) =>
          aliases.some(
            (alias) =>
              h.toLowerCase() === alias.toLowerCase() ||
              h.toLowerCase().includes(alias.toLowerCase()),
          ),
        );
        newMappings[field as keyof typeof newMappings] = foundIdx;
      });

      setMappings(newMappings);

      // If any mapping is missing or preset is custom, ask the user to confirm/adjust
      const allMapped = Object.values(newMappings).every((idx) => idx !== -1);
      if (allMapped && preset !== "custom") {
        startImport(rows.slice(1), newMappings, fileHeaders);
      } else {
        setStep("mapper");
      }
    };
    reader.readAsText(file);
  };

  const startImport = async (
    dataRows: string[][],
    finalMappings: Record<string, number>,
    headersList: string[] = headers,
  ) => {
    setStep("importing");
    setProgress(isAr ? "بدء عملية الاستيراد الفاخرة..." : "Starting premium import pipeline...");
    setTotalCount(dataRows.length);

    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
      );
    };

    try {
      const productsPayload = dataRows.map((row) => {
        let nameVal = "";
        let priceVal = 10.0;
        let imageVal: string | null = null;
        let stockVal = 10;
        let skuVal = `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        if (preset === "shopify") {
          const titleIdx = findHeaderIdx(["title"]);
          const priceIdx = findHeaderIdx(["variant price", "price"]);
          const imageIdx = findHeaderIdx(["image src", "image url", "image_src", "image"]);
          const stockIdx = findHeaderIdx(["variant inventory qty", "inventory qty", "stock"]);
          const skuIdx = findHeaderIdx(["variant sku", "sku"]);

          nameVal = titleIdx !== -1 ? row[titleIdx] : "";
          priceVal =
            priceIdx !== -1
              ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = imageIdx !== -1 ? row[imageIdx] : null;
          stockVal =
            stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
          if (skuIdx !== -1 && row[skuIdx]) {
            skuVal = row[skuIdx];
          }
        } else if (preset === "woocommerce") {
          const nameIdx = findHeaderIdx(["name", "title", "post_title"]);
          const priceIdx = findHeaderIdx([
            "regular price",
            "sale price",
            "price",
            "_regular_price",
          ]);
          const imageIdx = findHeaderIdx(["images", "image_url", "image"]);
          const stockIdx = findHeaderIdx(["stock", "manage_stock", "_stock", "quantity"]);
          const skuIdx = findHeaderIdx(["sku"]);

          nameVal = nameIdx !== -1 ? row[nameIdx] : "";
          priceVal =
            priceIdx !== -1
              ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
          stockVal =
            stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
          if (skuIdx !== -1 && row[skuIdx]) {
            skuVal = row[skuIdx];
          }
        } else if (preset === "salla" || preset === "zid") {
          const nameIdx = findHeaderIdx([
            "اسم المنتج",
            "الاسم",
            "عنوان المنتج",
            "product name",
            "name",
          ]);
          const priceIdx = findHeaderIdx(["السعر", "سعر البيع", "selling_price", "price"]);
          const imageIdx = findHeaderIdx([
            "صورة المنتج",
            "روابط الصور",
            "الصور",
            "image_url",
            "image",
          ]);
          const stockIdx = findHeaderIdx([
            "الكمية",
            "المخزون",
            "كمية المخزون",
            "quantity",
            "stock",
          ]);
          const skuIdx = findHeaderIdx(["رمز المنتج", "sku"]);

          nameVal = nameIdx !== -1 ? row[nameIdx] : "";
          priceVal =
            priceIdx !== -1
              ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
          stockVal =
            stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
          if (skuIdx !== -1 && row[skuIdx]) {
            skuVal = row[skuIdx];
          }
        } else {
          nameVal = finalMappings.name !== -1 ? row[finalMappings.name] : "";
          priceVal =
            finalMappings.price !== -1
              ? parseFloat(row[finalMappings.price]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = finalMappings.image !== -1 ? row[finalMappings.image] : null;
          stockVal =
            finalMappings.stock !== -1
              ? parseInt(row[finalMappings.stock]?.replace(/[^\d]/g, "") || "0") || 10
              : 10;
        }

        if (!nameVal) {
          nameVal = isAr ? "منتج مستورد بدون اسم" : "Unnamed Imported Product";
        }

        return {
          name: nameVal,
          name_ar: isAr ? nameVal : null,
          name_en: isAr ? null : nameVal,
          description: isAr ? "تم الاستيراد بنجاح" : "Imported product details",
          description_ar: isAr ? "تم الاستيراد بنجاح" : null,
          description_en: isAr ? null : "Imported product details",
          category: "General",
          image_url: imageVal,
          is_active: true,
          variants: [
            {
              size: null,
              size_unit: null,
              color: null,
              fabric: null,
              sku: skuVal,
              barcode: null,
              cost_price: 0,
              selling_price: priceVal,
              stock_main: stockVal,
              stock_incubator: 0,
            },
          ],
        };
      });

      // Split into batches of 10 to provide elegant live feedback to the merchant!
      const batchSize = 10;
      let totalSuccess = 0;

      for (let i = 0; i < productsPayload.length; i += batchSize) {
        const chunk = productsPayload.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري نقل ${i} من أصل ${productsPayload.length} منتج وإعادة استضافة الصور على R2...`
            : `Migrated ${i} / ${productsPayload.length} products and re-hosted CDN images to public R2...`,
        );

        const result = await importProductCatalog({
          data: {
            brandId,
            products: chunk,
          },
        });
        totalSuccess += result.successCount;
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error(isAr ? "فشل الاستيراد الفني" : "Import pipeline failure");
      setStep("preset");
    }
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(handleOpen)
      ) : (
        <Button
          variant="outline"
          onClick={handleOpen}
          className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-primary"
        >
          <Sparkles className="h-4 w-4 me-2 animate-pulse text-amber-500" />
          {isAr ? "استيراد كتالوج المنتجات" : "Import Products"}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl border-zinc-100 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {isAr ? "مساعد الهجرة الشامل للمنتجات" : "Universal Product Migration Suite"}
            </DialogTitle>
          </DialogHeader>

          {step === "preset" && (
            <div className="space-y-4 pt-2 select-none">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "قم بتصدير الكتالوج الخاص بك من منصتك السابقة، وسيقوم نظامنا تلقائياً بإعادة استضافة صور CDN الخاصة بك على سيرفراتنا الفائقة السرعة واستيراد الكتالوج فوراً."
                  : "Export your product catalog from your previous platform. Our system will automatically re-host all CDN images to public R2 and batch import your data."}
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: "shopify",
                    name: "Shopify CSV",
                    desc: "products_export.csv",
                    color: "hover:border-emerald-500/30",
                  },
                  {
                    id: "salla",
                    name: "Salla (سلة)",
                    desc: "سلة إكسل / CSV",
                    color: "hover:border-green-500/30",
                  },
                  {
                    id: "zid",
                    name: "Zid (زد)",
                    desc: "زد إكسل / CSV",
                    color: "hover:border-purple-500/30",
                  },
                  {
                    id: "woocommerce",
                    name: "WooCommerce",
                    desc: "WooCommerce CSV",
                    color: "hover:border-blue-500/30",
                  },
                  {
                    id: "custom",
                    name: isAr ? "CSV مخصص" : "Custom CSV / Sheets",
                    desc: "Excel or Google Sheet CSV",
                    color: "hover:border-primary/30",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPreset(item.id as any)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-left transition-all ${item.color} ${
                      preset === item.id
                        ? "border-primary ring-2 ring-primary/10 bg-primary/5 dark:bg-primary/5"
                        : ""
                    }`}
                  >
                    <span className="text-sm font-semibold font-display text-foreground block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <label className="relative cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl hover:bg-primary/95 transition-all">
                    <Upload className="h-4 w-4" />
                    {isAr ? "اختر الملف وابدأ الاستيراد" : "Upload & Begin Migration"}
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {step === "mapper" && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "لم نتمكن من مطابقة بعض الأعمدة تلقائياً. يرجى مطابقة أعمدة ملفك مع سمات المنتج المطلوبة لدينا:"
                  : "We couldn't automatically resolve some fields. Please map your CSV headers to our required product fields:"}
              </p>

              <div className="space-y-3">
                {[
                  { key: "name", label: isAr ? "اسم المنتج" : "Product Title", required: true },
                  { key: "price", label: isAr ? "السعر (د.ب)" : "Price (BHD)", required: true },
                  { key: "image", label: isAr ? "رابط الصورة" : "Image URL", required: false },
                  {
                    key: "stock",
                    label: isAr ? "المخزون الحالي" : "Inventory Stock",
                    required: false,
                  },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </span>
                    <Select
                      value={mappings[field.key]?.toString() || "-1"}
                      onValueChange={(val) =>
                        setMappings((m) => ({ ...m, [field.key]: parseInt(val) }))
                      }
                    >
                      <SelectTrigger className="w-[200px] h-9 text-xs">
                        <SelectValue placeholder={isAr ? "اختر العمود..." : "Select column..."} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">
                          -- {isAr ? "تخطي العمود" : "Skip/Omit Field"} --
                        </SelectItem>
                        {headers.map((h, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <Button
                  onClick={() => {
                    if (mappings.name === -1 || mappings.price === -1) {
                      toast.error(
                        isAr
                          ? "يجب مطابقة اسم المنتج والسعر على الأقل."
                          : "Product Title and Price fields are mandatory.",
                      );
                      return;
                    }
                    startImport(parsedRows, mappings);
                  }}
                  className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl transition-all"
                >
                  {isAr ? "تأكيد واستيراد الآن" : "Confirm & Import Catalog"}
                </Button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                <div className="relative h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground font-display">
                  {isAr
                    ? "جاري نقل وإعادة توطين كتالوج المنتجات..."
                    : "Processing Universal Catalog Migration..."}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm font-sans mx-auto leading-relaxed">
                  {progress}
                </p>
              </div>
              <div className="w-full max-w-xs bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${totalCount > 0 ? (successCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 space-y-5 text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <Check className="h-7 w-7 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100">
                  {isAr ? "اكتمل استيراد الكتالوج بنجاح!" : "Catalog Migration Completed!"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  {isAr
                    ? `تم استيراد ${successCount} منتجاً بالكامل، وإعادة استضافة جميع الصور على خوادم Cloudflare R2 فائقة السرعة بنجاح!`
                    : `Successfully imported ${successCount} products, and re-hosted all CDN images onto our premium ultra-fast Cloudflare R2 bucket!`}
                </p>
              </div>
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-xl transition-all"
              >
                {isAr ? "عرض المنتجات المستوردة" : "View Imported Catalog"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InstagramImporterModal({
  brandId,
  onComplete,
  renderTrigger,
}: {
  brandId: string;
  onComplete: () => void;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"inputs" | "grid" | "importing" | "success">("inputs");
  const [username, setUsername] = useState("");
  const [urlsText, setUrlsUrlsText] = useState("");
  const [range, setRange] = useState<number>(50);
  const [posts, setPosts] = useState<InstagramPostPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const handleOpen = () => {
    setIsOpen(true);
    setStep("inputs");
    setUsername("");
    setUrlsUrlsText("");
  };

  const handleFetchPosts = async () => {
    setLoadingPosts(true);
    setFetchStatus(isAr ? "جاري تهيئة عملية الجلب..." : "Initializing scraper run...");
    try {
      const urlsList = urlsText
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.startsWith("http"));

      // 1. Start scraper run
      const initResult = await fetchInstagramPosts({
        data: {
          username: username.trim() || undefined,
          urls: urlsList.length > 0 ? urlsList : undefined,
          range,
        },
      });

      const { runId, datasetId } = initResult;

      // 2. Client-side isolated polling to completely bypass Worker subrequest limits
      let status = "RUNNING";
      const maxRetries = 60;
      let attempt = 0;

      while (status === "RUNNING" || status === "READY") {
        if (attempt >= maxRetries) {
          throw new Error("Scraping task timed out. Please try again with fewer posts.");
        }

        attempt++;
        setFetchStatus(
          isAr
            ? `جاري جلب منشورات انستقرام (محاولة ${attempt}/${maxRetries})...`
            : `Scraping posts (attempt ${attempt}/${maxRetries})...`,
        );

        // Wait 2.5 seconds between polling checks
        await new Promise((resolve) => setTimeout(resolve, 2500));

        const checkResult = await checkScraperStatus({
          data: { runId },
        });
        status = checkResult.status;
      }

      setFetchStatus(isAr ? "جاري تحليل نتائج الكتالوج..." : "Analyzing catalog results...");

      // 3. Fetch final dataset items
      const result = await fetchScraperDataset({
        data: { datasetId },
      });

      setPosts(result);

      const defaultSelected = new Set<string>();
      result.forEach((p) => {
        if (!p.isSoldOut) {
          defaultSelected.add(p.id);
        }
      });
      setSelectedIds(defaultSelected);
      setStep("grid");
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(
        isAr ? `فشل جلب منشورات انستقرام: ${errMsg}` : `Failed to fetch Instagram posts: ${errMsg}`,
      );
    } finally {
      setLoadingPosts(false);
      setFetchStatus("");
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p.id)));
    }
  };

  const handleDeselectSoldOut = () => {
    const newSelected = new Set(selectedIds);
    posts.forEach((p) => {
      if (p.isSoldOut) {
        newSelected.delete(p.id);
      }
    });
    setSelectedIds(newSelected);
    toast.success(isAr ? "تم إلغاء تحديد السلع المنفذة" : "Deselected sold-out items");
  };

  const handleTogglePost = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleStartImport = async () => {
    if (selectedIds.size === 0) {
      toast.error(
        isAr
          ? "الرجاء تحديد منشور واحد على الأقل للاستيراد."
          : "Please select at least one post to import.",
      );
      return;
    }

    setStep("importing");
    const checkedPosts = posts.filter((p) => selectedIds.has(p.id));

    try {
      // Step 1/3: AI analyzing all captions in parallel
      setProgress(
        isAr
          ? "⚡ الخطوة 1/3: جاري تحليل كافة النصوص بالذكاء الاصطناعي في نفس الوقت..."
          : "⚡ Step 1/3: AI analyzing all captions in parallel...",
      );
      const parseResult = await batchParseCaptionsWithAI({
        data: {
          brandId,
          posts: checkedPosts.map((p) => ({
            id: p.id,
            url: p.url,
            imageUrl: p.imageUrl,
            caption: p.caption,
            isSoldOut: p.isSoldOut,
            isVideo: p.isVideo,
          })),
        },
      });

      // Step 2/3: Re-hosting high-res images to R2
      setProgress(
        isAr
          ? "🖼️ الخطوة 2/3: جاري إعادة استضافة الصور عالية الدقة في سحابة R2..."
          : "🖼️ Step 2/3: Re-hosting high-res images to R2...",
      );
      const rehostResult = await batchRehostImages({
        data: {
          brandId,
          products: parseResult.products,
        },
      });

      // Step 3/3: Bulk saving catalog to database
      setProgress(
        isAr
          ? "💾 الخطوة 3/3: جاري حفظ المنتجات والمقاسات في قاعدة البيانات دفعة واحدة..."
          : "💾 Step 3/3: Bulk saving catalog to database...",
      );
      const insertResult = await bulkInsertProducts({
        data: {
          brandId,
          products: rehostResult.products,
        },
      });

      setSuccessCount(insertResult.successCount);
      setStep("success");
      onComplete();
    } catch (err) {
      console.error("Turbo batch pipeline failed", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(
        isAr ? `فشل الاستيراد السريع: ${errMsg}` : `Turbo Batch Import failed: ${errMsg}`,
      );
      setStep("grid");
    }
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(handleOpen)
      ) : (
        <Button
          variant="outline"
          onClick={handleOpen}
          className="border-purple-200 dark:border-purple-900/50 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 text-purple-600 dark:text-purple-400 transition-all font-semibold"
        >
          <Instagram className="h-4 w-4 me-2 text-purple-500 animate-pulse" />
          {isAr ? "استيراد كتالوج انستقرام (ذكاء اصطناعي)" : "✨ Build Catalog from Instagram (AI)"}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-100 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl shadow-2xl p-6 sm:p-8">
          <DialogHeader className="border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500">
                <Instagram className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-50">
                  {isAr
                    ? "استيراد كتالوج المنتجات من انستقرام"
                    : "Instagram AI Product Catalog Importer"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "قم بتحويل منشورات انستقرام إلى منتجات جاهزة في متجرك بضغطة زر واحدة."
                    : "Convert public Instagram posts into active store products with zero-effort AI onboarding."}
                </p>
              </div>
            </div>
          </DialogHeader>

          {step === "inputs" && (
            <div className="space-y-6 py-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {isAr
                      ? "اسم مستخدم انستقرام (مثال: @pura.line)"
                      : "Instagram Username (e.g., @pura.line)"}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
                      @
                    </span>
                    <Input
                      placeholder="pura.line"
                      value={username.replace(/^@/, "")}
                      onChange={(e) => setUsername(e.target.value)}
                      className="ps-8 rounded-xl border-zinc-200 dark:border-zinc-800 h-11 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {isAr ? "عدد المنشورات المطلوبة" : "Fetch Range Selector"}
                  </Label>
                  <Select value={String(range)} onValueChange={(val) => setRange(Number(val))}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">
                        {isAr ? "آخر 15 منشور" : "Latest 15 posts"}
                      </SelectItem>
                      <SelectItem value="30">
                        {isAr ? "آخر 30 منشور" : "Latest 30 posts"}
                      </SelectItem>
                      <SelectItem value="50">
                        {isAr ? "آخر 50 منشور (موصى به)" : "Latest 50 posts (Recommended)"}
                      </SelectItem>
                      <SelectItem value="100">
                        {isAr ? "آخر 100 منشور" : "Latest 100 posts"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isAr
                    ? "أو روابط منشورات عامة مباشرة (رابط في كل سطر)"
                    : "Or Direct Public Post URLs (one URL per line)"}
                </Label>
                <textarea
                  placeholder="https://www.instagram.com/p/C..."
                  value={urlsText}
                  onChange={(e) => setUrlsUrlsText(e.target.value)}
                  className="w-full h-24 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent p-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-zinc-400 font-sans"
                />
              </div>

              <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-purple-900 dark:text-purple-300">
                    {isAr
                      ? "كيف يعمل محرك استيراد انستقرام المدعوم بالذكاء الاصطناعي؟"
                      : "How does the AI Instagram Importer work?"}
                  </p>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {isAr
                      ? "يقوم المحرك بجلب المنشورات من حسابك، ثم تفحص تقنية Gemini Vision الصور والنصوص لاستخراج الاسم باللغتين العربية والإنجليزية، وتحديد الأسعار بالدينار البحريني، ووصف المنتجات، والمقاسات المتاحة تلقائياً مع إعادة استضافة الصور على سحابة R2 فائقة السرعة."
                      : "The pipeline crawls public posts from the target profile. Gemini Vision then extracts multilingual product titles, currency-converted prices in BHD, sizes, and care captions, while re-hosting all images to our persistent Cloudflare R2 bucket."}
                  </p>
                </div>
              </div>

              <DialogFooter className="border-t border-zinc-100 dark:border-zinc-800/80 pt-4 flex gap-2">
                <Button variant="ghost" onClick={() => setIsOpen(false)} className="rounded-xl">
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  onClick={handleFetchPosts}
                  disabled={loadingPosts || (!username.trim() && !urlsText.trim())}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-6 font-semibold"
                >
                  {loadingPosts ? (
                    <>
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      {fetchStatus ||
                        (isAr ? "جاري جلب المنشورات..." : "Fetching Instagram posts...")}
                    </>
                  ) : (
                    <>
                      <Instagram className="h-4 w-4 me-2" />
                      {isAr ? "جلب وتحليل المنشورات" : "Fetch & Analyze Posts"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "grid" && (
            <div className="space-y-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/60 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleSelectAll}
                    className="h-8 text-xs rounded-lg"
                  >
                    {selectedIds.size === posts.length ? (
                      <>
                        <Square className="h-3.5 w-3.5 me-1.5" />
                        {isAr ? "إلغاء تحديد الكل" : "Deselect All"}
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-3.5 w-3.5 me-1.5" />
                        {isAr ? "تحديد الكل" : "Select All"}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectSoldOut}
                    className="h-8 text-xs rounded-lg text-amber-600 border-amber-200 hover:bg-amber-50/50"
                  >
                    <Filter className="h-3.5 w-3.5 me-1.5" />
                    {isAr ? "استبعاد المنشورات المباعة" : "Deselect Out of Stock"}
                  </Button>
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  {isAr
                    ? `تم اختيار ${selectedIds.size} من أصل ${posts.length} منشور`
                    : `Selected ${selectedIds.size} of ${posts.length} posts`}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[50vh] overflow-y-auto p-1">
                {posts.map((post) => {
                  const isSelected = selectedIds.has(post.id);
                  return (
                    <div
                      key={post.id}
                      onClick={() => handleTogglePost(post.id)}
                      className={`relative group rounded-2xl overflow-hidden border cursor-pointer transition-all duration-200 select-none ${
                        isSelected
                          ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/5 dark:bg-purple-950/5"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-transparent"
                      }`}
                    >
                      <div className="aspect-square w-full relative overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                        <img
                          src={post.imageUrl}
                          alt="Instagram Preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                        />
                        <div className="absolute top-2 start-2 z-10">
                          <div
                            className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-purple-600 border-purple-600 text-white"
                                : "bg-white/80 dark:bg-zinc-900/80 border-zinc-300 dark:border-zinc-700 text-transparent"
                            }`}
                          >
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        </div>

                        {post.isSoldOut && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-2 text-center">
                            <span className="bg-amber-500/90 text-zinc-950 text-[10px] sm:text-xs font-bold px-2 py-1 rounded-lg shadow-lg">
                              ⚠️ {isAr ? "نفذت الكمية" : "Detected Sold Out"}
                            </span>
                          </div>
                        )}

                        {post.isVideo && (
                          <div className="absolute top-2 end-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 z-10">
                            📹 {isAr ? "فيديو" : "Video Reel"}
                          </div>
                        )}

                        <div className="absolute bottom-2 end-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                          {post.date}
                        </div>
                      </div>

                      <div className="p-2.5">
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 h-8 leading-normal font-sans">
                          {post.caption || "No caption"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <DialogFooter className="border-t border-zinc-100 dark:border-zinc-800/80 pt-4 flex gap-2">
                <Button variant="ghost" onClick={() => setStep("inputs")} className="rounded-xl">
                  {isAr ? "السابق" : "Back"}
                </Button>
                <Button
                  onClick={handleStartImport}
                  disabled={selectedIds.size === 0}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-6 font-semibold shadow-lg shadow-purple-500/10"
                >
                  <Sparkles className="h-4 w-4 me-2" />
                  {isAr
                    ? `بدء استيراد ${selectedIds.size} منتج`
                    : `Import ${selectedIds.size} Products`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 px-4 space-y-6 text-center">
              <div className="relative">
                <div className="h-20 w-20 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Instagram className="h-8 w-8 text-purple-500 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-50">
                  {isAr
                    ? "جاري استيراد المنتجات بالذكاء الاصطناعي..."
                    : "AI Instagram-to-Storefront Ingestion"}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md font-mono bg-zinc-50 dark:bg-zinc-900 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                  {progress}
                </p>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 px-4 space-y-6 text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Check className="h-8 w-8 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-50">
                  {isAr ? "اكتمل استيراد انستقرام بنجاح!" : "Instagram Import Completed!"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  {isAr
                    ? `تم تحليل واستيراد ${successCount} منتجاً بنجاح وحفظها كمسودات، وإعادة استضافة جميع صورها على Cloudflare R2.`
                    : `Successfully analyzed and imported ${successCount} products as drafts, and re-hosted all product photos to Cloudflare R2.`}
                </p>
              </div>
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-xl transition-all"
              >
                {isAr ? "عرض المنتجات المستوردة" : "View Imported Catalog"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductsSection({
  products,
  variants,
  businessName,
  currency,
  onChanged,
  salesHistory,
}: {
  products: Product[];
  variants: Variant[];
  businessName: string | null;
  currency: string;
  onChanged: () => void;
  salesHistory: any[];
}) {
  const t = useT();
  const brand = useBrand();
  const brandId = brand.id;
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "active" | "hidden">("all");
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  const toggleProduct = (productId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const salesByVariant = useMemo(() => {
    const map = new Map<string, number>();
    salesHistory.forEach((order: any) => {
      (order.order_items ?? []).forEach((item: any) => {
        if (item.variant_id) {
          const qty = Number(item.quantity || 0);
          map.set(item.variant_id, (map.get(item.variant_id) || 0) + qty);
        }
      });
    });
    return map;
  }, [salesHistory]);

  const productWeeklySales = (productId: string) => {
    const pVariants = variants.filter((v) => v.product_id === productId);
    const productDailyVelocity = pVariants.reduce((sum, v) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
      const daysElapsed = variantCreatedAt
        ? Math.max(
            1,
            Math.min(
              45,
              Math.ceil(
                (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
              ),
            ),
          )
        : 45;
      return sum + qtySold / daysElapsed;
    }, 0);
    return productDailyVelocity * 7;
  };

  const del = async (id: string) => {
    const product = products.find((item) => item.id === id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      const urls = new Set(
        [product?.image_url, ...(product?.media ?? []).map((item) => item.url)].filter(
          (url): url is string => Boolean(url),
        ),
      );
      for (const url of urls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      toast.success(t("common.delete"));
      onChanged();
    }
  };

  const isAr = useI18n().lang === "ar";
  const productStock = useCallback(
    (productId: string) =>
      variants
        .filter((variant) => variant.product_id === productId)
        .reduce(
          (sum, variant) =>
            sum + Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0),
          0,
        ),
    [variants],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    const searchable = [
      product.name,
      product.name_ar,
      product.name_en,
      product.category,
      ...productVariants.flatMap((variant) => [
        variant.sku,
        variant.barcode,
        variant.size,
        variant.color,
      ]),
    ]
      .join(" ")
      .toLowerCase();
    const stock = productStock(product.id);
    return (
      (!normalizedSearch || searchable.includes(normalizedSearch)) &&
      (stockFilter === "all" ||
        (stockFilter === "out" ? stock <= 0 : stock < productWeeklySales(product.id))) &&
      (visibilityFilter === "all" ||
        (visibilityFilter === "active" ? product.is_active : !product.is_active))
    );
  });
  const totalUnits = products.reduce((sum, product) => sum + productStock(product.id), 0);

  const lowStock = products.filter((product) => {
    const stock = productStock(product.id);
    const weeklySales = productWeeklySales(product.id);
    return stock < weeklySales;
  }).length;

  const deadStock = variants.filter((v) => (salesByVariant.get(v.id) || 0) === 0).length;

  const printAll = async () => {
    const labels: LabelData[] = [];
    const [
      { data: freshProducts, error: productsError },
      { data: freshVariants, error: variantsError },
    ] = await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select("product_id, barcode, size, color, selling_price")
        .eq("brand_id", brandId)
        .not("barcode", "is", null)
        .order("created_at"),
    ]);

    if (productsError || variantsError) {
      toast.error(
        productsError?.message ??
          variantsError?.message ??
          (isAr ? "تعذر تحميل الباركودات" : "Could not load barcodes"),
      );
      return;
    }

    const printableProducts = (freshProducts ?? products) as Pick<Product, "id" | "name">[];
    const printableVariants = (freshVariants ?? variants) as Pick<
      Variant,
      "product_id" | "barcode" | "size" | "color" | "selling_price"
    >[];

    for (const p of printableProducts) {
      for (const v of printableVariants.filter((x) => x.product_id === p.id)) {
        if (!v.barcode) continue;
        labels.push({
          code: v.barcode,
          productName: p.name,
          size: v.size,
          color: v.color,
          price: v.selling_price,
          businessName,
        });
      }
    }
    if (labels.length === 0) {
      toast.error(isAr ? "لا توجد باركودات للطباعة" : "No barcodes to print");
      return;
    }
    printLabels(labels);
  };

  const variantsByProduct = useMemo(() => {
    const map: Record<string, Variant[]> = {};
    variants.forEach((v) => {
      if (!map[v.product_id]) map[v.product_id] = [];
      map[v.product_id].push(v);
    });
    return map;
  }, [variants]);

  const [scopeFilter, setScopeFilter] = useState<"all" | "low" | "out" | "featured" | "inactive">(
    "all",
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const scopeTabs: InventoryScopeTab[] = [
    {
      id: "all",
      label_en: "All Products",
      label_ar: "جميع المنتجات",
      count: products.length,
      icon: Package,
    },
    {
      id: "low",
      label_en: "Low Stock",
      label_ar: "مخزون منخفض",
      count: lowStock,
      icon: AlertTriangle,
    },
    {
      id: "out",
      label_en: "Out of Stock",
      label_ar: "نفد المخزون",
      count: products.filter((p) => productStock(p.id) === 0).length,
      icon: Boxes,
    },
    {
      id: "featured",
      label_en: "Featured / Trending",
      label_ar: "مميز ومطلوب",
      count: products.filter((p) => p.featured_trending).length,
      icon: TrendingUp,
    },
    {
      id: "inactive",
      label_en: "Inactive / Hidden",
      label_ar: "مخفي وغير نشط",
      count: products.filter((p) => !p.is_active).length,
      icon: Search,
    },
  ];

  const categoryOptions = useMemo(() => {
    const categoriesSet = new Set<string>();
    products.forEach((p) => {
      if (p.category) categoriesSet.add(p.category);
    });
    return Array.from(categoriesSet).map((c) => ({ id: c, name: c, name_ar: c }));
  }, [products]);

  const filteredDisplayProducts = useMemo(() => {
    const result = products.filter((product) => {
      const productVariants = variantsByProduct[product.id] || [];
      const searchable = [
        product.name,
        product.name_ar,
        product.name_en,
        product.category,
        ...productVariants.flatMap((variant) => [
          variant.sku,
          variant.barcode,
          variant.size,
          variant.color,
        ]),
      ]
        .join(" ")
        .toLowerCase();

      const stock = productStock(product.id);
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;

      let matchesScope = true;
      if (scopeFilter === "low") matchesScope = stock > 0 && stock <= 5;
      else if (scopeFilter === "out") matchesScope = stock === 0;
      else if (scopeFilter === "featured") matchesScope = Boolean(product.featured_trending);
      else if (scopeFilter === "inactive") matchesScope = !product.is_active;

      return matchesSearch && matchesCategory && matchesScope;
    });

    if (sortBy === "price-asc") {
      result.sort((a, b) => (a.base_price || 0) - (b.base_price || 0));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => (b.base_price || 0) - (a.base_price || 0));
    } else if (sortBy === "stock-asc") {
      result.sort((a, b) => productStock(a.id) - productStock(b.id));
    }

    return result;
  }, [
    products,
    variantsByProduct,
    normalizedSearch,
    selectedCategory,
    scopeFilter,
    sortBy,
    productStock,
  ]);

  const activeFilterCount = (selectedCategory !== "all" ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="space-y-3.5">
      {/* 1. Integrated Command Header */}
      <InventoryCommandHeader
        lang={isAr ? "ar" : "en"}
        productCount={products.length}
        isCourier={false}
        onCreateNew={() => {
          setEditing(null);
          setDialogSession((v) => v + 1);
          setOpen(true);
        }}
        renderImporters={
          <div className="flex flex-col gap-1 p-1">
            <InstagramImporterModal brandId={brandId} onComplete={onChanged} />
            <ProductImporterModal brandId={brandId} onComplete={onChanged} />
            <Button
              variant="ghost"
              size="sm"
              onClick={printAll}
              className="justify-start text-xs font-semibold"
            >
              <Printer className="h-3.5 w-3.5 me-2" />
              {isAr ? "طباعة جميع الباركودات" : "Print All Barcodes"}
            </Button>
          </div>
        }
      />

      {/* 2. Operational Scope Switcher */}
      <InventoryScopeSwitcher
        lang={isAr ? "ar" : "en"}
        tabs={scopeTabs}
        activeTab={scopeFilter}
        onTabChange={(tabId) => setScopeFilter(tabId as any)}
      />

      {/* 3. Compact Command Toolbar */}
      <InventoryToolbar
        lang={isAr ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categoryOptions}
        sortBy={sortBy}
        onSortChange={setSortBy}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setSearch("");
          setSelectedCategory("all");
          setScopeFilter("all");
        }}
      />

      {/* 4. Mobile Purpose-Built Product Cards */}
      <div className="space-y-3 block sm:hidden">
        {filteredDisplayProducts.map((p) => {
          const pVariants = variantsByProduct[p.id] || [];
          const totalStock = productStock(p.id);
          const minPrice =
            pVariants.length > 0
              ? Math.min(...pVariants.map((v) => Number(v.selling_price || 0)))
              : Number(p.base_price || 0);

          return (
            <InventoryMobileCard
              key={p.id}
              lang={isAr ? "ar" : "en"}
              product={p}
              variants={pVariants}
              totalStock={totalStock}
              minPrice={minPrice}
              onEdit={(prod) => {
                setEditing(prod);
                setDialogSession((v) => v + 1);
                setOpen(true);
              }}
              onDelete={(id) => del(id)}
              onPrintLabel={(prod) => {
                const labels: LabelData[] = (variantsByProduct[prod.id] || [])
                  .filter((v) => Boolean(v.barcode))
                  .map((v) => ({
                    code: v.barcode!,
                    productName: prod.name,
                    size: v.size,
                    color: v.color,
                    price: v.selling_price,
                    businessName,
                  }));
                if (labels.length > 0) printLabels(labels);
                else
                  toast.error(isAr ? "لا يوجد باركود لهذا المنتج" : "No barcode for this product");
              }}
              renderVariantList={(prod) => (
                <VariantList
                  productId={prod.id}
                  productName={prod.name}
                  businessName={businessName}
                  variants={variantsByProduct[prod.id] || []}
                  onChanged={onChanged}
                  salesByVariant={salesByVariant}
                  product={prod}
                />
              )}
            />
          );
        })}
      </div>

      {/* 5. Desktop High-Density Work Queue */}
      <div className="hidden sm:block">
        <InventoryWorkQueue
          lang={isAr ? "ar" : "en"}
          products={filteredDisplayProducts}
          variantsByProduct={variantsByProduct}
          isLoading={false}
          isError={false}
          onEdit={(prod) => {
            setEditing(prod);
            setDialogSession((v) => v + 1);
            setOpen(true);
          }}
          onDelete={(id) => del(id)}
          onPrintLabel={(prod) => {
            const labels: LabelData[] = (variantsByProduct[prod.id] || [])
              .filter((v) => Boolean(v.barcode))
              .map((v) => ({
                code: v.barcode!,
                productName: prod.name,
                size: v.size,
                color: v.color,
                price: v.selling_price,
                businessName,
              }));
            if (labels.length > 0) printLabels(labels);
            else toast.error(isAr ? "لا يوجد باركود لهذا المنتج" : "No barcode for this product");
          }}
          renderVariantList={(prod) => (
            <VariantList
              productId={prod.id}
              productName={prod.name}
              businessName={businessName}
              variants={variantsByProduct[prod.id] || []}
              onChanged={onChanged}
              salesByVariant={salesByVariant}
              product={prod}
            />
          )}
        />
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <ProductDialog
          key={`${editing?.id ?? "new"}-${dialogSession}`}
          product={editing}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            onChanged();
          }}
        />
      </Dialog>
    </div>
  );
}

const CUSTOMIZER_PRESETS = {
  print: {
    label_en: "Print / Stamp Shop Preset",
    label_ar: "نموذج مطبعة / متجر أختام",
    fields: [
      {
        key: "stamp_size",
        label_ar: "مقاس الختم / الطباعة",
        label_en: "Stamp/Print Size Swatches",
        type: "select",
        options: ["Q13 (13*49mm)", "Q20 (20*20mm)", "Q30 (30*30mm)"],
        required: true,
      },
      {
        key: "ink_color",
        label_ar: "لون الحبر",
        label_en: "Ink/Color Picker",
        type: "select",
        options: ["Black", "Blue", "Red", "Green"],
        required: true,
      },
      {
        key: "logo_upload",
        label_ar: "تحميل شعار الختم / التصميم",
        label_en: "Upload Logo File Input",
        type: "file",
        options: [],
        required: false,
      },
      {
        key: "custom_note",
        label_ar: "نص الكتابة المطلوب للختم",
        label_en: "Custom Note Text Area",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  fashion: {
    label_en: "Fashion / Abaya Preset",
    label_ar: "نموذج أزياء / عبايات",
    fields: [
      {
        key: "length_note",
        label_ar: "طول العباية المطلوب",
        label_en: "Custom Length Note",
        type: "text",
        options: [],
        required: true,
      },
      {
        key: "fabric_color",
        label_ar: "لون القماش",
        label_en: "Fabric Color Swatches",
        type: "select",
        options: ["Black / أسود", "Navy / كحلي", "Beige / بيج"],
        required: true,
      },
      {
        key: "monogram_text",
        label_ar: "كتابة الحروف أو الاسم",
        label_en: "Monogram Text Input",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  gift: {
    label_en: "Gift / Perfume Preset",
    label_ar: "نموذج هدايا / عطور",
    fields: [
      {
        key: "gift_box",
        label_ar: "إضافة صندوق هدايا فاخر",
        label_en: "Gift Box Add-On (+X BHD)",
        type: "select",
        options: ["No / لا", "Yes (+2.000 BHD) / نعم (+2.000 د.ب)"],
        required: true,
      },
      {
        key: "greeting_card",
        label_ar: "نص كرت الإهداء",
        label_en: "Greeting Card Message Text Area",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  jewelry: {
    label_en: "Jewelry / Engraving Preset",
    label_ar: "نموذج مجوهرات / حفر",
    fields: [
      {
        key: "engraving_text",
        label_ar: "النص المطلوب للحفر",
        label_en: "Custom Engraving Text",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "font_style",
        label_ar: "خط الكتابة",
        label_en: "Font Style Selector",
        type: "select",
        options: ["Arabic Calligraphy / ديواني", "Classic Serif", "Modern Sans-Serif"],
        required: false,
      },
      {
        key: "material_swatch",
        label_ar: "نوع المعدن",
        label_en: "Material/Metal Swatch",
        type: "select",
        options: ["Gold / ذهب", "Silver / فضة", "Rose Gold / روز جولد"],
        required: true,
      },
    ],
  },
};

function ProductDialog({ product, onSaved }: { product: Product | null; onSaved: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const initialForm = {
    name_ar: product?.name_ar ?? "",
    name_en: product?.name_en ?? product?.name ?? "",
    description_ar: product?.description_ar ?? "",
    description_en: product?.description_en ?? product?.description ?? "",
    category: product?.category ?? "",
    base_price: product?.base_price ? String(product.base_price) : "0",
    image_url: product?.image_url ?? "",
    is_active: product?.is_active ?? true,
    featured_trending: product?.featured_trending ?? false,
    show_sale_badge: product?.show_sale_badge ?? true,
    media: (product?.media ?? []) as MediaItem[],
    custom_fields: (Array.isArray(product?.custom_fields)
      ? product!.custom_fields
      : []) as CustomField[],
    variant_label_size_ar: product?.variant_label_size_ar ?? "",
    variant_label_size_en: product?.variant_label_size_en ?? "",
    variant_label_color_ar: product?.variant_label_color_ar ?? "",
    variant_label_color_en: product?.variant_label_color_en ?? "",
    variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
    variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
  };
  const [form, setForm] = useState(initialForm);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const uncommittedUploads = useRef(new Set<string>());
  const removedCommittedMedia = useRef(new Set<string>());

  // Stepper state: 'basic' | 'media' | 'customizer'
  const [activeDialogTab, setActiveDialogTab] = useState<"basic" | "media" | "customizer">("basic");

  useEffect(
    () => () => {
      for (const url of uncommittedUploads.current) {
        void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
      }
      uncommittedUploads.current.clear();
      removedCommittedMedia.current.clear();
    },
    [brand.id],
  );

  useEffect(() => {
    setForm({
      name_ar: product?.name_ar ?? "",
      name_en: product?.name_en ?? product?.name ?? "",
      description_ar: product?.description_ar ?? "",
      description_en: product?.description_en ?? product?.description ?? "",
      category: product?.category ?? "",
      base_price: product?.base_price ? String(product.base_price) : "0",
      image_url: product?.image_url ?? "",
      is_active: product?.is_active ?? true,
      featured_trending: product?.featured_trending ?? false,
      show_sale_badge: product?.show_sale_badge ?? true,
      media: (product?.media ?? []) as MediaItem[],
      custom_fields: (Array.isArray(product?.custom_fields)
        ? product!.custom_fields
        : []) as CustomField[],
      variant_label_size_ar: product?.variant_label_size_ar ?? "",
      variant_label_size_en: product?.variant_label_size_en ?? "",
      variant_label_color_ar: product?.variant_label_color_ar ?? "",
      variant_label_color_en: product?.variant_label_color_en ?? "",
      variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
      variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
    });
    setActiveDialogTab("basic");
  }, [product]);

  const categoriesQ = useQuery({
    queryKey: ["categories", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, slug")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name_en: string;
        name_ar: string | null;
        slug: string | null;
      }>;
    },
  });

  const uploadBlob = async (blob: Blob, _ext: string, kind: "image" | "video") => {
    try {
      setUploading(true);
      const mediaBlob = blob.type
        ? blob
        : new Blob([blob], { type: kind === "image" ? "image/jpeg" : "video/mp4" });
      const url = await uploadPublicMedia(brand.id, mediaBlob, "product");
      uncommittedUploads.current.add(url);
      setForm((f) => ({ ...f, media: [...f.media, { type: kind, url }] }));
      toast.success(isAr ? "تم الرفع" : "Uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFilePicked = (file: File) => {
    if (file.type.startsWith("video")) {
      const ext = file.name.split(".").pop() ?? "mp4";
      setPendingVideo(file);
      void uploadBlob(file, ext, "video").finally(() => setPendingVideo(null));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleCropConfirmed = async (blob: Blob) => {
    await uploadBlob(blob, "jpg", "image");
    setCropSrc(null);
  };

  const removeMedia = (index: number) => {
    const media = form.media[index];
    if (media && uncommittedUploads.current.delete(media.url)) {
      void deletePublicMediaUrl(brand.id, media.url).catch(() => {
        uncommittedUploads.current.add(media.url);
      });
    } else if (media) {
      removedCommittedMedia.current.add(media.url);
    }
    setForm((current) => ({ ...current, media: current.media.filter((_, i) => i !== index) }));
  };

  const save = async (e: React.MouseEvent) => {
    e.preventDefault();
    const nameAr = form.name_ar.trim();
    const nameEn = form.name_en.trim();
    if (!nameAr && !nameEn)
      return toast.error(isAr ? "أدخل اسم المنتج بأي لغة" : "Enter a product name in any language");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const legacyName = nameEn || nameAr;
    const legacyDesc = form.description_en.trim() || form.description_ar.trim() || null;

    if (product) {
      const patch = {
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category,
        base_price: form.base_price ? Number(form.base_price) : 0,
        image_url: form.image_url,
        is_active: form.is_active,
        featured_trending: form.featured_trending,
        show_sale_badge: form.show_sale_badge,
        media: form.media as any,
        custom_fields: (form.custom_fields ?? []) as any,
        variant_label_size_ar: (form.variant_label_size_ar || "").trim() || null,
        variant_label_size_en: (form.variant_label_size_en || "").trim() || null,
        variant_label_color_ar: (form.variant_label_color_ar || "").trim() || null,
        variant_label_color_en: (form.variant_label_color_en || "").trim() || null,
        variant_label_fabric_ar: (form.variant_label_fabric_ar || "").trim() || null,
        variant_label_fabric_en: (form.variant_label_fabric_en || "").trim() || null,
      };
      const { error } = await supabase.from("products").update(patch).eq("id", product.id);
      if (error) return toast.error(error.message);
    } else {
      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category,
        base_price: form.base_price ? Number(form.base_price) : 0,
        image_url: form.image_url,
        is_active: form.is_active,
        featured_trending: form.featured_trending,
        show_sale_badge: form.show_sale_badge,
        media: form.media as any,
        custom_fields: (form.custom_fields ?? []) as any,
        variant_label_size_ar: (form.variant_label_size_ar || "").trim() || null,
        variant_label_size_en: (form.variant_label_size_en || "").trim() || null,
        variant_label_color_ar: (form.variant_label_color_ar || "").trim() || null,
        variant_label_color_en: (form.variant_label_color_en || "").trim() || null,
        variant_label_fabric_ar: (form.variant_label_fabric_ar || "").trim() || null,
        variant_label_fabric_en: (form.variant_label_fabric_en || "").trim() || null,
      };
      const { error } = await (supabase.from("products") as any).insert(payload);
      if (error) return toast.error(error.message);
    }
    for (const url of removedCommittedMedia.current) {
      void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
    }
    removedCommittedMedia.current.clear();
    uncommittedUploads.current.clear();
    toast.success(t("common.save"));
    onSaved();
  };

  return (
    <DialogContent className="max-h-[92vh] md:max-w-3xl p-0 flex flex-col rounded-2xl border border-border/80 shadow-2xl bg-background overflow-hidden">
      {/* Header with gradient bar and stepper indicators */}
      <div className="relative border-b border-border/60 bg-secondary/20 p-5 pb-4">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-indigo-500 to-purple-600" />
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{product ? t("inventory.editProduct") : t("inventory.newProduct")}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Stepper Tabs Bar */}
        <div className="flex items-center gap-2 mt-4 bg-muted/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("basic");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "basic"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{isAr ? "التفاصيل الأساسية" : "Basic Details"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("media");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "media"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>{isAr ? "معرض الصور" : "Media Gallery"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("customizer");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "customizer"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>{isAr ? "محرك التخصيص" : "Customization"}</span>
          </button>
        </div>
      </div>

      {/* Wizard Content Block */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {activeDialogTab === "basic" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <BilingualField
              labelAr="اسم المنتج — عربي"
              labelEn="Product name — English"
              valueAr={form.name_ar}
              valueEn={form.name_en}
              onChangeAr={(v) => setForm({ ...form, name_ar: v })}
              onChangeEn={(v) => setForm({ ...form, name_en: v })}
            />
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {t("inventory.category")}
              </Label>
              <div className="mt-1">
                {(categoriesQ.data ?? []).length > 0 ? (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="">{isAr ? "بدون قسم" : "No category"}</option>
                    {(categoriesQ.data ?? []).map((c) => {
                      const val = c.slug || c.name_en;
                      const label = isAr ? c.name_ar || c.name_en : c.name_en;
                      return (
                        <option key={c.id} value={val}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <Input
                    placeholder={t("inventory.categoryPh")}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                )}
              </div>
              {(categoriesQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {isAr
                    ? "أنشئ أقسامًا من صفحة الأقسام لتظهر هنا كقائمة منسدلة."
                    : "Create categories in the Categories page to get a dropdown here."}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "السعر الأساسي للمنتج (د.ب)" : "Base Price (BHD)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                className="mt-1 h-10.5 rounded-lg"
                placeholder="0.000"
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {isAr
                  ? "السعر الرئيسي للمنتج. عند إضافة خيارات/متغيرات، يمكنك إدخال المبلغ الإضافي (+Amount) وسيتم جمعه تلقائياً."
                  : "The primary base price of the product. When adding variants, you can set an upcharge (+Amount) which will be added automatically."}
              </p>
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {t("inventory.imageUrl")}
              </Label>
              <Input
                className="mt-1 h-10.5 rounded-lg"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "الوصف والتفاصيل التسويقية" : "Product Description"}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const title = form.name_ar || form.name_en || "المنتج";
                  setForm((f) => ({
                    ...f,
                    description_ar: `${title} الفاخر والمميز بلمسة أنيقة وجودة عالية. تصنيع بإتقان يلائم كافة المناسبات ليعكس أناقتك الفريدة.`,
                    description_en: `Premium ${form.name_en || form.name_ar || "product"} crafted with exceptional quality and sophisticated design. Perfectly tailored for everyday elegance and special occasions.`,
                  }));
                  toast.success(
                    isAr
                      ? "تم تم توليد الوصف التسويقي الذكي بنجاح!"
                      : "AI product description generated successfully!",
                  );
                }}
                className="h-8 text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 rounded-lg"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                {isAr ? "✨ صياغة وصف ذكي" : "✨ AI Copywriter"}
              </Button>
            </div>
            <BilingualField
              multiline
              labelAr="الوصف — عربي"
              labelEn="Description — English"
              valueAr={form.description_ar}
              valueEn={form.description_en}
              onChangeAr={(v) => setForm({ ...form, description_ar: v })}
              onChangeEn={(v) => setForm({ ...form, description_en: v })}
            />

            <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 bg-secondary/10 transition hover:bg-secondary/20">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {isAr ? "المنتج مفعّل في المتجر" : "Active in storefront"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "إظهار للعملاء في المتجر العام"
                    : "Show to customers in the public storefront"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-xs font-bold ${form.is_active ? "text-emerald-700 dark:text-emerald-500" : "text-muted-foreground"}`}
                >
                  {form.is_active ? (isAr ? "مفعّل" : "Active") : isAr ? "مخفي" : "Hidden"}
                </span>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  aria-label={isAr ? "إظهار المنتج في المتجر" : "Show product in storefront"}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 bg-secondary/10 transition hover:bg-secondary/20">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {isAr ? "إبراز في الرائج الآن" : "Feature in Trending now"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "يعطي المنتج أولوية للعملاء."
                      : "Prioritizes this product for discovery."}
                  </p>
                </div>
                <Switch
                  checked={form.featured_trending}
                  onCheckedChange={(v) => setForm({ ...form, featured_trending: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 bg-secondary/10 transition hover:bg-secondary/20">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {isAr ? "إظهار شارة التنزيلات" : "Show Sale badge"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "تظهر عند وجود سعر أصلي أعلى."
                      : "Shown when an original price is higher."}
                  </p>
                </div>
                <Switch
                  checked={form.show_sale_badge}
                  onCheckedChange={(v) => setForm({ ...form, show_sale_badge: v })}
                />
              </div>
            </div>

            {/* 🏷️ Custom Variant Labels Section */}
            <div className="rounded-xl border border-border/80 p-5 bg-secondary/10 space-y-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {isAr ? "🏷️ مسميات المتغيرات المخصصة" : "🏷️ Custom Variant Labels"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "تخصيص أسماء أعمدة المقاس، اللون، والخامة لتظهر بالاسم المفضل في صفحة عرض المنتج باللغتين العربية والإنجليزية."
                    : "Override default column labels (Size, Color, Fabric) to match your custom product's options in both Arabic and English."}
                </p>
              </div>
              <div className="space-y-4.5">
                {/* Size Label */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border/40 pb-3">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى المقاس بالعربية (مثال: التصميم)" : "Custom Size Label — Arabic"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder={isAr ? "المقاس / خيار" : "Size / Option"}
                      value={form.variant_label_size_ar || ""}
                      onChange={(e) => setForm({ ...form, variant_label_size_ar: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr
                        ? "مسمى المقاس بالإنجليزية (مثال: Stamp Size)"
                        : "Custom Size Label — English"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder="Size / Option"
                      value={form.variant_label_size_en || ""}
                      onChange={(e) => setForm({ ...form, variant_label_size_en: e.target.value })}
                    />
                  </div>
                </div>

                {/* Color Label */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border/40 pb-3">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى اللون بالعربية" : "Custom Color Label — Arabic"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder={isAr ? "اللون" : "Color"}
                      value={form.variant_label_color_ar || ""}
                      onChange={(e) => setForm({ ...form, variant_label_color_ar: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى اللون بالإنجليزية" : "Custom Color Label — English"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder="Color"
                      value={form.variant_label_color_en || ""}
                      onChange={(e) => setForm({ ...form, variant_label_color_en: e.target.value })}
                    />
                  </div>
                </div>

                {/* Fabric Label */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى الخامة بالعربية" : "Custom Fabric Label — Arabic"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder={isAr ? "الخامة" : "Fabric"}
                      value={form.variant_label_fabric_ar || ""}
                      onChange={(e) =>
                        setForm({ ...form, variant_label_fabric_ar: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى الخامة بالإنجليزية" : "Custom Fabric Label — English"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder="Fabric"
                      value={form.variant_label_fabric_en || ""}
                      onChange={(e) =>
                        setForm({ ...form, variant_label_fabric_en: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeDialogTab === "media" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-xl border border-border bg-secondary/10">
              <Label className="text-sm font-bold text-foreground">
                {isAr ? "وسائط المنتج (صور / فيديو)" : "Product media (images / videos)"}
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                {isAr
                  ? "ارفع صوراً ومقاطع فيديو عالية الجودة لعرض منتجك بأفضل شكل. يدعم صيغ الصور والفيديو الشائعة."
                  : "Upload rich, high-resolution visual assets to show off your products in premium style."}
              </p>
              <div className="flex flex-wrap gap-3">
                {form.media.map((m, i) => (
                  <div
                    key={i}
                    className="relative w-22 h-22 rounded-xl border border-border/80 overflow-hidden bg-secondary shadow-sm group transition-transform hover:scale-[1.02]"
                  >
                    {m.type === "video" ? (
                      <OptimizedVideo
                        src={m.stream_iframe_url ? undefined : m.url}
                        streamIframeUrl={m.stream_iframe_url}
                        poster={m.poster_url ?? m.url}
                        className="h-full w-full object-cover"
                        wrapperClassName="h-full w-full overflow-hidden"
                      />
                    ) : (
                      <ResponsiveImage
                        src={m.url}
                        preset="thumb"
                        sizes="88px"
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      className="absolute top-1.5 end-1.5 bg-background/95 hover:bg-destructive hover:text-white rounded-full p-1.5 shadow transition-colors touch-manipulation"
                      onClick={(e) => {
                        e.preventDefault();
                        removeMedia(i);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="w-22 h-22 rounded-xl border-2 border-dashed border-border/80 hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground cursor-pointer hover:bg-secondary/40 transition-colors shadow-sm touch-manipulation">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <>
                      <Plus className="h-5 w-5 text-muted-foreground/80" />
                      <span className="text-[10px] font-bold">{isAr ? "إضافة" : "Add media"}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFilePicked(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {activeDialogTab === "customizer" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-xl border border-border p-5 bg-secondary/10 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                <div>
                  <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <span>
                      {isAr ? "⚙️ محرك تصميم وتخصيص المنتج" : "⚙️ Product Customization Engine"}
                    </span>
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
                      Unlimited
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {isAr
                      ? "أضف حقولاً مخصصة غير محدودة لتمكين العميل من تخصيص طلبه."
                      : "Configure unlimited bespoke text fields, dropdown options, and upload forms."}
                  </div>
                </div>
                <div
                  className="flex flex-wrap items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Select
                    onValueChange={(presetKey) => {
                      const preset =
                        CUSTOMIZER_PRESETS[presetKey as keyof typeof CUSTOMIZER_PRESETS];
                      if (preset) {
                        setForm({
                          ...form,
                          custom_fields: [
                            ...(form.custom_fields ?? []),
                            ...preset.fields.map(
                              (f, index) =>
                                ({
                                  ...f,
                                  key: `f${Date.now()}-${index}-${f.key}`,
                                }) as CustomField,
                            ),
                          ],
                        });
                        toast.success(
                          isAr ? "تم تطبيق النموذج بنجاح" : "Preset applied successfully",
                        );
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-48 rounded-lg bg-background font-bold">
                      <SelectValue
                        placeholder={isAr ? "⚡ نموذج مسبق سريع" : "⚡ Quick Preset Customizer"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="print">
                        {isAr ? "أختام وطباعة" : "Print / Stamp Shop"}
                      </SelectItem>
                      <SelectItem value="fashion">
                        {isAr ? "عبايات وأزياء" : "Fashion / Abaya"}
                      </SelectItem>
                      <SelectItem value="gift">
                        {isAr ? "عطور وهدايا" : "Gift / Perfume"}
                      </SelectItem>
                      <SelectItem value="jewelry">
                        {isAr ? "مجوهرات وحفر" : "Jewelry / Engraving"}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg font-bold touch-manipulation"
                    onClick={(e) => {
                      e.preventDefault();
                      setForm({
                        ...form,
                        custom_fields: [
                          ...(form.custom_fields ?? []),
                          {
                            key: `f${Date.now()}`,
                            label_ar: "",
                            label_en: "",
                            type: "text",
                            options: [],
                            required: false,
                          },
                        ],
                      });
                    }}
                  >
                    {isAr ? "إضافة حقل" : "Add field"}
                  </Button>
                </div>
              </div>

              {(form.custom_fields ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border-2 border-dashed border-border/70 rounded-xl bg-background/50">
                  <Sliders className="h-8 w-8 opacity-40 mb-2.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">
                    {isAr ? "لا توجد خيارات مخصصة مفعلة" : "No custom options configured yet"}
                  </span>
                  <span className="text-[10px] opacity-75 mt-1">
                    {isAr
                      ? "استخدم النماذج السريعة بالأعلى لتعبئة الحقول بضغطة زر!"
                      : "Use the dropdown template presets above to populate in 1-click!"}
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  {(form.custom_fields ?? []).map((f, i) => {
                    const upd = (patch: Partial<CustomField>) => {
                      const next = [...form.custom_fields];
                      next[i] = { ...next[i], ...patch };
                      setForm({ ...form, custom_fields: next });
                    };
                    const remove = () =>
                      setForm({
                        ...form,
                        custom_fields: form.custom_fields.filter((_, j) => j !== i),
                      });
                    return (
                      <div
                        key={f.key}
                        className="rounded-xl border border-border p-4 bg-background space-y-3 shadow-sm transition hover:border-primary/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <Input
                            className="h-9 text-xs rounded-lg"
                            placeholder={isAr ? "التسمية بالعربية" : "Arabic label"}
                            value={f.label_ar ?? ""}
                            onChange={(e) => upd({ label_ar: e.target.value })}
                          />
                          <Input
                            className="h-9 text-xs rounded-lg"
                            placeholder={isAr ? "التسمية بالإنجليزية" : "English label"}
                            value={f.label_en ?? ""}
                            onChange={(e) => upd({ label_en: e.target.value })}
                          />
                          <Select
                            value={f.type}
                            onValueChange={(v) => upd({ type: v as CustomField["type"] })}
                          >
                            <SelectTrigger className="h-9 text-xs rounded-lg font-bold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">{isAr ? "نص" : "Text"}</SelectItem>
                              <SelectItem value="number">{isAr ? "رقم" : "Number"}</SelectItem>
                              <SelectItem value="select">
                                {isAr ? "قائمة اختيار" : "Dropdown"}
                              </SelectItem>
                              <SelectItem value="file">
                                {isAr ? "رفع ملف" : "File upload"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {f.type === "select" && (
                          <Input
                            className="h-9 text-xs rounded-lg"
                            placeholder={
                              isAr
                                ? "الخيارات مفصولة بفاصلة (,) أو (،)"
                                : "Options separated by commas"
                            }
                            defaultValue={(f.options ?? []).join(", ")}
                            onChange={(e) =>
                              upd({
                                options: e.target.value
                                  .split(/[,،]/)
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        )}

                        {/* Real-time storefront preview block */}
                        <div className="rounded-lg bg-muted/40 p-3 border border-dashed border-border/60 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                              {isAr
                                ? "👁️ معاينة فورية لصفحة المنتج"
                                : "👁️ Real-time Storefront Preview"}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1 font-bold text-foreground/90">
                              <span>
                                {isAr
                                  ? f.label_ar || f.label_en || "اسم الحقل"
                                  : f.label_en || f.label_ar || "Field Name"}
                              </span>
                              {f.required && <span className="text-red-500 font-bold">*</span>}
                            </div>
                            {f.type === "text" && (
                              <Input
                                disabled
                                className="h-8.5 text-xs bg-background rounded-lg"
                                placeholder={isAr ? "كتابة نص مخصص..." : "Enter custom text..."}
                              />
                            )}
                            {f.type === "number" && (
                              <Input
                                disabled
                                type="number"
                                className="h-8.5 text-xs bg-background rounded-lg"
                                placeholder="123"
                              />
                            )}
                            {f.type === "file" && (
                              <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background text-muted-foreground">
                                <svg
                                  className="h-4 w-4 opacity-60"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                  />
                                </svg>
                                <span className="text-[10px] font-bold">
                                  {isAr
                                    ? "انقر لرفع ملف مخصص (.pdf, .png, .jpg)"
                                    : "Click to upload custom file (.pdf, .png, .jpg)"}
                                </span>
                              </div>
                            )}
                            {f.type === "select" && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {(f.options ?? []).length === 0 ? (
                                  <span className="text-[11px] text-muted-foreground italic">
                                    {isAr ? "لا توجد خيارات بعد" : "No options specified yet"}
                                  </span>
                                ) : (
                                  (f.options ?? []).map((opt) => (
                                    <div
                                      key={opt}
                                      className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm"
                                    >
                                      {opt}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          className="flex items-center justify-between border-t border-border/40 pt-3 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <Switch
                              checked={!!f.required}
                              onCheckedChange={(v) => upd({ required: v })}
                            />
                            <span className="text-muted-foreground">
                              {isAr ? "حقل إلزامي" : "Required field"}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 p-0 touch-manipulation"
                              disabled={i === 0}
                              onClick={(e) => {
                                e.preventDefault();
                                const next = [...form.custom_fields];
                                const temp = next[i];
                                next[i] = next[i - 1];
                                next[i - 1] = temp;
                                setForm({ ...form, custom_fields: next });
                              }}
                              title={isAr ? "نقل للأعلى" : "Move Up"}
                            >
                              ▲
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 p-0 touch-manipulation"
                              disabled={i === (form.custom_fields ?? []).length - 1}
                              onClick={(e) => {
                                e.preventDefault();
                                const next = [...form.custom_fields];
                                const temp = next[i];
                                next[i] = next[i + 1];
                                next[i + 1] = temp;
                                setForm({ ...form, custom_fields: next });
                              }}
                              title={isAr ? "نقل للأسفل" : "Move Down"}
                            >
                              ▼
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 text-[11px] rounded font-bold touch-manipulation"
                              onClick={(e) => {
                                e.preventDefault();
                                remove();
                              }}
                            >
                              {isAr ? "حذف" : "Remove"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Persistent Footer with back/next and global save actions */}
      <div className="border-t border-border/60 bg-secondary/20 px-6 py-4.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeDialogTab !== "basic" && (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4 rounded-xl font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                if (activeDialogTab === "media") setActiveDialogTab("basic");
                else if (activeDialogTab === "customizer") setActiveDialogTab("media");
              }}
            >
              {isAr ? "السابق" : "Back"}
            </Button>
          )}
          {activeDialogTab !== "customizer" && (
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4 rounded-xl font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                if (activeDialogTab === "basic") setActiveDialogTab("media");
                else if (activeDialogTab === "media") setActiveDialogTab("customizer");
              }}
            >
              {isAr ? "التالي" : "Next"}
            </Button>
          )}
        </div>
        <Button
          type="button"
          onClick={save}
          className="h-10 px-5 rounded-xl font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 touch-manipulation"
        >
          {t("common.save")}
        </Button>
      </div>
    </DialogContent>
  );
}

type BulkVariantRow = {
  size: string;
  size_unit: string;
  color: string;
  fabric: string;
  sku: string;
  barcode: string;
  cost_price: number;
  selling_price: number;
  stock_main: number;
  stock_incubator: number;
};

const splitVariantValues = (value: string) => [
  ...new Set(
    value
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const skuPart = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
const makeEan13 = (used: Set<string>) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    const body = `29${String(bytes[0]).padStart(10, "0").slice(-10)}`;
    const sum = body
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const code = `${body}${(10 - (sum % 10)) % 10}`;
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  throw new Error("BARCODE_GENERATION_FAILED");
};

function BulkVariantDialog({
  productId,
  variants,
  canViewFinancials,
  onChanged,
}: {
  productId: string;
  variants: Variant[];
  canViewFinancials: boolean;
  onChanged: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const blank: VariantGenerationPlan = {
    base_sku: "",
    sizes: [],
    colors: [],
    fabric: "",
    size_unit: "",
    cost_price: 0,
    selling_price: 0,
    stock_main: 0,
    stock_incubator: 0,
  };
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<VariantGenerationPlan>(blank);
  const [sizesText, setSizesText] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [rows, setRows] = useState<BulkVariantRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyPlan = (next: VariantGenerationPlan) => {
    setPlan(next);
    setSizesText(next.sizes.join(", "));
    setColorsText(next.colors.join(", "));
    setRows([]);
  };
  const parseWithAi = async () => {
    if (prompt.trim().length < 3)
      return toast.error(isAr ? "اكتب وصفاً للمتغيرات أولاً" : "Describe the variants first");
    setParsing(true);
    try {
      applyPlan(await parseVariantPrompt({ data: { prompt, language: isAr ? "ar" : "en" } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("RATE_LIMITED")
          ? isAr
            ? "تم بلوغ حد الاستخدام، استخدم الإنشاء اليدوي مؤقتاً"
            : "AI limit reached; use the manual builder for now"
          : message.includes("QUOTA_CONFIGURATION_ERROR")
            ? isAr
              ? "يلزم تطبيق تحديث قاعدة البيانات الخاص بمنشئ المتغيرات"
              : "The variant-generator database update still needs to be applied"
            : message.includes("GEMINI_AUTH_FAILED")
              ? isAr
                ? "مفتاح Gemini غير صالح أو غير متاح"
                : "The Gemini API key is invalid or unavailable"
              : isAr
                ? "تعذر فهم الطلب. يمكنك إدخال القيم يدوياً."
                : "Could not parse the request. You can enter the values manually.",
      );
    } finally {
      setParsing(false);
    }
  };
  const buildPreview = () => {
    const sizes = splitVariantValues(sizesText);
    const colors = splitVariantValues(colorsText);
    const combinations = Math.max(1, sizes.length) * Math.max(1, colors.length);
    if (combinations > 100)
      return toast.error(
        isAr ? "الحد الأقصى 100 متغير في المرة الواحدة" : "Maximum 100 variants per batch",
      );
    if (!plan.base_sku.trim())
      return toast.error(isAr ? "أدخل رمز المنتج الأساسي" : "Enter a base SKU");
    const usedBarcodes = new Set(variants.map((v) => v.barcode).filter(Boolean) as string[]);
    const sizeAxis = sizes.length ? sizes : [""];
    const colorAxis = colors.length ? colors : [""];
    const generated = sizeAxis.flatMap((size) =>
      colorAxis.map((color) => {
        const suffix = [color, size].map(skuPart).filter(Boolean).join("-");
        return {
          ...plan,
          size,
          color,
          size_unit: plan.size_unit,
          sku: `${skuPart(plan.base_sku)}${suffix ? `-${suffix}` : ""}`,
          barcode: makeEan13(usedBarcodes),
        } as BulkVariantRow;
      }),
    );
    setRows(generated);
  };
  const patchRow = (index: number, patch: Partial<BulkVariantRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const saveAll = async () => {
    const existingSkus = new Set(variants.map((v) => v.sku?.trim().toUpperCase()).filter(Boolean));
    const existingBarcodes = new Set(
      variants.map((v) => v.barcode?.trim().toUpperCase()).filter(Boolean),
    );
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const invalid = rows.some((row) => {
      const sku = row.sku.trim().toUpperCase();
      const barcode = row.barcode.trim().toUpperCase();
      const bad =
        !sku ||
        !barcode ||
        existingSkus.has(sku) ||
        existingBarcodes.has(barcode) ||
        seenSkus.has(sku) ||
        seenBarcodes.has(barcode) ||
        row.selling_price < 0 ||
        row.cost_price < 0 ||
        !Number.isInteger(row.stock_main) ||
        row.stock_main < 0 ||
        !Number.isInteger(row.stock_incubator) ||
        row.stock_incubator < 0;
      seenSkus.add(sku);
      seenBarcodes.add(barcode);
      return bad;
    });
    if (!rows.length || invalid)
      return toast.error(
        isAr
          ? "راجع الرموز والأسعار والمخزون؛ توجد قيمة ناقصة أو مكررة"
          : "Review SKUs, barcodes, prices, and stock; a value is missing or duplicated",
      );
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("AUTH_REQUIRED");
      const { error } = await (supabase.from("product_variants") as any).insert(
        rows.map((row) => ({
          user_id: user.id,
          brand_id: brand.id,
          product_id: productId,
          size: row.size || null,
          size_unit: row.size_unit || null,
          color: row.color || null,
          fabric: row.fabric || null,
          sku: row.sku.trim(),
          barcode: row.barcode.trim(),
          cost_price: canViewFinancials ? row.cost_price : 0,
          selling_price: row.selling_price,
          stock_main: row.stock_main,
          stock_incubator: row.stock_incubator,
        })),
      );
      if (error) throw error;
      toast.success(isAr ? `تمت إضافة ${rows.length} متغير` : `${rows.length} variants added`);
      setOpen(false);
      setRows([]);
      setPrompt("");
      applyPlan(blank);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isAr ? "فشل الحفظ" : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wand2 className="me-2 h-4 w-4" />
          {isAr ? "إنشاء متغيرات متعددة" : "Bulk / AI variants"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isAr ? "منشئ متغيرات المنتج" : "Product variant builder"}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
          <Label>
            {isAr
              ? "صف المتغيرات بالعربية أو الإنجليزية"
              : "Describe variants in English or Arabic"}
          </Label>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isAr
                ? "مثال: كود NP24، الألوان أسود وأخضر وأبيض، المقاسات من 1 إلى 5، السعر 15 د.ب"
                : "Example: code NP24, black, green and white, sizes 1 to 5, priced at BHD 15"
            }
          />
          <Button type="button" onClick={parseWithAi} disabled={parsing}>
            {parsing
              ? isAr
                ? "جاري التحليل..."
                : "Parsing..."
              : isAr
                ? "تحليل بالذكاء الاصطناعي"
                : "Parse with AI"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "الذكاء الاصطناعي يعبئ الحقول فقط. لن يتم حفظ شيء قبل المراجعة والتأكيد."
              : "AI only fills the fields. Nothing is saved until you review and confirm."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>{isAr ? "رمز المنتج الأساسي" : "Base SKU"}</Label>
            <Input
              value={plan.base_sku}
              onChange={(e) => setPlan({ ...plan, base_sku: e.target.value })}
            />
          </div>
          <div>
            <Label>{isAr ? "المقاسات (بفاصلة)" : "Sizes (comma separated)"}</Label>
            <Input value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
          </div>
          <div>
            <Label>{isAr ? "الألوان (بفاصلة)" : "Colors (comma separated)"}</Label>
            <Input value={colorsText} onChange={(e) => setColorsText(e.target.value)} />
          </div>
          <div>
            <Label>{isAr ? "الخامة" : "Fabric"}</Label>
            <Input
              value={plan.fabric}
              onChange={(e) => setPlan({ ...plan, fabric: e.target.value })}
            />
          </div>
          <div>
            <Label>{isAr ? "وحدة المقاس" : "Size unit"}</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              value={plan.size_unit}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  size_unit: e.target.value as VariantGenerationPlan["size_unit"],
                })
              }
            >
              {SIZE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit || "—"}
                </option>
              ))}
            </select>
          </div>
          {canViewFinancials && (
            <div>
              <Label>{isAr ? "التكلفة" : "Cost"}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={plan.cost_price}
                onChange={(e) => setPlan({ ...plan, cost_price: Number(e.target.value) })}
              />
            </div>
          )}
          <div>
            <Label>{isAr ? "سعر البيع" : "Selling price"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={plan.selling_price}
              onChange={(e) => setPlan({ ...plan, selling_price: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>{isAr ? "مخزون الرئيسي" : "Main stock"}</Label>
            <Input
              type="number"
              min="0"
              value={plan.stock_main}
              onChange={(e) => setPlan({ ...plan, stock_main: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>{isAr ? "مخزون الحاضنة" : "Incubator stock"}</Label>
            <Input
              type="number"
              min="0"
              value={plan.stock_incubator}
              onChange={(e) => setPlan({ ...plan, stock_incubator: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={buildPreview}>
          <Boxes className="me-2 h-4 w-4" />
          {isAr ? "إنشاء المعاينة" : "Build preview"}
        </Button>
        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {isAr ? `معاينة ${rows.length} متغير` : `Preview ${rows.length} variants`}
              </Label>
              <span className="text-xs text-muted-foreground">
                {isAr ? "يمكن تعديل كل قيمة" : "Every value is editable"}
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {[
                      isAr ? "المقاس" : "Size",
                      isAr ? "اللون" : "Color",
                      isAr ? "الخامة" : "Fabric",
                      "SKU",
                      isAr ? "الباركود" : "Barcode",
                      ...(canViewFinancials ? [isAr ? "التكلفة" : "Cost"] : []),
                      isAr ? "السعر" : "Price",
                      isAr ? "الرئيسي" : "Main",
                      isAr ? "الحاضنة" : "Incubator",
                      "",
                    ].map((label) => (
                      <th key={label} className="p-2 text-start">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${index}-${row.barcode}`} className="border-t">
                      {(["size", "color", "fabric", "sku", "barcode"] as const).map((field) => (
                        <td key={field} className="p-1">
                          <Input
                            className="h-8 min-w-24"
                            value={row[field]}
                            onChange={(e) => patchRow(index, { [field]: e.target.value })}
                          />
                        </td>
                      ))}
                      {canViewFinancials && (
                        <td className="p-1">
                          <Input
                            className="h-8 w-24"
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.cost_price}
                            onChange={(e) =>
                              patchRow(index, { cost_price: Number(e.target.value) })
                            }
                          />
                        </td>
                      )}
                      <td className="p-1">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.selling_price}
                          onChange={(e) =>
                            patchRow(index, { selling_price: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min="0"
                          value={row.stock_main}
                          onChange={(e) => patchRow(index, { stock_main: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min="0"
                          value={row.stock_incubator}
                          onChange={(e) =>
                            patchRow(index, { stock_incubator: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="p-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setRows((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={saveAll} disabled={!rows.length || saving}>
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving..."
              : isAr
                ? `حفظ ${rows.length} متغير`
                : `Save ${rows.length} variants`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VariantImageUploaderProps {
  brandId: string;
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  isAr: boolean;
}

function VariantImageUploader({ brandId, imageUrl, onChange, isAr }: VariantImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "product");
      onChange(url);
      toast.success(isAr ? "تم الرفع بنجاح" : "Uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="relative group w-11 h-11 rounded-lg border border-dashed border-input flex items-center justify-center bg-muted/40 hover:bg-muted/80 transition-all cursor-pointer overflow-hidden shrink-0">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : imageUrl ? (
        <>
          <img src={imageUrl} alt="variant" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="p-1 rounded bg-white/20 text-white hover:bg-white/30 transition-colors"
              title={isAr ? "تغيير" : "Change"}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 rounded bg-rose-600/80 text-white hover:bg-rose-600 transition-colors"
              title={isAr ? "حذف" : "Remove"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-primary transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function StockStepper({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  return (
    <div
      className="inline-flex items-center border border-input bg-background rounded-lg overflow-hidden h-9 shadow-sm shrink-0 select-none max-w-[105px]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="w-8 h-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all text-muted-foreground hover:text-foreground font-black text-sm border-r border-input"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(Math.max(0, value - 1));
        }}
      >
        -
      </button>
      <input
        type="number"
        className="w-9 text-center bg-transparent border-0 outline-none h-full font-bold text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-0.5"
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(Math.max(0, parseInt(e.target.value) || 0));
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="w-8 h-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all text-muted-foreground hover:text-foreground font-black text-sm border-l border-input"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(value + 1);
        }}
      >
        +
      </button>
    </div>
  );
}

function PremiumCurrencyInput({
  value,
  onChange,
  onBlur,
  className = "",
  placeholder = "0.000",
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div
      className="relative inline-flex items-center w-full min-w-[115px] max-w-[130px] shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="number"
        step="0.001"
        placeholder={placeholder}
        className={`w-full h-9.5 pl-2.5 pr-8 text-center font-mono font-bold bg-background border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-xs shadow-2xs transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <span className="absolute end-2.5 text-[9px] font-black text-muted-foreground/60 pointer-events-none uppercase tracking-tight">
        BHD
      </span>
    </div>
  );
}

function VariantDesktopRow({
  v,
  canViewFinancials,
  barcodeLabel,
  SIZE_UNITS,
  salesByVariant,
  t,
  isAr,
  brand,
  update,
  productName,
  businessName,
  genBarcode,
  del,
  isSelected,
  onToggleSelect,
  renderImageCol,
  renderSkuCol,
  renderBarcodeCol,
  product,
}: {
  v: Variant;
  canViewFinancials: boolean;
  barcodeLabel: string;
  SIZE_UNITS: readonly string[];
  salesByVariant: Map<string, number>;
  t: any;
  isAr: boolean;
  brand: { id: string };
  update: (v: Variant, patch: Partial<Variant>) => void;
  productName: string;
  businessName: string | null;
  genBarcode: () => string;
  del: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  renderImageCol: boolean;
  renderSkuCol: boolean;
  renderBarcodeCol: boolean;
  product?: Product;
}) {
  const [costVal, setCostVal] = useState(String(v.cost_price));
  const [sellingVal, setSellingVal] = useState(String(v.selling_price));

  useEffect(() => {
    setCostVal(String(v.cost_price));
  }, [v.cost_price]);

  useEffect(() => {
    setSellingVal(String(v.selling_price));
  }, [v.selling_price]);

  const costNum = Number(costVal) || 0;
  const sellingNum = Number(sellingVal) || 0;
  const currentMargin = sellingNum > 0 ? ((sellingNum - costNum) / sellingNum) * 100 : 0;

  // Local state for combined attributes inline editor
  const [isEditingAttrs, setIsEditingAttrs] = useState(false);
  const [sizeVal, setSizeVal] = useState(v.size ?? "");
  const [sizeUnitVal, setSizeUnitVal] = useState(v.size_unit ?? "");
  const [colorVal, setColorVal] = useState(v.color ?? "");
  const [fabricVal, setFabricVal] = useState(v.fabric ?? "");

  // Sync back on external changes
  useEffect(() => {
    setSizeVal(v.size ?? "");
    setSizeUnitVal(v.size_unit ?? "");
    setColorVal(v.color ?? "");
    setFabricVal(v.fabric ?? "");
  }, [v.size, v.size_unit, v.color, v.fabric]);

  const saveAttributes = () => {
    update(v, {
      size: sizeVal || null,
      size_unit: sizeUnitVal || null,
      color: colorVal || null,
      fabric: fabricVal || null,
    });
    setIsEditingAttrs(false);
  };

  return (
    <tr
      className={`border-t border-border transition-all ${isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/15"}`}
    >
      {/* Checkbox */}
      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
          checked={isSelected}
          onChange={onToggleSelect}
        />
      </td>

      {/* Combined Variant Attributes */}
      <td className="px-2 py-3 text-start align-middle" onClick={(e) => e.stopPropagation()}>
        {isEditingAttrs ? (
          <div className="flex flex-col gap-2.5 p-3 bg-card/95 backdrop-blur-md border border-primary/30 rounded-2xl w-[320px] sm:w-[350px] shadow-xl animate-in fade-in zoom-in-95 duration-150 relative z-40">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {(isAr ? product?.variant_label_size_ar : product?.variant_label_size_en) ||
                    product?.variant_label_size_en ||
                    product?.variant_label_size_ar ||
                    (isAr ? "المقاس" : "Size")}
                </span>
                <input
                  className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={sizeVal}
                  onChange={(e) => setSizeVal(e.target.value)}
                  placeholder={isAr ? "المقاس" : "Size"}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {isAr ? "الوحدة" : "Unit"}
                </span>
                <select
                  className="h-9 w-full px-2 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={sizeUnitVal}
                  onChange={(e) => setSizeUnitVal(e.target.value)}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u || "—"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {(isAr ? product?.variant_label_color_ar : product?.variant_label_color_en) ||
                    product?.variant_label_color_en ||
                    product?.variant_label_color_ar ||
                    (isAr ? "اللون" : "Color")}
                </span>
                <input
                  className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={colorVal}
                  onChange={(e) => setColorVal(e.target.value)}
                  placeholder={isAr ? "اللون" : "Color"}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {(isAr ? product?.variant_label_fabric_ar : product?.variant_label_fabric_en) ||
                    product?.variant_label_fabric_en ||
                    product?.variant_label_fabric_ar ||
                    (isAr ? "الخامة" : "Fabric")}
                </span>
                <input
                  className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={fabricVal}
                  onChange={(e) => setFabricVal(e.target.value)}
                  placeholder={isAr ? "الخامة" : "Fabric"}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/60 mt-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">
                {isAr ? "تعديل المتغير" : "Edit Variant Attributes"}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground flex items-center gap-1 text-xs font-semibold transition-colors"
                  onClick={() => setIsEditingAttrs(false)}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{isAr ? "إلغاء" : "Cancel"}</span>
                </button>
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 text-xs font-bold transition-all shadow-xs"
                  onClick={saveAttributes}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isAr ? "حفظ" : "Save"}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap group/v">
            {[v.size, v.color, v.fabric].some(Boolean) ? (
              <>
                {v.size && (
                  <span className="inline-flex items-center bg-primary/5 text-primary text-xs font-semibold px-2 py-0.5 border border-primary/10 rounded-md">
                    {v.size} {v.size_unit || ""}
                  </span>
                )}
                {v.color && (
                  <span className="inline-flex items-center bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 text-xs font-semibold px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded-md gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                    {v.color}
                  </span>
                )}
                {v.fabric && (
                  <span className="inline-flex items-center bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 text-xs font-semibold px-2 py-0.5 border border-zinc-200 dark:border-slate-700 rounded-md">
                    {v.fabric}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs italic">
                {isAr ? "متغير قياسي" : "Standard Variant"}
              </span>
            )}

            {!renderBarcodeCol && (v.barcode || v.sku) && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/85 bg-muted/70 px-1.5 py-0.5 rounded-md border border-border/60 shrink-0">
                <Barcode className="h-3 w-3 text-primary/80" />
                <span>{v.barcode || v.sku}</span>
              </span>
            )}

            <button
              type="button"
              className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground opacity-0 group-hover/v:opacity-100 transition-opacity"
              onClick={() => setIsEditingAttrs(true)}
              title={isAr ? "تعديل الخصائص" : "Edit attributes"}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </td>

      {/* Image Column */}
      {renderImageCol && (
        <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center">
            <VariantImageUploader
              brandId={brand.id}
              imageUrl={v.image_url}
              onChange={(url) => update(v, { image_url: url })}
              isAr={isAr}
            />
          </div>
        </td>
      )}

      {/* SKU Column */}
      {renderSkuCol && (
        <td className="px-2 py-3 text-start" onClick={(e) => e.stopPropagation()}>
          <input
            className="w-full bg-transparent hover:bg-muted/30 focus:bg-background border border-transparent hover:border-input focus:border-input px-2 py-1 rounded-md transition outline-none font-mono text-xs"
            defaultValue={v.sku ?? ""}
            onBlur={(e) => update(v, { sku: e.target.value || null })}
            placeholder="—"
          />
        </td>
      )}

      {/* Barcode Column */}
      {renderBarcodeCol && (
        <td className="px-2 py-3 text-start" onClick={(e) => e.stopPropagation()}>
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              className="min-w-0 flex-1 bg-transparent hover:bg-muted/30 focus:bg-background border border-transparent hover:border-input focus:border-input px-2 py-1 rounded-md transition font-mono text-xs outline-none"
              placeholder={isAr ? "بدون" : "None"}
              defaultValue={v.barcode ?? ""}
              onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
            />
            <button
              type="button"
              title={isAr ? "توليد باركود" : "Generate barcode"}
              className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-secondary active:scale-95 transition touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                update(v, { barcode: genBarcode() });
              }}
            >
              <Wand2 className="h-3 w-3" />
            </button>
            {v.barcode && (
              <PrintLabelButton
                label={isAr ? "طباعة" : "Print"}
                data={{
                  code: v.barcode,
                  productName,
                  size: v.size,
                  color: v.color,
                  price: v.selling_price,
                  businessName,
                }}
              />
            )}
          </div>
        </td>
      )}

      {/* Cost Column */}
      {canViewFinancials && (
        <td className="px-2 py-3 text-center">
          <PremiumCurrencyInput
            value={costVal}
            onChange={setCostVal}
            onBlur={(e) => update(v, { cost_price: Number(e.target.value) })}
          />
        </td>
      )}

      {/* Price Column */}
      <td className="px-2 py-3 text-center">
        <PremiumCurrencyInput
          value={sellingVal}
          onChange={setSellingVal}
          onBlur={(e) => update(v, { selling_price: Number(e.target.value) })}
        />
      </td>

      {/* Original Price Column */}
      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          step="0.001"
          min="0"
          className="w-full h-9 px-2 text-center bg-transparent hover:bg-muted/30 focus:bg-background border border-transparent hover:border-input focus:border-input rounded-lg outline-none font-medium text-xs max-w-[100px]"
          defaultValue={v.original_price ?? ""}
          placeholder="—"
          onBlur={(e) =>
            update(v, { original_price: e.target.value ? Number(e.target.value) : null })
          }
        />
      </td>

      {/* Margin Column */}
      {canViewFinancials && (
        <td className="px-2 py-3 text-center">
          {(() => {
            let marginBg =
              "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
            if (currentMargin < 20) {
              marginBg =
                "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30";
            } else if (currentMargin < 50) {
              marginBg =
                "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
            }
            return (
              <span
                className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${marginBg}`}
              >
                <TrendingUp className="h-3 w-3" />
                {currentMargin.toFixed(0)}%
              </span>
            );
          })()}
        </td>
      )}

      {/* Stock Main */}
      <td className="px-2 py-3 text-center">
        <StockStepper
          value={v.stock_main ?? 0}
          onChange={(val) => update(v, { stock_main: val })}
        />
      </td>

      {/* Stock Incubator */}
      <td className="px-2 py-3 text-center">
        <StockStepper
          value={v.stock_incubator ?? 0}
          onChange={(val) => update(v, { stock_incubator: val })}
        />
      </td>

      {/* Stock Total Run Rate Column */}
      <td className="px-2 py-3 text-center">
        <div className="font-extrabold text-sm text-foreground">
          {(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}
        </div>
        {(() => {
          const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
          const qtySold = salesByVariant.get(v.id) || 0;
          const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
          const daysElapsed = variantCreatedAt
            ? Math.max(
                1,
                Math.min(
                  45,
                  Math.ceil(
                    (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
                  ),
                ),
              )
            : 45;
          const dailyVelocity = qtySold / daysElapsed;

          let runRateText = isAr ? "لا مبيعات" : "No sales";
          let runRateColor = "text-muted-foreground/60 text-[9px]";

          if (stock <= 0) {
            runRateText = isAr ? "نفد" : "Out of stock";
            runRateColor = "text-rose-600 dark:text-rose-400 font-bold text-[9px]";
          } else if (dailyVelocity > 0) {
            const days = Math.ceil(stock / dailyVelocity);
            runRateText = isAr ? `ينفد في ${days} ي` : `${days} d left`;
            runRateColor =
              days <= 7
                ? "text-amber-600 dark:text-amber-400 font-bold text-[9px]"
                : "text-emerald-600 dark:text-emerald-400 font-medium text-[9px]";
          }

          return (
            <div className={`text-[9px] mt-0.5 whitespace-nowrap leading-none ${runRateColor}`}>
              {runRateText}
            </div>
          );
        })()}
      </td>

      {/* Delete button */}
      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <InventoryDeleteAction
          message={t("inventory.deleteVariantConfirm")}
          onConfirm={() => del(v.id)}
        />
      </td>
    </tr>
  );
}

function VariantMobileCard({
  v,
  canViewFinancials,
  barcodeLabel,
  SIZE_UNITS,
  salesByVariant,
  t,
  isAr,
  brand,
  update,
  del,
  mainLabel,
  incLabel,
  isSelected,
  onToggleSelect,
}: {
  v: Variant;
  canViewFinancials: boolean;
  barcodeLabel: string;
  SIZE_UNITS: readonly string[];
  salesByVariant: Map<string, number>;
  t: any;
  isAr: boolean;
  brand: { id: string };
  update: (v: Variant, patch: Partial<Variant>) => void;
  del: (id: string) => void;
  mainLabel: string;
  incLabel: string;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const [costVal, setCostVal] = useState(String(v.cost_price));
  const [sellingVal, setSellingVal] = useState(String(v.selling_price));

  useEffect(() => {
    setCostVal(String(v.cost_price));
  }, [v.cost_price]);

  useEffect(() => {
    setSellingVal(String(v.selling_price));
  }, [v.selling_price]);

  const costNum = Number(costVal) || 0;
  const sellingNum = Number(sellingVal) || 0;
  const currentMargin = sellingNum > 0 ? ((sellingNum - costNum) / sellingNum) * 100 : 0;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3.5 shadow-sm transition-all bg-background ${isSelected ? "border-primary bg-primary/5/10" : "border-border"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4.5 w-4.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
            checked={isSelected}
            onChange={onToggleSelect}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {[v.size, v.color, v.fabric].some(Boolean) ? (
              <>
                {v.size && (
                  <span className="inline-flex items-center bg-primary/5 text-primary text-[10px] font-bold px-1.5 py-0.5 border border-primary/10 rounded-sm">
                    {v.size} {v.size_unit || ""}
                  </span>
                )}
                {v.color && (
                  <span className="inline-flex items-center bg-slate-100 text-slate-800 text-[10px] font-bold px-1.5 py-0.5 border border-slate-200 rounded-sm">
                    {v.color}
                  </span>
                )}
                {v.fabric && (
                  <span className="inline-flex items-center bg-zinc-100 text-zinc-800 text-[10px] font-bold px-1.5 py-0.5 border border-zinc-200 rounded-sm">
                    {v.fabric}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs italic font-semibold">
                {isAr ? "متغير قياسي" : "Standard Variant"}
              </span>
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <InventoryDeleteAction
            message={t("inventory.deleteVariantConfirm")}
            onConfirm={() => del(v.id)}
            mobile
          />
        </div>
      </div>

      {/* Quick stock is the default mobile workflow. */}
      <div
        className="grid grid-cols-2 gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
            {mainLabel}
          </Label>
          <div className="mt-1">
            <StockStepper
              value={v.stock_main ?? 0}
              onChange={(val) => update(v, { stock_main: val })}
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
            {incLabel}
          </Label>
          <div className="mt-1">
            <StockStepper
              value={v.stock_incubator ?? 0}
              onChange={(val) => update(v, { stock_incubator: val })}
            />
          </div>
        </div>
      </div>

      <details
        className="group rounded-xl border border-border/60 bg-muted/15"
        onClick={(e) => e.stopPropagation()}
      >
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold [&::-webkit-details-marker]:hidden">
          <span>{isAr ? "تفاصيل السعر والباركود والصورة" : "Price, barcode & image details"}</span>
          <span className="text-muted-foreground group-open:hidden">{isAr ? "فتح" : "Open"}</span>
          <span className="hidden text-muted-foreground group-open:inline">
            {isAr ? "إغلاق" : "Close"}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-border/50 p-3">
          {/* Cost & Price Delta */}
          {canViewFinancials && (
            <div>
              <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
                {t("inventory.cost")}
              </Label>
              <div className="mt-1">
                <PremiumCurrencyInput
                  value={costVal}
                  onChange={setCostVal}
                  onBlur={(e) => update(v, { cost_price: Number(e.target.value) })}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
            </div>
          )}
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {isAr ? "سعر إضافي (+ د.ب)" : "Price Delta (+ BHD)"}
            </Label>
            <div className="mt-1">
              <PremiumCurrencyInput
                value={sellingVal}
                onChange={setSellingVal}
                onBlur={(e) => update(v, { selling_price: Number(e.target.value) })}
                className="h-10 rounded-xl text-xs"
              />
            </div>
          </div>

          {/* Dynamic Image Picker & Original Delta */}
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {isAr ? "صورة المتغير" : "Variant Image"}
            </Label>
            <div className="mt-1">
              <VariantImageUploader
                brandId={brand.id}
                imageUrl={v.image_url}
                onChange={(url) => update(v, { image_url: url })}
                isAr={isAr}
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {isAr ? "السعر الأصلي الإضافي" : "Original Delta"}
            </Label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
              defaultValue={v.original_price ?? ""}
              placeholder="—"
              onBlur={(e) =>
                update(v, { original_price: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>

          {/* SKU & Barcode */}
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">SKU</Label>
            <input
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
              defaultValue={v.sku ?? ""}
              onBlur={(e) => update(v, { sku: e.target.value || null })}
              placeholder="—"
            />
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {barcodeLabel}
            </Label>
            <input
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
              defaultValue={v.barcode ?? ""}
              onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
              placeholder="—"
            />
          </div>
        </div>
      </details>

      {/* Summary Footer */}
      <div className="flex items-center justify-between rounded-xl bg-secondary/25 px-4 py-3 text-xs border border-border/45 font-semibold">
        <span>
          {t("inventory.stock")}:{" "}
          <b className="text-sm font-black">{(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}</b>
        </span>
        {(() => {
          const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
          const qtySold = salesByVariant.get(v.id) || 0;
          const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
          const daysElapsed = variantCreatedAt
            ? Math.max(
                1,
                Math.min(
                  45,
                  Math.ceil(
                    (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
                  ),
                ),
              )
            : 45;
          const dailyVelocity = qtySold / daysElapsed;

          let runRateText = isAr ? "لا مبيعات مؤخراً" : "No recent sales";
          let runRateColor = "text-muted-foreground/80";

          if (stock <= 0) {
            runRateText = isAr ? "نفد المخزون" : "Out of stock";
            runRateColor = "text-rose-600 dark:text-rose-500 font-extrabold";
          } else if (dailyVelocity > 0) {
            const days = Math.ceil(stock / dailyVelocity);
            runRateText = isAr ? `ينفد خلال ${days} يوم` : `Out of stock in ${days} d`;
            runRateColor =
              days <= 7
                ? "text-amber-600 dark:text-amber-500 font-extrabold animate-pulse"
                : "text-emerald-600 dark:text-emerald-500 font-extrabold";
          }

          return <span className={runRateColor}>{runRateText}</span>;
        })()}
        {canViewFinancials && (
          <span className="text-primary font-black">
            {t("inventory.margin")}: {currentMargin.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function VariantList({
  productId,
  productName,
  businessName,
  variants,
  onChanged,
  salesByVariant,
  product,
}: {
  productId: string;
  productName: string;
  businessName: string | null;
  variants: Variant[];
  onChanged: () => void;
  salesByVariant: Map<string, number>;
  product?: Product;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials } = useProfile();
  const brand = useBrand();
  const [adding, setAdding] = useState(false);
  const empty = {
    size: "",
    size_unit: "",
    color: "",
    fabric: "",
    sku: "",
    barcode: "",
    cost_price: "0",
    selling_price: "0",
    original_price: "",
    stock_main: "0",
    stock_incubator: "0",
    image_url: "",
  };
  const [row, setRow] = useState(empty);

  const genBarcode = () => {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const body = `29${Date.now().toString().slice(-6)}${String(random[0] % 10000).padStart(4, "0")}`;
    const weightedSum = body
      .split("")
      .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return `${body}${(10 - (weightedSum % 10)) % 10}`;
  };

  const normalizeBarcode = (value: unknown) =>
    String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .toUpperCase();
  const barcodeInUse = (value: unknown, exceptId?: string) => {
    const normalized = normalizeBarcode(value);
    return (
      !!normalized &&
      variants.some(
        (variant) => variant.id !== exceptId && normalizeBarcode(variant.barcode) === normalized,
      )
    );
  };

  const add = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (barcodeInUse(row.barcode)) {
      toast.error(
        isAr
          ? "هذا الباركود مستخدم بالفعل لمنتج آخر"
          : "This barcode is already assigned to another variant",
      );
      return;
    }
    const { error } = await (supabase.from("product_variants") as any).insert({
      user_id: user.id,
      brand_id: brand.id,
      product_id: productId,
      size: row.size || null,
      size_unit: row.size_unit || null,
      color: row.color || null,
      fabric: row.fabric || null,
      sku: row.sku || null,
      barcode: row.barcode.trim() || null,
      cost_price: Number(row.cost_price),
      selling_price: Number(row.selling_price),
      original_price: row.original_price ? Number(row.original_price) : null,
      stock_main: Number(row.stock_main),
      stock_incubator: Number(row.stock_incubator),
      image_url: row.image_url || null,
    });
    if (error) return toast.error(error.message);
    setRow(empty);
    setAdding(false);
    onChanged();
  };

  const update = async (v: Variant, patch: Partial<Variant>) => {
    if (
      Object.prototype.hasOwnProperty.call(patch, "barcode") &&
      barcodeInUse(patch.barcode, v.id)
    ) {
      toast.error(
        isAr
          ? "هذا الباركود مستخدم بالفعل لمنتج آخر"
          : "This barcode is already assigned to another variant",
      );
      return;
    }
    const { error } = await (supabase.from("product_variants") as any).update(patch).eq("id", v.id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  const mainLabel = isAr ? "الرئيسي" : "Main";
  const incLabel = isAr ? "الحاضنة" : "Incubator";
  const barcodeLabel = isAr ? "الباركود" : "Barcode";

  // State for dynamic columns compacting / hiding
  type VariantViewMode = "quick" | "barcodes" | "full";
  const [viewMode, setViewMode] = useState<VariantViewMode>("quick");

  const hasAnyImage = useMemo(
    () => variants.some((v) => v.image_url && v.image_url.trim()),
    [variants],
  );
  const hasAnySku = useMemo(() => variants.some((v) => v.sku && v.sku.trim()), [variants]);
  const hasAnyBarcode = useMemo(
    () => variants.some((v) => v.barcode && v.barcode.trim()),
    [variants],
  );

  const renderImageCol = viewMode === "full" || (viewMode === "barcodes" && hasAnyImage);
  const renderSkuCol = viewMode === "full" || viewMode === "barcodes";
  const renderBarcodeCol = viewMode === "full" || viewMode === "barcodes";

  // Selected state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isAllSelected = variants.length > 0 && selectedIds.size === variants.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(variants.map((v) => v.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkSetPrice = async () => {
    const val = prompt(
      isAr
        ? "أدخل سعر البيع الجديد لكافة المتغيرات المحددة:"
        : "Enter new selling price for all selected variants:",
    );
    if (val === null) return;
    const price = Number(val);
    if (isNaN(price) || price < 0) return toast.error(isAr ? "سعر غير صالح" : "Invalid price");
    const { error } = await supabase
      .from("product_variants")
      .update({ selling_price: price })
      .in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم تحديث الأسعار بنجاح" : "Prices updated successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkAddStock = async (amount: number) => {
    const selectedVariants = variants.filter((v) => selectedIds.has(v.id));
    const promises = selectedVariants.map((v) =>
      supabase
        .from("product_variants")
        .update({ stock_main: Math.max(0, (v.stock_main ?? 0) + amount) })
        .eq("id", v.id),
    );
    const results = await Promise.all(promises);
    const hasError = results.some((r) => r.error);
    if (hasError) toast.error(isAr ? "فشل تحديث المخزون" : "Failed to update some stock entries");
    else {
      toast.success(
        isAr ? `تمت إضافة ${amount}+ مخزون بنجاح` : `Added +${amount} stock successfully`,
      );
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkApplyMarkup = async () => {
    const val = prompt(
      isAr
        ? "أدخل نسبة الهامش الربحي المئوية (مثال: 50 لـ 50%):"
        : "Enter markup percentage (e.g. 50 for 55%):",
    );
    if (val === null) return;
    const markup = Number(val);
    if (isNaN(markup) || markup < 0)
      return toast.error(isAr ? "نسبة مئوية غير صالحة" : "Invalid markup percentage");
    const selectedVariants = variants.filter((v) => selectedIds.has(v.id));
    const promises = selectedVariants.map((v) => {
      const newPrice = v.cost_price * (1 + markup / 100);
      return supabase
        .from("product_variants")
        .update({ selling_price: Number(newPrice.toFixed(3)) })
        .eq("id", v.id);
    });
    const results = await Promise.all(promises);
    const hasError = results.some((r) => r.error);
    if (hasError)
      toast.error(isAr ? "فشل تطبيق الهامش الربحي" : "Failed to apply markup on some variants");
    else {
      toast.success(isAr ? "تم تطبيق الهامش الربحي بنجاح" : "Markup applied successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkDelete = async () => {
    if (
      !confirm(
        isAr
          ? "هل أنت متأكد من حذف المتغيرات المحددة؟"
          : "Are you sure you want to delete the selected variants?",
      )
    )
      return;
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم حذف المتغيرات بنجاح" : "Variants deleted successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  // Auto-calculated total table width
  const totalTableWidth =
    44 +
    270 +
    (renderImageCol ? 96 : 0) +
    (renderSkuCol ? 120 : 0) +
    (renderBarcodeCol ? 190 : 0) +
    (canViewFinancials ? 110 : 0) +
    110 +
    110 +
    (canViewFinancials ? 96 : 0) +
    115 +
    115 +
    88 +
    60;

  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* Mobile Stacked Card View */}
      <div className="space-y-4 md:hidden">
        {variants.map((v) => (
          <VariantMobileCard
            key={v.id}
            v={v}
            canViewFinancials={canViewFinancials}
            barcodeLabel={barcodeLabel}
            SIZE_UNITS={SIZE_UNITS}
            salesByVariant={salesByVariant}
            t={t}
            isAr={isAr}
            brand={brand}
            update={update}
            del={del}
            mainLabel={mainLabel}
            incLabel={incLabel}
            isSelected={selectedIds.has(v.id)}
            onToggleSelect={() => toggleSelect(v.id)}
          />
        ))}

        {/* Adding state on Mobile */}
        {adding && (
          <div className="rounded-xl border border-primary/35 bg-secondary/35 p-4 space-y-4 shadow-sm animate-in fade-in duration-200">
            <div className="font-extrabold text-sm text-foreground">
              {t("inventory.addVariant")}
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {(isAr ? product?.variant_label_size_ar : product?.variant_label_size_en) ||
                    product?.variant_label_size_en ||
                    product?.variant_label_size_ar ||
                    t("inventory.size")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.size}
                  onChange={(e) => setRow({ ...row, size: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAr ? "الوحدة" : "Unit"}
                </Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  value={row.size_unit}
                  onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {(isAr ? product?.variant_label_color_ar : product?.variant_label_color_en) ||
                    product?.variant_label_color_en ||
                    product?.variant_label_color_ar ||
                    t("inventory.color")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.color}
                  onChange={(e) => setRow({ ...row, color: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {(isAr ? product?.variant_label_fabric_ar : product?.variant_label_fabric_en) ||
                    product?.variant_label_fabric_en ||
                    product?.variant_label_fabric_ar ||
                    t("inventory.fabric")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.fabric}
                  onChange={(e) => setRow({ ...row, fabric: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {t("inventory.sku")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.sku}
                  onChange={(e) => setRow({ ...row, sku: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {barcodeLabel}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.barcode}
                  onChange={(e) => setRow({ ...row, barcode: e.target.value })}
                />
              </div>
              {canViewFinancials && (
                <div>
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                    {t("inventory.cost")}
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    className="mt-1 h-9 rounded-md text-xs font-bold"
                    value={row.cost_price}
                    onChange={(e) => setRow({ ...row, cost_price: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAr ? "سعر إضافي (+ د.ب)" : "Price Delta (+ BHD)"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  className="mt-1 h-9 rounded-md text-xs font-bold"
                  value={row.selling_price}
                  onChange={(e) => setRow({ ...row, selling_price: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAr ? "السعر الأصلي الإضافي" : "Original Delta"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.original_price}
                  placeholder="—"
                  onChange={(e) => setRow({ ...row, original_price: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {mainLabel}
                </Label>
                <Input
                  type="number"
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.stock_main}
                  onChange={(e) => setRow({ ...row, stock_main: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {incLabel}
                </Label>
                <Input
                  type="number"
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.stock_incubator}
                  onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground block uppercase mb-1">
                  {isAr ? "صورة المتغير" : "Variant Image"}
                </Label>
                <div className="mt-1">
                  <VariantImageUploader
                    brandId={brand.id}
                    imageUrl={row.image_url}
                    onChange={(url) => setRow({ ...row, image_url: url || "" })}
                    isAr={isAr}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-lg text-xs font-bold touch-manipulation"
                onClick={(e) => {
                  e.preventDefault();
                  setAdding(false);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                className="h-8 rounded-lg text-xs font-bold touch-manipulation"
                onClick={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Redesigned Table View */}
      <div className="hidden w-full md:block border border-border/75 rounded-2xl shadow-2xs bg-background overflow-hidden relative">
        {/* View Mode Segmented Switcher Bar */}
        <div className="flex items-center justify-between p-2 bg-muted/30 border-b border-border/60">
          <div className="flex items-center gap-1.5 bg-background/80 p-1 rounded-xl border border-border/50 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("quick")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "quick"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{isAr ? "الأسعار والمخزون السريع" : "Quick Stock & Prices"}</span>
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 ms-1">
                {isAr ? "بدون تمرير" : "Zero Scroll"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("barcodes")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "barcodes"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Barcode className="h-3.5 w-3.5" />
              <span>{isAr ? "الباركود و SKU" : "Barcodes & SKUs"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("full")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "full"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <TableProperties className="h-3.5 w-3.5" />
              <span>{isAr ? "المصفوفة الكاملة" : "Full Matrix"}</span>
            </button>
          </div>

          <div className="text-[11px] font-bold text-muted-foreground px-2">
            {variants.length} {isAr ? "متغيرات" : "variants"}
          </div>
        </div>

        <div className="w-full overflow-x-auto os-scrollbar">
          <table className="w-full text-xs text-start border-collapse min-w-[700px]">
            <thead>
              <tr className="text-start text-xs uppercase tracking-wider border-b bg-muted/40 font-semibold text-muted-foreground">
                <th className="px-2 py-3 text-center align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-2 py-3 text-start font-black text-[10px]">
                  {(() => {
                    const sizeLbl =
                      (isAr ? product?.variant_label_size_ar : product?.variant_label_size_en) ||
                      product?.variant_label_size_en ||
                      product?.variant_label_size_ar ||
                      (isAr ? "المقاس" : "Size");
                    const colorLbl =
                      (isAr ? product?.variant_label_color_ar : product?.variant_label_color_en) ||
                      product?.variant_label_color_en ||
                      product?.variant_label_color_ar ||
                      (isAr ? "اللون" : "Color");
                    const fabricLbl =
                      (isAr
                        ? product?.variant_label_fabric_ar
                        : product?.variant_label_fabric_en) ||
                      product?.variant_label_fabric_en ||
                      product?.variant_label_fabric_ar ||
                      (isAr ? "الخامة" : "Fabric");
                    return isAr
                      ? `المتغير (${sizeLbl} / ${colorLbl} / ${fabricLbl})`
                      : `Variant (${sizeLbl} / ${colorLbl} / ${fabricLbl})`;
                  })()}
                </th>
                {renderImageCol && (
                  <th className="px-2 py-3 text-center font-black text-[10px]">
                    {isAr ? "الصورة" : "Image"}
                  </th>
                )}
                {renderSkuCol && (
                  <th className="px-2 py-3 text-start font-black text-[10px]">
                    {t("inventory.sku")}
                  </th>
                )}
                {renderBarcodeCol && (
                  <th className="px-2 py-3 text-start font-black text-[10px]">{barcodeLabel}</th>
                )}
                {canViewFinancials && (
                  <th className="px-2 py-3 text-center font-black text-[10px]">
                    {t("inventory.cost")}
                  </th>
                )}
                <th className="px-2 py-3 text-center font-black text-[10px]">
                  {isAr ? "سعر إضافي" : "Price Delta"}
                </th>
                <th className="px-2 py-3 text-center font-black text-[10px]">
                  {isAr ? "السعر الأصلي" : "Original Delta"}
                </th>
                {canViewFinancials && (
                  <th className="px-2 py-3 text-center font-black text-[10px]">
                    {t("inventory.margin")}
                  </th>
                )}
                <th className="px-2 py-3 text-center font-black text-[10px]">{mainLabel}</th>
                <th className="px-2 py-3 text-center font-black text-[10px]">{incLabel}</th>
                <th className="px-2 py-3 text-center font-black text-[10px]">
                  {t("inventory.stock")}
                </th>
                <th aria-label={isAr ? "الإجراءات" : "Actions"}></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <VariantDesktopRow
                  key={v.id}
                  v={v}
                  canViewFinancials={canViewFinancials}
                  barcodeLabel={barcodeLabel}
                  SIZE_UNITS={SIZE_UNITS}
                  salesByVariant={salesByVariant}
                  t={t}
                  isAr={isAr}
                  brand={brand}
                  update={update}
                  productName={productName}
                  businessName={businessName}
                  genBarcode={genBarcode}
                  del={del}
                  isSelected={selectedIds.has(v.id)}
                  onToggleSelect={() => toggleSelect(v.id)}
                  renderImageCol={renderImageCol}
                  renderSkuCol={renderSkuCol}
                  renderBarcodeCol={renderBarcodeCol}
                  product={product}
                />
              ))}

              {/* Adding desktop row (perfect matching design) */}
              {adding && (
                <tr className="border-t border-border bg-secondary/30 animate-in fade-in duration-150">
                  <td></td>
                  {/* Variant (combined attributes inputs) */}
                  <td className="px-2 py-3">
                    <div className="grid grid-cols-2 gap-1.5 max-w-[320px]">
                      <div className="flex gap-1">
                        <Input
                          className="h-8 w-16 text-start text-xs font-semibold"
                          value={row.size}
                          onChange={(e) => setRow({ ...row, size: e.target.value })}
                          placeholder={
                            (isAr
                              ? product?.variant_label_size_ar
                              : product?.variant_label_size_en) ||
                            product?.variant_label_size_en ||
                            product?.variant_label_size_ar ||
                            "Size"
                          }
                        />
                        <select
                          className="h-8 rounded border border-input bg-background px-1 text-xs outline-none"
                          value={row.size_unit}
                          onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
                        >
                          {SIZE_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u === "" ? "—" : u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        className="h-8 w-full text-xs font-semibold"
                        value={row.color}
                        onChange={(e) => setRow({ ...row, color: e.target.value })}
                        placeholder={
                          (isAr
                            ? product?.variant_label_color_ar
                            : product?.variant_label_color_en) ||
                          product?.variant_label_color_en ||
                          product?.variant_label_color_ar ||
                          "Color"
                        }
                      />
                      <Input
                        className="h-8 w-full text-xs font-semibold col-span-2"
                        value={row.fabric}
                        onChange={(e) => setRow({ ...row, fabric: e.target.value })}
                        placeholder={
                          (isAr
                            ? product?.variant_label_fabric_ar
                            : product?.variant_label_fabric_en) ||
                          product?.variant_label_fabric_en ||
                          product?.variant_label_fabric_ar ||
                          "Fabric"
                        }
                      />
                    </div>
                  </td>

                  {/* Optional Image */}
                  {renderImageCol && <td></td>}

                  {/* Optional SKU */}
                  {renderSkuCol && (
                    <td className="px-2 py-3">
                      <Input
                        className="h-8 w-full text-xs font-mono"
                        value={row.sku}
                        placeholder="SKU"
                        onChange={(e) => setRow({ ...row, sku: e.target.value })}
                      />
                    </td>
                  )}

                  {/* Optional Barcode */}
                  {renderBarcodeCol && (
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-full text-xs font-mono"
                          value={row.barcode}
                          placeholder={barcodeLabel}
                          onChange={(e) => setRow({ ...row, barcode: e.target.value })}
                        />
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary p-1 rounded-sm hover:bg-secondary touch-manipulation active:scale-95 transition"
                          onClick={(e) => {
                            e.preventDefault();
                            setRow({ ...row, barcode: genBarcode() });
                          }}
                        >
                          <Wand2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  )}

                  {/* Financials (Cost) */}
                  {canViewFinancials && (
                    <td className="px-2 py-3 text-center">
                      <div className="relative inline-flex items-center w-full max-w-[100px] shrink-0">
                        <Input
                          className="h-8 w-full pl-2 pr-7 text-center text-xs font-bold"
                          type="number"
                          step="0.001"
                          value={row.cost_price}
                          onChange={(e) => setRow({ ...row, cost_price: e.target.value })}
                        />
                        <span className="absolute right-2 text-[8px] font-black text-muted-foreground/50 pointer-events-none uppercase">
                          BHD
                        </span>
                      </div>
                    </td>
                  )}

                  {/* Selling Price */}
                  <td className="px-2 py-3 text-center">
                    <div className="relative inline-flex items-center w-full max-w-[100px] shrink-0">
                      <Input
                        className="h-8 w-full pl-2 pr-7 text-center text-xs font-bold"
                        type="number"
                        step="0.001"
                        value={row.selling_price}
                        onChange={(e) => setRow({ ...row, selling_price: e.target.value })}
                      />
                      <span className="absolute right-2 text-[8px] font-black text-muted-foreground/50 pointer-events-none uppercase">
                        BHD
                      </span>
                    </div>
                  </td>

                  {/* Original Price */}
                  <td className="px-2 py-3 text-center">
                    <Input
                      className="h-8 w-full text-center text-xs max-w-[100px]"
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.original_price}
                      placeholder="—"
                      onChange={(e) => setRow({ ...row, original_price: e.target.value })}
                    />
                  </td>

                  {/* Margin column (blank on add) */}
                  {canViewFinancials && <td></td>}

                  {/* Main Stock */}
                  <td className="px-2 py-3 text-center">
                    <Input
                      className="h-8 w-full text-center text-xs max-w-[80px] font-bold"
                      type="number"
                      value={row.stock_main}
                      onChange={(e) => setRow({ ...row, stock_main: e.target.value })}
                    />
                  </td>

                  {/* Incubator Stock */}
                  <td className="px-2 py-3 text-center">
                    <Input
                      className="h-8 w-full text-center text-xs max-w-[80px] font-bold"
                      type="number"
                      value={row.stock_incubator}
                      onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })}
                    />
                  </td>

                  {/* Total stock & Actions */}
                  <td></td>
                  <td className="px-2 py-3">
                    <div className="flex justify-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-3 rounded-lg text-xs font-bold"
                        onClick={(e) => {
                          e.preventDefault();
                          add();
                        }}
                      >
                        {t("common.save")}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          setAdding(false);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control Buttons Footer */}
      <div className="mt-4.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {!adding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3.5 rounded-xl text-xs font-bold hover:bg-secondary/40 touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                setAdding(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("inventory.addVariant")}
            </Button>
          )}
          <BulkVariantDialog
            productId={productId}
            variants={variants}
            canViewFinancials={canViewFinancials}
            onChanged={onChanged}
          />
        </div>
      </div>

      {/* FLOATING BULK ACTIONS TOOLBAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl py-3 px-5 flex items-center gap-4 z-55 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 border-r border-border pr-4 shrink-0">
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-black">
              {selectedIds.size}
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {isAr ? "محدد" : "selected"}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
              onClick={bulkSetPrice}
            >
              {isAr ? "تحديد السعر" : "Set Price"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
              onClick={() => bulkAddStock(5)}
            >
              {isAr ? "مخزون 5+" : "+5 Stock"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
              onClick={() => bulkAddStock(10)}
            >
              {isAr ? "مخزون 10+" : "+10 Stock"}
            </Button>
            {canViewFinancials && (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
                onClick={bulkApplyMarkup}
              >
                {isAr ? "تطبيق الهامش" : "Cost Markup %"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-8 text-xs font-bold rounded-lg px-2.5"
              onClick={bulkDelete}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {isAr ? "حذف" : "Delete"}
            </Button>
          </div>

          <button
            type="button"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground/60 transition-colors ml-2"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CustomizationsSection({
  brandId,
  items,
  onChanged,
}: {
  brandId: string;
  items: Customization[];
  onChanged: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  const add = async () => {
    if (!name.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await (supabase.from("customization_options") as any).insert({
      user_id: user.id,
      brand_id: brandId,
      name,
      price_delta: Number(price),
    });
    if (error) toast.error(error.message);
    else {
      setName("");
      setPrice("0");
      onChanged();
    }
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("customization_options").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  return (
    <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6">
      <p className="text-sm text-muted-foreground mb-4">{t("inventory.addonsIntro")}</p>
      <div className="flex gap-2 mb-4">
        <Input
          placeholder={t("inventory.addonName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          type="number"
          step="0.01"
          className="w-32"
          placeholder={t("inventory.addonPrice")}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Button onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("inventory.noAddons")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="py-3 flex justify-between items-center">
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">
                  + {formatMoney(Number(i.price_delta))}
                </p>
              </div>
              <InventoryDeleteAction
                message={t("common.confirmDelete")}
                onConfirm={() => del(i.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
