import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { GripVertical, ImagePlus, MessageCircle, Plus, Trash2, Upload } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { RichTextEditor } from "@/components/rich-text-editor";
import { normalizeRichTextValue, sanitizeRichTextHtml } from "@/lib/rich-text";
import {
  META_DESCRIPTION_LIMIT,
  META_TITLE_LIMIT,
  sanitizeMetaText,
  uniquePageSlug,
} from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/pages")({
  component: PagesAndPolicies,
});

type PageSlot = {
  slug: string;
  title_ar: string;
  title_en: string;
  content_ar: string;
  content_en: string;
  image_url: string | null;
  menu_icon_url: string | null;
  image_position: "top" | "bottom";
  meta_title: string;
  meta_description: string;
};

type Social = { name: string; url: string };
type EditorLanguage = "en" | "ar";

const SOCIAL_PLATFORMS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "X",
  "Snapchat",
  "Custom Link",
] as const;

const emptyPage = (): PageSlot => ({
  slug: "",
  title_ar: "",
  title_en: "",
  content_ar: "",
  content_en: "",
  image_url: null,
  menu_icon_url: null,
  image_position: "bottom",
  meta_title: "",
  meta_description: "",
});

const normalizePlatform = (name: string) =>
  SOCIAL_PLATFORMS.find((platform) => platform.toLowerCase() === name.toLowerCase()) ??
  "Custom Link";

