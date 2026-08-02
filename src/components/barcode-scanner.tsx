import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { Camera, Keyboard, RefreshCw, Upload, X, ZoomIn } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onDetected: (code: string) => void;
  cameraStreamPromise?: Promise<MediaStream> | null;
};

type CameraInfo = { id: string; label: string };

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
];

export function BarcodeScanner({ open, onOpenChange, onDetected }: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [cameraRequested, setCameraRequested] = useState(false);

  const hints = useMemo(() => {
    const map = new Map();
    map.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    map.set(DecodeHintType.TRY_HARDER, true);
    return map;
  }, []);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const finish = useCallback(
    (value: string) => {
      if (handledRef.current) return;
      const code = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if (!code) return;
      handledRef.current = true;
      stop();
      // A successful scan closes the parent dialog directly, bypassing the
      // Dialog onOpenChange cleanup. Reset all per-session camera state here so
      // the next scan starts with a fresh stream instead of a stopped black one.
      setCameraRequested(false);
      setStarting(false);
      setError(null);
      setZoomRange(null);
      setCameras([]);
      setActiveCameraId(null);
      onDetected(code);
      onOpenChange(false);
    },
    [onDetected, onOpenChange, stop],
  );

  const configureTrack = useCallback(() => {
    window.setTimeout(() => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (!track) return;
      const capabilities = (track.getCapabilities?.() ?? {}) as any;
      const advanced: any[] = [];
      if (capabilities.focusMode?.includes?.("continuous"))
        advanced.push({ focusMode: "continuous" });
      if (capabilities.exposureMode?.includes?.("continuous"))
        advanced.push({ exposureMode: "continuous" });
      if (capabilities.whiteBalanceMode?.includes?.("continuous"))
        advanced.push({ whiteBalanceMode: "continuous" });
      if (
        typeof capabilities.zoom?.min === "number" &&
        typeof capabilities.zoom?.max === "number"
      ) {
        const initial = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, 1));
        setZoomRange({
          min: capabilities.zoom.min,
          max: capabilities.zoom.max,
          step: capabilities.zoom.step || 0.1,
        });
        setZoom(initial);
        advanced.push({ zoom: initial });
      } else {
        setZoomRange(null);
      }
      if (advanced.length) void track.applyConstraints({ advanced } as any).catch(() => undefined);
    }, 500);
  }, []);

  useEffect(() => {
    if (!open || !cameraRequested || !videoRef.current) return;
    handledRef.current = false;
    setError(null);
    setStarting(true);
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });

    const start = async () => {
      try {
        stop();
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: activeCameraId
            ? {
                deviceId: { exact: activeCameraId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        };
        // Own the MediaStream directly. This avoids iOS WebKit producing a
        // live-but-black preview when a decoder library attaches the stream.
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current!;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (video.readyState >= 1) resolve();
          else video.onloadedmetadata = () => resolve();
        });
        await video.play();

        const devices = await navigator.mediaDevices.enumerateDevices();
        const mapped = devices
          .filter((device) => device.kind === "videoinput")
          .map((device) => ({
            id: device.deviceId,
            label: device.label || `Camera ${device.deviceId.slice(0, 4)}`,
          }));
        setCameras(mapped);
        const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        if (currentId) setActiveCameraId(currentId);

        const controls = await reader.decodeFromStream(stream, video, (result, decodeError) => {
          if (result) finish(result.getText());
          if (decodeError && !(decodeError instanceof NotFoundException)) {
            console.debug("[barcode-scanner] frame decode error", decodeError);
          }
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        configureTrack();
        setStarting(false);
      } catch (caught: any) {
        if (cancelled) return;
        setStarting(false);
        const denied =
          caught?.name === "NotAllowedError" || String(caught).toLowerCase().includes("permission");
        setError(
          denied
            ? isAr
              ? "تم رفض إذن الكاميرا. فعّل الإذن من إعدادات المتصفح."
              : "Camera permission was denied. Enable it in browser settings."
            : isAr
              ? "تعذر تشغيل الكاميرا. جرّب تبديل الكاميرا أو التقاط صورة."
              : "Could not start the camera. Try switching camera or taking a photo.",
        );
      }
    };
    void start();
    return () => {
      cancelled = true;
      stop();
    };
    // activeCameraId is intentionally excluded: selecting the initial rear
    // camera updates its label without tearing down the stream that just opened.
    // Explicit lens switches increment restartKey and start a new stream safely.
  }, [cameraRequested, configureTrack, finish, hints, isAr, open, restartKey, stop]);

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const current = cameras.findIndex((camera) => camera.id === activeCameraId);
    const next = cameras[(current + 1 + cameras.length) % cameras.length];
    stop();
    setActiveCameraId(next.id);
    setRestartKey((value) => value + 1);
  };

  const applyZoom = (value: number) => {
    setZoom(value);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (track)
      void track.applyConstraints({ advanced: [{ zoom: value } as any] }).catch(() => undefined);
  };

  const scanFile = async (file: File) => {
    setError(null);
    stop();
    const objectUrl = URL.createObjectURL(file);
    const reader = new BrowserMultiFormatReader(hints);
    try {
      const result = await reader.decodeFromImageUrl(objectUrl);
      finish(result.getText());
    } catch {
      setError(
        isAr
          ? "لم نتمكن من قراءة الباركود من الصورة."
          : "Could not read a barcode from that image.",
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          stop();
          setCameraRequested(false);
          setStarting(false);
          setError(null);
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between p-4 pb-2">
          <DialogTitle>{isAr ? "مسح الباركود" : "Scan barcode"}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <div className="space-y-3 p-4 pt-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              controls={false}
              disablePictureInPicture
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-[5%] top-1/2 h-[52%] -translate-y-1/2 rounded-lg border-[3px] border-white shadow-[0_0_0_999px_rgba(0,0,0,.28)]">
              <span className="absolute -top-7 start-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                {isAr ? "باركود واحد داخل الإطار" : "One barcode inside the frame"}
              </span>
            </div>
            {cameras.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute end-2 top-2 h-9 w-9 rounded-full"
                onClick={switchCamera}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            {!cameraRequested && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950 text-white">
                <Camera className="h-9 w-9" />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    handledRef.current = false;
                    setError(null);
                    setStarting(true);
                    setCameraRequested(true);
                  }}
                >
                  {isAr ? "تشغيل الكاميرا" : "Start camera"}
                </Button>
                <p className="max-w-[85%] text-center text-xs text-white/70">
                  {isAr ? "اضغط للسماح بالوصول إلى الكاميرا" : "Tap to allow camera access"}
                </p>
              </div>
            )}
          </div>
          {zoomRange && zoomRange.max > zoomRange.min && (
            <div className="flex items-center gap-3 rounded-md border px-3 py-2">
              <ZoomIn className="h-4 w-4 text-muted-foreground" />
              <input
                type="range"
                className="min-w-0 flex-1"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(event) => applyZoom(Number(event.target.value))}
              />
              <span className="w-9 text-end text-xs">{zoom.toFixed(1)}×</span>
            </div>
          )}
          {starting && !error && (
            <p className="text-center text-xs text-muted-foreground">
              {isAr ? "جارٍ تشغيل الماسح..." : "Starting scanner…"}
            </p>
          )}
          {error && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-destructive">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  stop();
                  setCameraRequested(false);
                  setError(null);
                }}
              >
                {isAr ? "إعادة المحاولة" : "Try camera again"}
              </Button>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            {isAr
              ? "قرّب باركوداً واحداً حتى تملأ الخطوط البيضاء الإطار."
              : "Move one barcode closer until its bars fill the frame."}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            <Upload className="h-4 w-4 -ms-1" />
            {isAr ? "رفع أو التقاط صورة" : "Upload or Take Photo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void scanFile(file);
              event.target.value = "";
            }}
          />
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              finish(manualCode);
            }}
          >
            <div className="relative flex-1">
              <Keyboard className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                dir="ltr"
                className="ps-9 font-mono"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={
                  isAr ? "امسح بجهاز خارجي أو أدخل الرمز" : "Use scanner gun or enter code"
                }
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={!manualCode.trim()}>
              {isAr ? "إضافة" : "Add"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
