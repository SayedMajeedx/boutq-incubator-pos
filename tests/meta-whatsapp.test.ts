import { describe, expect, it } from "vitest";
import {
  normalizeMetaStatusTimestamp,
  verifyMetaWebhookSignature,
} from "../src/lib/meta-whatsapp.server";

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(body: ArrayBuffer, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `sha256=${toHex(await crypto.subtle.sign("HMAC", key, body))}`;
}

describe("Meta WhatsApp webhook security", () => {
  it("accepts an authentic Meta HMAC signature", async () => {
    const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}').buffer;
    const signature = await sign(body, "test-app-secret");

    await expect(verifyMetaWebhookSignature(body, signature, "test-app-secret")).resolves.toBe(
      true,
    );
  });

  it("rejects tampered bodies and malformed signatures", async () => {
    const original = new TextEncoder().encode('{"ok":true}').buffer;
    const tampered = new TextEncoder().encode('{"ok":false}').buffer;
    const signature = await sign(original, "test-app-secret");

    await expect(verifyMetaWebhookSignature(tampered, signature, "test-app-secret")).resolves.toBe(
      false,
    );
    await expect(
      verifyMetaWebhookSignature(original, "sha256=not-hex", "test-app-secret"),
    ).resolves.toBe(false);
    await expect(verifyMetaWebhookSignature(original, null, "test-app-secret")).resolves.toBe(
      false,
    );
  });

  it("converts Meta epoch timestamps into ISO timestamps", () => {
    expect(normalizeMetaStatusTimestamp("1720000000")).toBe("2024-07-03T09:46:40.000Z");
    expect(Number.isNaN(Date.parse(normalizeMetaStatusTimestamp("invalid")))).toBe(false);
  });
});
