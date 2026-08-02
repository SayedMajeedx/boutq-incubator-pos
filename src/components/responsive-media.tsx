import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type VideoHTMLAttributes,
} from "react";
import {
  cloudflareImageSrcSet,
  cloudflareImageUrl,
  imageKitVideoPosterUrl,
  imageKitVideoUrl,
  isLikelyImageUrl,
  type ResponsiveImagePreset,
} from "@/lib/media-delivery";

type ResponsiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet"> & {
  src: string;
  preset?: ResponsiveImagePreset;
  quality?: number;
};

export function ResponsiveImage({
  src,
  preset = "card",
  quality = 82,
  sizes = "100vw",
  onError,
  ...props
}: ResponsiveImageProps) {
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(false), [src]);
  const largest =
    preset === "hero"
      ? 960
      : preset === "product"
        ? 640
        : preset === "content"
          ? 640
          : preset === "card"
            ? 480
            : 240;
  const intrinsicSize =
    preset === "thumb"
      ? { width: 240, height: 240 }
      : preset === "card" || preset === "product"
        ? { width: largest, height: Math.round((largest * 4) / 3) }
        : { width: largest, height: Math.round((largest * 9) / 16) };
  const computedSrcSet = fallback ? undefined : cloudflareImageSrcSet(src, preset, quality);
  return (
    <img
      {...props}
      width={props.width ?? intrinsicSize.width}
      height={props.height ?? intrinsicSize.height}
      src={fallback ? src : cloudflareImageUrl(src, largest, quality)}
      srcSet={computedSrcSet || undefined}
      sizes={computedSrcSet ? sizes : undefined}
      onError={(event) => {
        if (!fallback) setFallback(true);
        onError?.(event);
      }}
    />
  );
}

type OptimizedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> & {
  src?: string | null;
  poster?: string | null;
  streamIframeUrl?: string | null;
  active?: boolean;
  prepare?: boolean;
  wrapperClassName?: string;
};

export function OptimizedVideo({
  src,
  poster,
  streamIframeUrl,
  active = true,
  prepare = false,
  className,
  wrapperClassName,
  preload,
  ...props
}: OptimizedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const optimizedDesktopSrc = src ? imageKitVideoUrl(src, "desktop") : null;
  const optimizedMobileSrc = src ? imageKitVideoUrl(src, "mobile") : null;
  const generatedPoster = src ? imageKitVideoPosterUrl(src) : null;
  const resolvedPoster = isLikelyImageUrl(poster) ? poster : generatedPoster;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) void video.play().catch(() => undefined);
    else video.pause();
  }, [active, src, optimizedDesktopSrc, optimizedMobileSrc]);

  if (streamIframeUrl) {
    const separator = streamIframeUrl.includes("?") ? "&" : "?";
    const iframeSrc = `${streamIframeUrl}${separator}autoplay=${active ? "true" : "false"}&muted=true&loop=true&controls=false&preload=metadata`;
    return (
      <div className={wrapperClassName ?? className}>
        {!active && resolvedPoster ? (
          <ResponsiveImage
            src={resolvedPoster}
            preset="hero"
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            title="Storefront video"
            allow="autoplay; encrypted-media"
            className="pointer-events-none h-full w-full border-0"
            loading={active ? "eager" : "lazy"}
          />
        )}
      </div>
    );
  }

  // Inactive carousel slides should not mount a video element.
  if (!active && !prepare && resolvedPoster) {
    return (
      <div className={wrapperClassName ?? className}>
        <ResponsiveImage
          src={resolvedPoster}
          preset="hero"
          sizes="100vw"
          alt=""
          className={className ?? "h-full w-full object-cover"}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  const sourceKey = optimizedDesktopSrc
    ? `${optimizedMobileSrc}|${optimizedDesktopSrc}`
    : (src ?? "");
  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      {resolvedPoster && (
        <ResponsiveImage
          src={resolvedPoster}
          preset="hero"
          sizes="100vw"
          alt=""
          {...({
            fetchpriority: active ? "high" : "auto",
            fetchPriority: active ? "high" : "auto",
          } as any)}
          loading={active ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover ${className ?? ""}`}
        />
      )}
      <video
        ref={videoRef}
        key={sourceKey}
        poster={resolvedPoster ?? undefined}
        {...({
          fetchpriority: active ? "high" : undefined,
          fetchPriority: active ? "high" : undefined,
        } as any)}
        muted
        loop
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        preload={preload ?? (active ? "auto" : "none")}
        disablePictureInPicture
        className={`relative z-10 ${className ?? "h-full w-full object-cover"}`}
        {...props}
        onError={(event) => {
          props.onError?.(event);
        }}
      >
        {optimizedDesktopSrc ? (
          <>
            {optimizedMobileSrc ? (
              <source
                src={optimizedMobileSrc}
                media="(max-width: 767px)"
                {...({ fetchpriority: active ? "high" : undefined } as any)}
              />
            ) : null}
            <source
              src={optimizedDesktopSrc}
              {...({ fetchpriority: active ? "high" : undefined } as any)}
            />
          </>
        ) : src ? (
          <source src={src} {...({ fetchpriority: active ? "high" : undefined } as any)} />
        ) : null}
        <track kind="captions" />
      </video>
    </div>
  );
}
