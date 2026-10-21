export const GHS = (n: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  }).format(n);

export const pct = (n: number) => `${Math.round(n)}%`;

export const compact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

// Deterministic id generator so SSR and client produce identical initial state.
// Runtime-only unique-enough ids for a demo app; not for security.
let __uidSeq = 0;
export const uid = () => `id${(++__uidSeq).toString(36)}`;

export const fmtDate = (d: string | number | Date) =>
  new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });

export const fmtTime = (d: string | number | Date) =>
  new Date(d).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });

/** Digits for wa.me links: Ghana local numbers (0XX…) become 233XX…; null when there's no usable number. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "233" + digits.slice(1);
  return digits.length >= 9 ? digits : null;
}

/** tel: link target, or null when there's no usable number. */
export function telHref(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? "").trim();
  return trimmed.replace(/\D/g, "").length >= 9 ? `tel:${trimmed.replace(/[^\d+]/g, "")}` : null;
}
