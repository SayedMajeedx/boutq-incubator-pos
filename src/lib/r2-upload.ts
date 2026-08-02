import { createR2UploadUrl, deleteR2Object, purgeBrandR2Objects } from "@/lib/r2-upload.functions";

export type PublicMediaKind =
  | "logo"
  | "favicon"
  | "font"
  | "product"
  | "category"
  | "hero"
  | "page"
  | "payment-qr"
  | "expense-receipt";

function normalizedContentType(file: Blob, kind: PublicMediaKind): string {
  if (file.type) return file.type.toLowerCase();
  if (kind === "font") return "application/octet-stream";
  throw new Error("The selected file has no recognized media type");
}

export async function uploadPublicMedia(
  brandId: string,
  file: Blob,
  kind: PublicMediaKind,
): Promise<string> {
  const contentType = normalizedContentType(file, kind);
  const signed = await createR2UploadUrl({ data: { brandId, kind, contentType, size: file.size } });
  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: file,
  });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
  return signed.publicUrl;
}

export async function deletePublicMediaUrl(brandId: string, mediaUrl: string): Promise<void> {
  let key: string;
  try {
    key = decodeURIComponent(new URL(mediaUrl).pathname.replace(/^\/+/, ""));
  } catch {
    return;
  }
  if (!key.startsWith(`brands/${brandId}/`)) return;
  await deleteR2Object({ data: { brandId, key } });
}

export async function purgeBrandPublicMedia(brandId: string): Promise<number> {
  const result = await purgeBrandR2Objects({ data: { brandId } });
  return result.deleted;
}
