import { useEffect, useState, type ReactNode } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export type ManagedCustomerAddress = {
  id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  floor: string | null;
  landmark: string | null;
  delivery_notes: string | null;
  is_default: boolean;
};

type AddressForm = {
  label: string;
  block: string;
  road: string;
  house: string;
  flat: string;
  floor: string;
  landmark: string;
  region: string;
  delivery_notes: string;
};

const EMPTY_FORM: AddressForm = {
  label: "",
  block: "",
  road: "",
  house: "",
  flat: "",
  floor: "",
  landmark: "",
  region: "",
  delivery_notes: "",
};

export function CustomerAddressManager({
  addresses,
  loading,
  customerId,
  brandId,
  lang,
  onChanged,
}: {
  addresses: ManagedCustomerAddress[];
  loading: boolean;
  customerId: string;
  brandId: string;
  lang: "en" | "ar";
  onChanged: () => void;
}) {
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedCustomerAddress | null>(null);
  const [deleting, setDeleting] = useState<ManagedCustomerAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            label: editing.label ?? "",
            block: editing.block ?? "",
            road: editing.road ?? "",
            house: editing.house ?? "",
            flat: editing.flat ?? "",
            floor: editing.floor ?? "",
            landmark: editing.landmark ?? "",
            region: editing.region ?? "",
            delivery_notes: editing.delivery_notes ?? "",
          }
        : EMPTY_FORM,
    );
  }, [editing, open]);

  const startAdd = () => {
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (address: ManagedCustomerAddress) => {
    setEditing(address);
    setOpen(true);
  };

  const save = async () => {
    if (
      !form.label.trim() ||
      !form.region.trim() ||
      !form.block.trim() ||
      !form.road.trim() ||
      !form.house.trim()
    ) {
      return toast.error(
        isAr
          ? "يرجى تعبئة اسم العنوان والمنطقة والمجمع والطريق والمبنى."
          : "Label, city/area, block, road, and building/house are required.",
      );
    }

    setSaving(true);
    const payload = {
      label: form.label.trim(),
      region: form.region.trim(),
      block: form.block.trim(),
      road: form.road.trim(),
      house: form.house.trim(),
      flat: form.flat.trim() || null,
      floor: form.floor.trim() || null,
      landmark: form.landmark.trim() || null,
      delivery_notes: form.delivery_notes.trim() || null,
    };

    let error: { message: string } | null = null;
    if (editing) {
      const result = await (supabase.from("customer_addresses") as any)
        .update(payload)
        .eq("id", editing.id)
        .eq("customer_id", customerId)
        .eq("brand_id", brandId);
      error = result.error;
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        return toast.error(
          isAr
            ? "انتهت جلسة الدخول. يرجى تسجيل الدخول مجدداً."
            : "Your session has expired. Please sign in again.",
        );
      }
      const result = await (supabase.from("customer_addresses") as any).insert({
        ...payload,
        user_id: user.id,
        brand_id: brandId,
        customer_id: customerId,
        is_default: addresses.length === 0,
      });
      error = result.error;
    }

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      editing
        ? isAr
          ? "تم تحديث العنوان"
          : "Address updated"
        : isAr
          ? "تمت إضافة العنوان"
          : "Address added",
    );
    setOpen(false);
    setEditing(null);
    onChanged();
  };

  const remove = async () => {
    if (!deleting) return;
    const wasDefault = deleting.is_default;
    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", deleting.id)
      .eq("customer_id", customerId)
      .eq("brand_id", brandId);
    if (error) return toast.error(error.message);

    if (wasDefault) {
      const replacement = addresses.find((address) => address.id !== deleting.id);
      if (replacement) {
        const { error: defaultError } = await supabase
          .from("customer_addresses")
          .update({ is_default: true })
          .eq("id", replacement.id)
          .eq("customer_id", customerId)
          .eq("brand_id", brandId);
        if (defaultError) toast.error(defaultError.message);
      }
    }

    toast.success(isAr ? "تم حذف العنوان" : "Address deleted");
    setDeleting(null);
    onChanged();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg">{isAr ? "عناوين التوصيل" : "Delivery Addresses"}</h2>
        </div>
        {addresses.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={startAdd}>
            <Plus className="h-4 w-4" />
            {isAr ? "إضافة" : "Add"}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{isAr ? "جاري التحميل…" : "Loading…"}</p>
      ) : addresses.length === 0 ? (
        <button
          type="button"
          onClick={startAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          {isAr ? "إضافة عنوان" : "Add Address"}
        </button>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div
              key={address.id}
              className="rounded-xl border p-3 transition-colors hover:bg-muted/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {address.label || (isAr ? "عنوان التوصيل" : "Delivery address")}
                    </span>
                    {address.is_default && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {isAr ? "افتراضي" : "Default"}
                      </span>
                    )}
                  </div>
                  <DeliveryAddressCard address={address} lang={lang} compact showLabel={false} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEdit(address)}
                    aria-label={isAr ? "تعديل العنوان" : "Edit address"}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleting(address)}
                    aria-label={isAr ? "حذف العنوان" : "Delete address"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
          dir={isAr ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle>
              {editing
                ? isAr
                  ? "تعديل العنوان"
                  : "Edit Address"
                : isAr
                  ? "إضافة عنوان"
                  : "Add Address"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label={isAr ? "اسم العنوان" : "Address Label"} required>
              <Input
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder={isAr ? "المنزل، العمل" : "Home, Work"}
              />
            </Field>
            <Field label={isAr ? "المدينة / المنطقة" : "City / Area"} required>
              <Input
                value={form.region}
                onChange={(event) => setForm({ ...form, region: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "المجمع" : "Block"} required>
              <Input
                value={form.block}
                onChange={(event) => setForm({ ...form, block: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "الطريق" : "Road"} required>
              <Input
                value={form.road}
                onChange={(event) => setForm({ ...form, road: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "المبنى / المنزل" : "Building / House"} required>
              <Input
                value={form.house}
                onChange={(event) => setForm({ ...form, house: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "الشقة" : "Flat"}>
              <Input
                value={form.flat}
                onChange={(event) => setForm({ ...form, flat: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "الطابق" : "Floor"}>
              <Input
                value={form.floor}
                onChange={(event) => setForm({ ...form, floor: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "علامة مميزة قريبة" : "Nearby Landmark"}>
              <Input
                value={form.landmark}
                onChange={(event) => setForm({ ...form, landmark: event.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={isAr ? "ملاحظات خاصة للتوصيل" : "Special Delivery Notes"}>
                <Textarea
                  rows={3}
                  value={form.delivery_notes}
                  onChange={(event) => setForm({ ...form, delivery_notes: event.target.value })}
                  placeholder={isAr ? "مثال: الاتصال عند الوصول" : "Example: Call when you arrive"}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? (isAr ? "جاري الحفظ…" : "Saving…") : isAr ? "حفظ العنوان" : "Save Address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
      >
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "حذف العنوان؟" : "Delete address?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? "سيتم حذف هذا العنوان نهائياً من ملف العميل."
                : "This address will be permanently removed from the customer profile."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void remove()}
            >
              {isAr ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
