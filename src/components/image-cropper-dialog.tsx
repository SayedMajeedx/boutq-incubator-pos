import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Crop, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  imageSrc: string | null;
  /** width / height ratio — defaults to 3/4 to match storefront product cards */
  aspect?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  busy?: boolean;
  outputWidth?: number;
  outputHeight?: number;
  heroPreview?: boolean;
  title?: string;
  description?: string;
};

async function getCroppedBlob(
  imageSrc: string,
  area: Area,
  outputWidth?: number,
  outputHeight?: number,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth ?? Math.round(area.width);
  canvas.height = outputHeight ?? Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function ImageCropperDialog({
  open,
  imageSrc,
  aspect = 3 / 4,
  onCancel,
  onConfirm,
  busy,
  outputWidth,
  outputHeight,
  heroPreview = false,
  title,
  description,
}: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
  }, [imageSrc, open]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const handleConfirm = async () => {
    if (!imageSrc || !area) return;
    try {
      setProcessing(true);
      const blob = await getCroppedBlob(imageSrc, area, outputWidth, outputHeight);
      await onConfirm(blob);
    } finally {
      setProcessing(false);
    }
  };

  const isBusy = Boolean(busy || processing);
  const adjustZoom = (delta: number) =>
    setZoom((current) => Math.min(4, Math.max(1, Number((current + delta).toFixed(2)))));
  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isBusy) onCancel();
      }}
    >
      <DialogContent className="max-h-[94dvh] max-w-3xl overflow-y-auto overscroll-contain p-0">
        <DialogHeader>
          <div className="flex items-start gap-3 border-b px-5 pb-4 pt-5 pe-12 sm:px-6 sm:pe-14">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Crop className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{title || (isAr ? "قص الصورة" : "Crop image")}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {description ||
                  (isAr
                    ? "اسحب الصورة لتحديد موضعها، ثم استخدم التكبير للحصول على النتيجة المناسبة."
                    : "Drag to position the image, then fine-tune the framing with zoom.")}
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-5 sm:px-6">
          <div className="relative h-[min(46vh,410px)] min-h-60 w-full shrink-0 overflow-hidden rounded-2xl bg-neutral-950 shadow-inner">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                objectFit="contain"
                showGrid
              />
            )}
            <span className="pointer-events-none absolute bottom-3 start-3 rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
              {isAr ? "اسحب لتغيير الموضع" : "Drag to reposition"}
            </span>
            {outputWidth && outputHeight && (
              <span
                className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-black/65 px-3 py-1 font-mono text-[11px] text-white backdrop-blur"
                dir="ltr"
              >
                {outputWidth} × {outputHeight}
              </span>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-sm font-medium">
                {isAr ? "التكبير والموضع" : "Zoom & position"}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 gap-2"
                onClick={reset}
                disabled={isBusy}
              >
                <RotateCcw className="h-4 w-4" />
                {isAr ? "إعادة ضبط" : "Reset"}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                onClick={() => adjustZoom(-0.15)}
                disabled={isBusy || zoom <= 1}
                aria-label={isAr ? "تصغير" : "Zoom out"}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Slider
                aria-label={isAr ? "مستوى التكبير" : "Zoom level"}
                min={1}
                max={4}
                step={0.05}
                value={[zoom]}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                onClick={() => adjustZoom(0.15)}
                disabled={isBusy || zoom >= 4}
                aria-label={isAr ? "تكبير" : "Zoom in"}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="hidden w-14 text-end font-mono text-xs text-muted-foreground sm:block">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>

          {heroPreview && imageSrc && (
            <details className="group rounded-xl border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span>{isAr ? "معاينة الواجهة" : "Storefront preview"}</span>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>
              <div className="px-3 pb-3">
                <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-md border bg-muted">
                  <div className="pointer-events-none absolute inset-0">
                    <Cropper
                      image={imageSrc}
                      crop={crop}
                      zoom={zoom}
                      aspect={aspect}
                      onCropChange={() => {}}
                      onZoomChange={() => {}}
                      objectFit="contain"
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between text-white mix-blend-difference">
                    <span className="grid h-9 w-9 place-items-center text-3xl font-extralight leading-none">
                      ‹
                    </span>
                    <span className="grid h-9 w-9 place-items-center text-3xl font-extralight leading-none">
                      ›
                    </span>
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>
        <DialogFooter className="sticky -bottom-1 z-10 mt-1 border-t bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          <Button variant="outline" className="min-h-11" onClick={onCancel} disabled={isBusy}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button className="min-h-11 min-w-36" onClick={handleConfirm} disabled={isBusy || !area}>
            {isBusy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {processing
              ? isAr
                ? "جاري تجهيز الصورة…"
                : "Preparing image…"
              : isAr
                ? "اعتماد الصورة"
                : "Use this crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
