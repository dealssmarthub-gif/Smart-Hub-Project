// ============================================================================
// PRIVACY SHIELD — masks identification numbers before anything is public.
// The SQL trigger in migration 06 applies the same masking server-side, so a
// client that skips this still can't publish raw numbers.
// ============================================================================

export type SensitiveKind = "ghana_card" | "card_number" | "phone" | "email" | "passport" | "id_number";

export interface ShieldResult {
  text: string;
  findings: { kind: SensitiveKind; count: number }[];
}

export const SENSITIVE_LABEL: Record<SensitiveKind, string> = {
  ghana_card: "Ghana Card number",
  card_number: "bank card number",
  phone: "phone number",
  email: "email address",
  passport: "passport number",
  id_number: "ID / student number",
};


function maskKeepLast(match: string, n: number): string {
  let seen = 0;
  const total = (match.match(/\d/g) ?? []).length;
  return match.replace(/\d/g, (d) => (++seen > total - n ? d : "•"));
}

/** Ordered: specific formats first so a generic digit run doesn't claim them. */
const RULES: { kind: SensitiveKind; re: RegExp; mask: (m: string) => string }[] = [
  { kind: "ghana_card", re: /\bGHA[-\s]?\d{9}[-\s]?\d\b/gi, mask: () => "GHA-•••••••••-•" },
  { kind: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, mask: (m) => `${m[0]}•••@${m.split("@")[1]}` },
  // 13–19 digit card numbers, optionally grouped by spaces or dashes.
  { kind: "card_number", re: /\b(?:\d[ -]?){12,18}\d\b/g, mask: (m) => maskKeepLast(m, 4) },
  // Ghana mobile numbers: +233 / 233 / 0 followed by 9 digits.
  { kind: "phone", re: /(?:\+?233|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, mask: (m) => maskKeepLast(m, 2) },
  { kind: "passport", re: /\b[A-Z]\d{7,8}\b/g, mask: (m) => m[0] + "•".repeat(m.length - 1) },
  // Student / staff / index numbers: 7–12 digit runs.
  { kind: "id_number", re: /\b\d{7,12}\b/g, mask: (m) => maskKeepLast(m, 2) },
];

export function maskSensitive(input: string): ShieldResult {
  let text = input;
  const findings: ShieldResult["findings"] = [];
  for (const rule of RULES) {
    let count = 0;
    text = text.replace(rule.re, (m) => {
      count++;
      return rule.mask(m);
    });
    if (count) findings.push({ kind: rule.kind, count });
  }
  return { text, findings };
}

/** Item categories whose photos almost always show an ID number. */
export const SENSITIVE_CATEGORIES = ["ID / Student card", "Bank card", "Passport", "Wallet / Purse"];

export function photoNeedsShield(category: string, description: string): boolean {
  return SENSITIVE_CATEGORIES.includes(category) || maskSensitive(description).findings.length > 0;
}

/**
 * Re-encodes an uploaded photo in the browser:
 *  - `privateUrl`: downscaled, metadata (EXIF / GPS) stripped by the canvas re-encode
 *  - `publicUrl`: when `shield` is set, pixelated and blurred so no number is legible
 * There's no OCR here: sensitive photos are shielded whole, not region by region.
 */
export async function preparePhoto(file: File, shield: boolean): Promise<{ privateUrl: string; publicUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const privateUrl = canvas.toDataURL("image/jpeg", 0.85);
  if (!shield) return { privateUrl, publicUrl: privateUrl };

  // Pixelate (draw tiny, scale up without smoothing), then blur on top.
  const tiny = document.createElement("canvas");
  tiny.width = Math.max(8, Math.round(w / 24));
  tiny.height = Math.max(8, Math.round(h / 24));
  tiny.getContext("2d")!.drawImage(bitmap, 0, 0, tiny.width, tiny.height);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = "blur(6px)";
  ctx.drawImage(tiny, 0, 0, w, h);
  ctx.filter = "none";
  return { privateUrl, publicUrl: canvas.toDataURL("image/jpeg", 0.6) };
}