function PagesAndPolicies() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();
  const [editorLanguage, setEditorLanguage] = useState<EditorLanguage>(isAr ? "ar" : "en");

  const { data, isLoading } = useQuery({
    queryKey: ["business-settings-pages", brandId],
    queryFn: async () => {
      const { data: settings, error } = await supabase
        .from("business_settings")
        .select("pages, whatsapp_enabled, whatsapp_number, socials")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return settings as any;
    },
  });

  const [pages, setPages] = useState<PageSlot[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [waEnabled, setWaEnabled] = useState(false);
  const [waNumber, setWaNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [uploadingIconIdx, setUploadingIconIdx] = useState<number | null>(null);
  const [openPages, setOpenPages] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);
  const iconInputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!data) return;
    const rawPages = Array.isArray(data.pages) ? data.pages : [];
    setPages(
      rawPages.map((page: any) => ({
        slug: page?.slug ?? "",
        title_ar: page?.title_ar ?? "",
        title_en: page?.title_en ?? "",
        content_ar: normalizeRichTextValue(page?.content_ar),
        content_en: normalizeRichTextValue(page?.content_en),
        image_url: page?.image_url ?? null,
        menu_icon_url: page?.menu_icon_url ?? null,
        image_position: page?.image_position === "bottom" ? "bottom" : "top",
        meta_title: page?.meta_title ?? "",
        meta_description: page?.meta_description ?? "",
      })),
    );
    const rawSocials = Array.isArray(data.socials) ? data.socials : [];
    setSocials(
      rawSocials.map((item: any) => ({
        name: String(item?.name ?? ""),
        url: String(item?.url ?? ""),
      })),
    );
    setWaEnabled(Boolean(data.whatsapp_enabled));
    setWaNumber(data.whatsapp_number ?? "");
  }, [data]);

  const updatePage = (index: number, patch: Partial<PageSlot>) => {
    setPages((current) =>
      current.map((page, pageIndex) => (pageIndex === index ? { ...page, ...patch } : page)),
    );
  };

  const removePage = (index: number) => {
    setPages((current) => current.filter((_, pageIndex) => pageIndex !== index));
    setOpenPages([]);
  };

  const addPage = () => {
    setPages((current) => {
      const next = [...current, emptyPage()];
      setOpenPages([`page-${next.length - 1}`]);
      return next;
    });
  };

  const movePage = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setPages((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setOpenPages([]);
  };

  const updateSocial = (index: number, patch: Partial<Social>) => {
    setSocials((current) =>
      current.map((social, socialIndex) =>
        socialIndex === index ? { ...social, ...patch } : social,
      ),
    );
  };

  const onPickImage = async (index: number, file: File) => {
    try {
      setUploadingIdx(index);
      const url = await uploadPublicMedia(brandId, file, "page");
      updatePage(index, { image_url: url });
      toast.success(
        isAr ? "تم رفع الصورة — تذكّر حفظ التغييرات" : "Image uploaded — remember to save",
      );
    } catch (error: any) {
      toast.error(error.message ?? (isAr ? "تعذّر رفع الصورة" : "Image upload failed"));
    } finally {
      setUploadingIdx(null);
    }
  };

  const onPickMenuIcon = async (index: number, file: File) => {
    try {
      setUploadingIconIdx(index);
      const url = await uploadPublicMedia(brandId, file, "page");
      updatePage(index, { menu_icon_url: url });
      toast.success(isAr ? "تم رفع الأيقونة — تذكّر الحفظ" : "Icon uploaded — remember to save");
    } catch (error: any) {
      toast.error(error.message ?? (isAr ? "تعذّر رفع الأيقونة" : "Icon upload failed"));
    } finally {
      setUploadingIconIdx(null);
    }
  };

  const save = async () => {
    setSaving(true);
    const usedSlugs = new Set<string>();
    const cleanedPages = pages.map((page, index) => ({
      slug: uniquePageSlug(
        page.slug || page.title_en || page.title_ar || `page-${index + 1}`,
        usedSlugs,
      ),
      title_ar: page.title_ar.trim() || null,
      title_en: page.title_en.trim() || null,
      content_ar: sanitizeRichTextHtml(page.content_ar) || null,
      content_en: sanitizeRichTextHtml(page.content_en) || null,
      image_url: page.image_url || null,
      menu_icon_url: page.menu_icon_url || null,
      image_position: page.image_position,
      meta_title: sanitizeMetaText(page.meta_title, META_TITLE_LIMIT) || null,
      meta_description: sanitizeMetaText(page.meta_description, META_DESCRIPTION_LIMIT) || null,
    }));
    const cleanedSocials = socials
      .map((social) => ({ name: social.name.trim(), url: social.url.trim() }))
      .filter((social) => social.name && social.url);
    const number = waNumber.replace(/\s+/g, "").replace(/^00/, "+");
    const { error } = await (supabase.from("business_settings") as any)
      .update({
        pages: cleanedPages,
        socials: cleanedSocials,
        whatsapp_enabled: waEnabled,
        whatsapp_number: number || null,
      })
      .eq("brand_id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم حفظ الصفحات وترتيبها" : "Pages and order saved");
      qc.invalidateQueries({ queryKey: ["business-settings-pages", brandId] });
    }
  };

  if (isLoading) return <div className="p-8">{isAr ? "جاري التحميل…" : "Loading…"}</div>;

  return (
    <div
      className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {isAr ? "الصفحات والسياسات" : "Pages & Policies"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">
            {isAr
              ? "أنشئ صفحات المتجر، رتّب ظهورها في تذييل المتجر، وحرّر محتواها باللغتين بسهولة."
              : "Create storefront pages, arrange footer layout, and edit multilingual content in a clean workspace."}
          </p>
        </div>
        <Tabs
          value={editorLanguage}
          onValueChange={(value) => setEditorLanguage(value as EditorLanguage)}
          dir="ltr"
          className="shrink-0"
        >
          <TabsList className="grid w-64 grid-cols-2 bg-slate-100 dark:bg-slate-900/60 border rounded-xl p-1 h-11">
            <TabsTrigger
              value="en"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-850 data-[state=active]:shadow-sm"
            >
              English (EN)
            </TabsTrigger>
            <TabsTrigger
              value="ar"
              className="rounded-lg text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-850 data-[state=active]:shadow-sm"
            >
              العربية (AR)
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="overflow-hidden border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold">
              {isAr ? "روابط التواصل الاجتماعي" : "Social media links"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "اختر المنصة من القائمة وأضف رابط الحساب الكامل."
                : "Choose a platform and add its complete profile URL."}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSocials((current) => [...current, { name: "Instagram", url: "" }])}
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
          >
            <Plus className="h-4 w-4" />
            {isAr ? "إضافة رابط" : "Add social link"}
          </Button>
        </div>
        {socials.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لم تُضف روابط بعد." : "No social links yet."}
          </p>
        )}
        <div className="space-y-3">
          {socials.map((social, index) => (
            <div
              key={`${index}-${social.name}`}
              className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(160px,0.7fr)_2fr_auto]"
            >
              <Select
                value={normalizePlatform(social.name)}
                onValueChange={(name) => updateSocial(index, { name })}
              >
                <SelectTrigger aria-label={isAr ? "منصة التواصل" : "Social platform"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={social.url}
                onChange={(event) => updateSocial(index, { url: event.target.value })}
                placeholder="https://instagram.com/yourbrand"
                dir="ltr"
                inputMode="url"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSocials((current) => current.filter((_, i) => i !== index))}
                aria-label={isAr ? "حذف الرابط" : "Remove link"}
                className="hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
          <h2 className="font-display text-xl font-bold">
            {isAr ? "زر واتساب العائم" : "WhatsApp floating button"}
          </h2>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4 bg-muted/10">
          <div>
            <p className="text-sm font-semibold">
              {isAr ? "إظهار الزر في المتجر" : "Show button on storefront"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "يفتح محادثة واتساب مباشرة من جميع صفحات المتجر."
                : "Opens a WhatsApp chat from every storefront page."}
            </p>
          </div>
          <Switch checked={waEnabled} onCheckedChange={setWaEnabled} />
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            {isAr ? "رقم واتساب مع رمز الدولة" : "WhatsApp number with country code"}
          </Label>
          <Input
            value={waNumber}
            onChange={(event) => setWaNumber(event.target.value)}
            placeholder="+97312345678"
            inputMode="tel"
            dir="ltr"
          />
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              {isAr ? "صفحات المتجر" : "Storefront pages"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "اسحب المقبض لتغيير ترتيب الروابط في تذييل المتجر."
                : "Drag the handle to change link order in the storefront footer."}
            </p>
          </div>
          <Button
            type="button"
            onClick={addPage}
            size="sm"
            className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2"
          >
            <Plus className="h-4 w-4" />
            {isAr ? "صفحة جديدة" : "New page"}
          </Button>
        </div>

        {pages.length === 0 && (
          <Card className="p-16 text-center border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
            <p className="text-muted-foreground text-sm">
              {isAr ? "لا توجد صفحات بعد." : "No pages yet."}
            </p>
          </Card>
        )}

        <Accordion
          type="multiple"
          value={openPages}
          onValueChange={setOpenPages}
          className="space-y-3"
        >
          {pages.map((page, index) => {
            const visibleTitle =
              editorLanguage === "ar"
                ? page.title_ar || page.title_en
                : page.title_en || page.title_ar;
            return (
              <AccordionItem
                key={`page-${index}`}
                value={`page-${index}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedIndex !== null) movePage(draggedIndex, index);
                  setDraggedIndex(null);
                }}
                className="overflow-hidden border-border/60 shadow-md hover:shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm px-4 transition-all duration-200"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      setDraggedIndex(index);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggedIndex(null)}
                    className="cursor-grab touch-none rounded-md p-2 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    title={isAr ? "اسحب لإعادة الترتيب" : "Drag to reorder"}
                    aria-label={isAr ? "اسحب لإعادة الترتيب" : "Drag to reorder"}
                  >
                    <GripVertical className="h-5 w-5" />
                  </button>
                  <AccordionTrigger className="min-w-0 flex-1 hover:no-underline py-4">
                    <span className="truncate text-base font-semibold">
                      {visibleTitle ||
                        (isAr ? `صفحة بدون عنوان ${index + 1}` : `Untitled page ${index + 1}`)}
                    </span>
                  </AccordionTrigger>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePage(index)}
                    aria-label={isAr ? "حذف الصفحة" : "Delete page"}
                    className="hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <AccordionContent className="border-t pt-5">
                  <div className="space-y-5" dir={editorLanguage === "ar" ? "rtl" : "ltr"}>
                    <div>
                      <Label>{editorLanguage === "ar" ? "عنوان الصفحة" : "Page title"}</Label>
                      <Input
                        value={editorLanguage === "ar" ? page.title_ar : page.title_en}
                        onChange={(event) =>
                          updatePage(
                            index,
                            editorLanguage === "ar"
                              ? { title_ar: event.target.value }
                              : { title_en: event.target.value },
                          )
                        }
                        placeholder={
                          editorLanguage === "ar" ? "مثال: دليل المقاسات" : "e.g. Size Guide"
                        }
                        dir={editorLanguage === "ar" ? "rtl" : "ltr"}
                        className={editorLanguage === "ar" ? "text-right" : "text-left"}
                      />
                    </div>

                    <div>
                      <Label>{editorLanguage === "ar" ? "محتوى الصفحة" : "Page content"}</Label>
                      <RichTextEditor
                        key={`${index}-${editorLanguage}`}
                        value={editorLanguage === "ar" ? page.content_ar : page.content_en}
                        onChange={(content) =>
                          updatePage(
                            index,
                            editorLanguage === "ar"
                              ? { content_ar: content }
                              : { content_en: content },
                          )
                        }
                        direction={editorLanguage === "ar" ? "rtl" : "ltr"}
                        ariaLabel={
                          editorLanguage === "ar"
                            ? "محرر محتوى الصفحة بالعربية"
                            : "English page content editor"
                        }
                        placeholder={
                          editorLanguage === "ar"
                            ? "اكتب محتوى الصفحة هنا…"
                            : "Write the page content here…"
                        }
                      />
                    </div>

                    <Card className="space-y-4 p-4">
                      <div>
                        <Label>{editorLanguage === "ar" ? "رابط الصفحة" : "Page URL slug"}</Label>
                        <div className="mt-1 flex items-center gap-1 rounded-md border bg-muted/30 px-3">
                          <span className="shrink-0 text-sm text-muted-foreground">
                            /{brand.slug}/
                          </span>
                          <Input
                            value={page.slug}
                            onChange={(event) =>
                              updatePage(index, {
                                slug: event.target.value
                                  .toLowerCase()
                                  .replace(/[^a-z0-9\u0600-\u06ff-]/g, "-")
                                  .replace(/-+/g, "-"),
                              })
                            }
                            placeholder="size-guide"
                            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <Label>
                            {editorLanguage === "ar" ? "عنوان محركات البحث" : "Meta Title"}
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            {page.meta_title.length}/{META_TITLE_LIMIT}
                          </span>
                        </div>
                        <Input
                          value={page.meta_title}
                          maxLength={META_TITLE_LIMIT}
                          onChange={(event) =>
                            updatePage(index, { meta_title: event.target.value })
                          }
                          dir={editorLanguage === "ar" ? "rtl" : "ltr"}
                          className={editorLanguage === "ar" ? "text-right" : "text-left"}
                          placeholder={
                            editorLanguage === "ar"
                              ? "عنوان واضح يظهر في نتائج البحث"
                              : "A clear title for search results"
                          }
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <Label>
                            {editorLanguage === "ar" ? "وصف محركات البحث" : "Meta Description"}
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            {page.meta_description.length}/{META_DESCRIPTION_LIMIT}
                          </span>
                        </div>
                        <Input
                          value={page.meta_description}
                          maxLength={META_DESCRIPTION_LIMIT}
                          onChange={(event) =>
                            updatePage(index, { meta_description: event.target.value })
                          }
                          dir={editorLanguage === "ar" ? "rtl" : "ltr"}
                          className={editorLanguage === "ar" ? "text-right" : "text-left"}
                          placeholder={
                            editorLanguage === "ar"
                              ? "وصف مختصر وجذاب للصفحة"
                              : "A concise description of this page"
                          }
                        />
                      </div>
                    </Card>

                    <div className="rounded-xl border p-4">
                      <Label>
                        {editorLanguage === "ar"
                          ? "أيقونة الصفحة في القائمة (اختيارية)"
                          : "Page menu icon (optional)"}
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {editorLanguage === "ar"
                          ? "المقاس الموصى به: 128×128 بكسل، مربع — SVG أو PNG أو WebP"
                          : "Recommended: 128×128px, square — SVG, PNG, or WebP"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border bg-muted">
                          {page.menu_icon_url ? (
                            <img
                              src={page.menu_icon_url}
                              alt=""
                              className="h-9 w-9 object-contain"
                            />
                          ) : (
                            <ImagePlus className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <input
                          ref={(element) => {
                            iconInputs.current[index] = element;
                          }}
                          type="file"
                          accept="image/svg+xml,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void onPickMenuIcon(index, file);
                            event.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => iconInputs.current[index]?.click()}
                          disabled={uploadingIconIdx === index}
                        >
                          <Upload className="h-4 w-4" />
                          {uploadingIconIdx === index
                            ? "…"
                            : editorLanguage === "ar"
                              ? "رفع الأيقونة"
                              : "Upload icon"}
                        </Button>
                        {page.menu_icon_url && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updatePage(index, { menu_icon_url: null })}
                          >
                            <Trash2 className="h-4 w-4" />
                            {editorLanguage === "ar" ? "إزالة" : "Remove"}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label>
                        {editorLanguage === "ar"
                          ? "صورة الصفحة (اختيارية)"
                          : "Page image (optional)"}
                      </Label>
                      <div className="mt-2 max-w-sm">
                        <Label>{editorLanguage === "ar" ? "موقع الصورة" : "Image Position"}</Label>
                        <Select
                          value={page.image_position}
                          onValueChange={(value: "top" | "bottom") =>
                            updatePage(index, { image_position: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bottom">
                              {editorLanguage === "ar"
                                ? "أسفل النص - حجم كامل"
                                : "Bottom - Full Width"}
                            </SelectItem>
                            <SelectItem value="top">
                              {editorLanguage === "ar" ? "أعلى النص - بنر عريض" : "Top - Banner"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <input
                          ref={(element) => {
                            fileInputs.current[index] = element;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onPickImage(index, file);
                            event.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputs.current[index]?.click()}
                          disabled={uploadingIdx === index}
                        >
                          <Upload className="h-4 w-4" />
                          {uploadingIdx === index
                            ? editorLanguage === "ar"
                              ? "جاري الرفع…"
                              : "Uploading…"
                            : editorLanguage === "ar"
                              ? "رفع صورة"
                              : "Upload image"}
                        </Button>
                        {page.image_url ? (
                          <div className="flex items-center gap-2 rounded-lg border p-2">
                            <img
                              src={page.image_url}
                              alt=""
                              className="h-16 w-20 rounded object-cover"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => updatePage(index, { image_url: null })}
                            >
                              <Trash2 className="h-4 w-4" />
                              {editorLanguage === "ar" ? "إزالة" : "Remove"}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ImagePlus className="h-4 w-4" />
                            {editorLanguage === "ar" ? "لا توجد صورة" : "No image selected"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border border-border/60 bg-background/80 p-4 shadow-lg backdrop-blur-md">
        <Button
          onClick={save}
          disabled={saving}
          size="lg"
          className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 px-6 font-semibold"
        >
          {saving
            ? isAr
              ? "جاري الحفظ…"
              : "Saving…"
            : isAr
              ? "حفظ جميع التغييرات"
              : "Save all changes"}
        </Button>
      </div>
    </div>
  );
}
