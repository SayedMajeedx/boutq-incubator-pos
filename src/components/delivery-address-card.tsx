import { Copy, ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { regionLabel, type StructuredAddress } from "@/lib/bahrain-regions";

type DeliveryAddress = StructuredAddress & {
  delivery_notes?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function DeliveryAddressCard({
  address,
  lang,
  compact = false,
  showLabel = true,
}: {
  address: DeliveryAddress | null | undefined;
  lang: "en" | "ar";
  compact?: boolean;
  showLabel?: boolean;
}) {
  if (!address) return null;
  const isAr = lang === "ar";
  const fields = [
    [isAr ? "المدينة / المنطقة" : "City / Area", regionLabel(address.region, lang)],
    [isAr ? "المجمع" : "Block", address.block],
    [isAr ? "الطريق" : "Road", address.road],
    [isAr ? "المبنى / المنزل" : "Building / House", address.house],
    [isAr ? "الشقة" : "Flat", address.flat],
    [isAr ? "الطابق" : "Floor", address.floor],
    [isAr ? "علامة مميزة" : "Landmark", address.landmark],
  ].filter(([, value]) => String(value ?? "").trim());
  const copyText = [
    address.label,
    ...fields.map(([label, value]) => `${label}: ${value}`),
    address.delivery_notes ? `${isAr ? "ملاحظات" : "Notes"}: ${address.delivery_notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const hasMap =
    Number.isFinite(Number(address.latitude)) && Number.isFinite(Number(address.longitude));

  return (
    <div
      className={`rounded-xl border bg-background ${compact ? "p-3" : "p-4"}`}
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        {showLabel ? (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <strong>{address.label || (isAr ? "عنوان التوصيل" : "Delivery address")}</strong>
            {address.is_default && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {isAr ? "افتراضي" : "Default"}
              </span>
            )}
          </div>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2"
            aria-label={isAr ? "نسخ العنوان" : "Copy address"}
            onClick={async () => {
              await navigator.clipboard.writeText(copyText);
              toast.success(isAr ? "تم نسخ العنوان" : "Address copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            {!compact && (isAr ? "نسخ" : "Copy")}
          </Button>
          {hasMap && (
            <Button asChild type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2">
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`}
                aria-label={isAr ? "فتح العنوان في الخريطة" : "Open address in map"}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {!compact && (isAr ? "الخريطة" : "Map")}
              </a>
            </Button>
          )}
        </div>
      </div>
      {address.formatted_address && (
        <p className="mb-3 text-sm font-medium">{address.formatted_address}</p>
      )}
      <dl className={`grid gap-x-5 gap-y-2 ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}>
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {address.delivery_notes && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="font-semibold">{isAr ? "ملاحظات التوصيل:" : "Delivery notes:"}</span>{" "}
          {address.delivery_notes}
        </div>
      )}
    </div>
  );
}
