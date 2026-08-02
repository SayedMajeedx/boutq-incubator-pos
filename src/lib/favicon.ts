import { useEffect } from "react";

export const DEFAULT_FAVICON_URL = "/favicon.svg";

export function faviconType(url: string): string | undefined {
  const clean = url.split(/[?#]/, 1)[0].toLowerCase();
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".ico")) return "image/x-icon";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  return undefined;
}

export function resolveBrandFavicon(faviconUrl?: string | null, logoUrl?: string | null): string {
  return faviconUrl?.trim() || logoUrl?.trim() || DEFAULT_FAVICON_URL;
}

export function setDocumentFavicon(url: string): void {
  if (typeof document === "undefined") return;
  const existing = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  const link = existing[0] ?? document.createElement("link");
  link.rel = "icon";
  link.href = url;
  const type = faviconType(url);
  if (type) link.type = type;
  else link.removeAttribute("type");
  link.dataset.dynamicBrandFavicon = "true";
  if (!link.parentNode) document.head.appendChild(link);
  existing.slice(1).forEach((duplicate) => duplicate.remove());
}

export function useDynamicFavicon(faviconUrl?: string | null, logoUrl?: string | null): void {
  const resolved = resolveBrandFavicon(faviconUrl, logoUrl);
  useEffect(() => {
    setDocumentFavicon(resolved);
    return () => setDocumentFavicon(DEFAULT_FAVICON_URL);
  }, [resolved]);
}
