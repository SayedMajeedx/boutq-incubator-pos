export const META_TITLE_LIMIT = 70;
export const META_DESCRIPTION_LIMIT = 160;

/** SEO fields are plain text. Strip markup/control characters before persistence or rendering. */
export function sanitizeMetaText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function slugifyPageTitle(value: unknown): string {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "page";
}

export function uniquePageSlug(candidate: string, used: Set<string>): string {
  const base = slugifyPageTitle(candidate);
  let result = base;
  let suffix = 2;
  while (used.has(result)) result = `${base}-${suffix++}`;
  used.add(result);
  return result;
}
