import { Link } from "@tanstack/react-router";

/** The bag-with-N mark (public/logo-mark-96.png covers up to 3x at 32px). Decorative: pair it with text. */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/logo-mark-96.png"
      alt=""
      width={96}
      height={96}
      decoding="async"
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}

/** "NAFLIS Mall" set in text so it stays crisp; "Mall" in the brand colour (gold on dark). */
export function Wordmark({ className = "text-sm" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className="text-foreground">NAFLIS</span>{" "}
      <span className="text-link dark:text-gold">Mall</span>
    </span>
  );
}

/** `compact` hides the tagline on phones (mark + wordmark only), keeping it from sm up. */
export function Logo({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to="/"
      aria-label="NAFLIS Mall home"
      className={`inline-flex min-h-11 min-w-11 items-center gap-2 ${className}`}
    >
      <BrandMark />
      <span className="flex flex-col leading-none">
        <Wordmark className="whitespace-nowrap text-sm" />
        <span
          className={`mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground ${compact ? "hidden sm:block" : ""}`}
        >
          Buy Smarter · Study Smarter
        </span>
      </span>
    </Link>
  );
}

/** Loading state with the mark. Page-level by default; pass `className` to size it for a list. */
export function BrandLoading({
  label,
  className = "min-h-[40vh] py-16",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 text-center ${className}`}
    >
      <BrandMark className="h-12 w-12 motion-safe:animate-pulse" />
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
