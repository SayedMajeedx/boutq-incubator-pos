import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Pencil, Trash2, Upload, Tags, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { CategoriesCommandHeader } from "@/components/categories/CategoriesCommandHeader";
import { CategoriesWorkQueue } from "@/components/categories/CategoriesWorkQueue";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/categories")({
  component: CategoriesPage,
});

type Category = {
  id: string;
  brand_id: string;
  name_en: string;
  parent_id: string | null;
  name_ar: string | null;
  slug: string | null;
  image_url: string | null;
  menu_icon_url: string | null;
  sort_order: number;
  is_active: boolean;
};

function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function CategoriesPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  useRealtimeInvalidate(
    [{ table: "categories", brandId, queryKey: ["categories", brandId] }],
    `categories-${brandId}`,
  );

  const { data } = useQuery({
    queryKey: ["categories", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("*")
        .eq("brand_id", brandId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const move = async (c: Category, dir: -1 | 1) => {
    const { error } = await (supabase.from("categories") as any)
      .update({ sort_order: c.sort_order + dir })
      .eq("id", c.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["categories", brandId] });
  };

  const remove = async (c: Category) => {
    if (
      !confirm(
        isAr
          ? "حذف هذا القسم؟ سيتم التعطيل إذا كانت هناك منتجات مرتبطة."
          : "Delete this category? It will be deactivated if linked to products.",
      )
    )
      return;
    const { data: res, error } = await (supabase.rpc as any)("delete_category", { p_id: c.id });
    if (error) return toast.error(error.message);
    const mode = res?.mode;
    const linked = res?.linked_products ?? 0;
    if (mode === "soft")
      toast.success(
        isAr
          ? `تم التعطيل — مرتبط بـ ${linked} منتج`
          : `Deactivated — linked to ${linked} product(s)`,
      );
    else toast.success(isAr ? "تم الحذف" : "Deleted");
    qc.invalidateQueries({ queryKey: ["categories", brandId] });
  };

  return (
    <div
      className="mx-auto max-w-6xl space-y-4 p-1 sm:p-2 animate-fade-in"
      dir={isAr ? "rtl" : "ltr"}
    >
      <CategoriesCommandHeader
        lang={lang}
        categoryCount={(data ?? []).length}
        onCreateNew={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <CategoriesWorkQueue
        lang={lang}
        categories={data ?? []}
        isLoading={false}
        onEdit={(cat) => {
          setEditing(cat);
          setOpen(true);
        }}
        onDelete={(id) => {
          const c = (data ?? []).find((x) => x.id === id);
          if (c) remove(c);
        }}
        onReorder={(id, dir) => {
          const c = (data ?? []).find((x) => x.id === id);
          if (c) move(c, dir === "up" ? -1 : 1);
        }}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <CategoryDialog
          brandId={brandId}
          category={editing}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["categories", brandId] });
          }}
        />
      </Dialog>
    </div>
  );
}

function CategoryDialog({
  brandId,
  category,
  onSaved,
}: {
  brandId: string;
  category: Category | null;
  onSaved: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("*")
        .eq("brand_id", brandId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const parentOptions = categories.filter((c) => c.id !== category?.id);
  const [form, setForm] = useState({
    name_en: category?.name_en ?? "",
    name_ar: category?.name_ar ?? "",
    parent_id: category?.parent_id ?? "",
    slug: category?.slug ?? "",
    image_url: category?.image_url ?? "",
    menu_icon_url: category?.menu_icon_url ?? "",
    sort_order: category?.sort_order ?? 0,
    is_active: category?.is_active ?? true,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm({
      name_en: category?.name_en ?? "",
      name_ar: category?.name_ar ?? "",
      parent_id: category?.parent_id ?? "",
      slug: category?.slug ?? "",
      image_url: category?.image_url ?? "",
      menu_icon_url: category?.menu_icon_url ?? "",
      sort_order: category?.sort_order ?? 0,
      is_active: category?.is_active ?? true,
    });
  }, [category]);

  const upload = async (file: File) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "category");
      setForm((f) => ({ ...f, image_url: url }));
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadIcon = async (file: File) => {
    try {
      setUploadingIcon(true);
      const url = await uploadPublicMedia(brandId, file, "category");
      setForm((current) => ({ ...current, menu_icon_url: url }));
    } catch (error: any) {
      toast.error(error.message ?? "Icon upload failed");
    } finally {
      setUploadingIcon(false);
    }
  };

  const save = async () => {
    if (!form.name_en.trim())
      return toast.error(isAr ? "الاسم بالإنجليزي مطلوب" : "English name required");
    const payload = {
      brand_id: brandId,
      name_en: form.name_en.trim(),
      name_ar: form.name_ar.trim() || null,
      parent_id: form.parent_id || null,
      slug: form.slug.trim() || slugify(form.name_en) || null,
      image_url: form.image_url || null,
      menu_icon_url: form.menu_icon_url || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const { error } = category
      ? await (supabase.from("categories") as any).update(payload).eq("id", category.id)
      : await (supabase.from("categories") as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم الحفظ" : "Saved");
    onSaved();
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {category ? (isAr ? "تعديل قسم" : "Edit category") : isAr ? "قسم جديد" : "New category"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              placeholder={isAr ? "عبايات" : ""}
            />
          </div>
          <div>
            <Label>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              placeholder="Abayas"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{isAr ? "المعرّف (Slug)" : "Slug"}</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder={slugify(form.name_en)}
            />
          </div>
          <div>
            <Label>{isAr ? "الترتيب" : "Sort order"}</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <Label>{isAr ? "القسم الأب (الرئيسي)" : "Parent category (optional)"}</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          >
            <option value="">{isAr ? "قسم رئيسي (بدون أب)" : "Main Category (No Parent)"}</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {isAr ? c.name_ar || c.name_en : c.name_en}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>{isAr ? "صورة الغلاف" : "Cover image"}</Label>
          <div className="flex items-center gap-3">
            {form.image_url && (
              <img src={form.image_url} alt="" className="h-16 w-16 rounded object-cover border" />
            )}
            <div className="flex gap-2 flex-1">
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label>{isAr ? "أيقونة القائمة (اختيارية)" : "Menu icon (optional)"}</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            {isAr
              ? "المقاس الموصى به: 128×128 بكسل، مربع — SVG أو PNG أو WebP"
              : "Recommended: 128×128px, square — SVG, PNG, or WebP"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
              {form.menu_icon_url ? (
                <img src={form.menu_icon_url} alt="" className="h-9 w-9 object-contain" />
              ) : (
                <Tags className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <Input
              className="min-w-48 flex-1"
              value={form.menu_icon_url}
              onChange={(event) => setForm({ ...form, menu_icon_url: event.target.value })}
              placeholder="https://..."
            />
            <input
              ref={iconInput}
              type="file"
              accept="image/svg+xml,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadIcon(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => iconInput.current?.click()}
              disabled={uploadingIcon}
            >
              <Upload className="h-4 w-4" />
              {uploadingIcon ? "…" : isAr ? "رفع" : "Upload"}
            </Button>
            {form.menu_icon_url && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm({ ...form, menu_icon_url: "" })}
              >
                {isAr ? "إزالة" : "Remove"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <Label htmlFor="active">{isAr ? "مفعّل في المتجر" : "Active in storefront"}</Label>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save}>{isAr ? "حفظ" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
