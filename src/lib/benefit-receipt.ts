import {
  createBenefitReceiptUpload,
  finalizeBenefitReceiptUpload,
} from "@/lib/benefit-receipt.functions";

export async function uploadBenefitReceipt(brandId: string, file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Please use a JPG, PNG, or WebP image");
  if (file.size > 5 * 1024 * 1024) throw new Error("Receipt image must be smaller than 5 MB");
  const slot = await createBenefitReceiptUpload({
    data: {
      brandId,
      contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      size: file.size,
    },
  });
  let response: Response;
  try {
    response = await fetch(slot.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type, "Cache-Control": "private, no-store" },
      body: file,
    });
  } catch {
    // Browsers report a blocked R2 preflight as the unhelpful
    // `TypeError: Failed to fetch`. Preserve a stable application error so
    // checkout can tell the shopper what happened without exposing storage
    // credentials or internal URLs.
    throw new Error("RECEIPT_STORAGE_UNREACHABLE");
  }
  if (!response.ok) throw new Error(`Receipt upload failed (${response.status})`);
  const finalized = await finalizeBenefitReceiptUpload({
    data: { receiptId: slot.receiptId, objectKey: slot.objectKey },
  });
  return finalized.receiptId;
}
