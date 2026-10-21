import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, ChevronRight, ImageOff, Pin, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GHS } from "@/lib/naflis/format";
import { useNaflis, type StudentListing } from "@/lib/naflis/store";
import { hiddenInLive } from "@/lib/appMode";

/**
 * A listing photo. The real image is always used; the neutral placeholder only
 * appears when there is no image or the image fails to load.
 */
export function ListingImage({
  src,
  alt,
  className = "",
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React attaches onError: check once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`grid h-full w-full place-items-center bg-muted text-muted-foreground ${className}`}
      >
        <ImageOff className="h-7 w-7" strokeWidth={1.8} />
      </div>
    );
  }
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

export type TileTone = "lavender" | "peach" | "mint" | "sky" | "butter" | "rose";

// Static class names so Tailwind generates them.
const TONE: Record<TileTone, { bg: string; icon: string }> = {
  lavender: { bg: "bg-tile-lavender", icon: "bg-tile-lavender-icon" },
  peach: { bg: "bg-tile-peach", icon: "bg-tile-peach-icon" },
  mint: { bg: "bg-tile-mint", icon: "bg-tile-mint-icon" },
  sky: { bg: "bg-tile-sky", icon: "bg-tile-sky-icon" },
  butter: { bg: "bg-tile-butter", icon: "bg-tile-butter-icon" },
  rose: { bg: "bg-tile-rose", icon: "bg-tile-rose-icon" },
};

/** Pastel quick-access tile: a link, or a button when given `onClick`. */
export function Tile({
  tone,
  icon: Icon,
  title,
  hint,
  to,
  onClick,
  cta,
}: {
  tone: TileTone;
  icon: LucideIcon;
  title: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  cta?: string;
}) {
  const t = TONE[tone];
  const body = (
    <>
      <span className={`grid h-11 w-11 place-items-center rounded-full text-white ${t.icon}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="mt-3 block text-[15px] font-bold leading-snug text-foreground">{title}</span>
      {hint && (
        <span className="mt-1 block text-xs leading-relaxed text-subtle-foreground">{hint}</span>
      )}
      {cta && (
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-bold text-link">
          {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      )}
    </>
  );
  const cls = `flex h-full min-h-[132px] flex-col items-start rounded-3xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft sm:p-5 ${t.bg}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function SectionHeader({
  title,
  hint,
  icon: Icon,
  action,
}: {
  title: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-link" strokeWidth={1.8} />}
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** "See all" style link used in section headers. */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold text-link hover:bg-accent"
    >
      {children} <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
    </Link>
  );
}

/** Group deals, fewest spots left first. Ties keep their existing order. */
export function almostFull(listings: StudentListing[]): StudentListing[] {
  const spots = (l: StudentListing) =>
    Math.max(0, (l.groupDealTarget || 10) - (l.groupDealJoined || 0));
  return listings
    .filter((l) => l.isGroupDeal)
    .map((l, i) => ({ l, i }))
    .sort((a, b) => spots(a.l) - spots(b.l) || a.i - b.i)
    .map((x) => x.l);
}

/** Group-buy card: photo, spots-left badge, price, progress and joined count. */
export function GroupBuyCard({
  deal,
  action,
  className = "",
}: {
  deal: StudentListing;
  action?: ReactNode;
  className?: string;
}) {
  const joined = deal.groupDealJoined || 0;
  const target = deal.groupDealTarget || 10;
  const left = Math.max(0, target - joined);
  const pct = Math.min(100, Math.round((joined / target) * 100));
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft ${className}`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        <ListingImage src={deal.image} alt={deal.title} />
        <span className="absolute left-3 top-3 rounded-full bg-tile-peach px-2.5 py-1 text-[11px] font-bold text-peach-ink">
          {left === 0 ? "Full" : `${left} spot${left === 1 ? "" : "s"} left`}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {deal.campus}
          </p>
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
            {deal.title}
          </h3>
        </div>
        <p>
          <span className="text-lg font-extrabold text-foreground">{GHS(deal.price)}</span>
          {deal.originalPrice && deal.originalPrice > deal.price && (
            <span className="ml-2 text-sm text-muted-foreground line-through">
              {GHS(deal.originalPrice)}
            </span>
          )}
        </p>
        <div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={joined}
            aria-label="Students joined"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-subtle-foreground">
            {joined} of {target} students joined
          </p>
        </div>
        {action && <div className="mt-auto">{action}</div>}
      </div>
    </article>
  );
}

/** Dark indigo escrow banner with a single action. */
export function EscrowBanner({
  title,
  body,
  action,
  extra,
}: {
  title: string;
  body: ReactNode;
  action: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-escrow p-5 text-escrow-foreground sm:flex-row sm:items-center sm:p-6">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15">
        <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-extrabold sm:text-lg">{title}</h2>
        <div className="mt-1 text-sm leading-relaxed text-white/85">{body}</div>
        {extra}
      </div>
      <div className="shrink-0">{action}</div>
    </section>
  );
}

/** White pill button for use on the indigo / violet blocks. */
export const onDarkButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-[#2F2A8F] transition hover:bg-white/90";

/** One-line SRC notice. */
export function SrcNoticeRow({
  title,
  campus,
  onOpen,
  to,
}: {
  title: string;
  campus?: string;
  onOpen?: () => void;
  to?: string;
}) {
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tile-rose-icon text-white">
        <Pin className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          SRC notice{campus ? ` · ${campus}` : ""}
        </span>
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
    </>
  );
  const cls =
    "flex min-h-16 w-full items-center gap-3 rounded-3xl bg-tile-rose px-4 py-3 transition hover:shadow-soft";
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={cls}>
      {body}
    </button>
  );
}

/** Notifications bell with unread count (signed-in only). */
export function NotificationBell(props: { tone?: "default" | "onPrimary" }) {
  // Live: alerts run on in-browser data only (appMode LIVE_HIDDEN_PATHS).
  return hiddenInLive("/buyer/notifications") ? null : <AlertsBell {...props} />;
}

function AlertsBell({ tone = "default" }: { tone?: "default" | "onPrimary" }) {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const unread = useNaflis(
    (s) => s.notifications.filter((n) => n.userId === s.currentUserId && !n.read).length,
  );
  if (!signedIn) return null;
  return (
    <Link
      to="/buyer/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className={`relative grid h-11 w-11 place-items-center rounded-full transition ${
        tone === "onPrimary"
          ? "text-white hover:bg-white/15"
          : "text-subtle-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <Bell className="h-5 w-5" strokeWidth={1.8} />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-error-foreground">
          {unread}
        </span>
      )}
    </Link>
  );
}
