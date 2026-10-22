import { Link, useRouterState } from "@tanstack/react-router";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import {
  BookOpen,
  Briefcase,
  Calendar,
  CalendarDays,
  MapPin,
  SearchCheck,
  Ticket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListingImage } from "@/components/naflis/home/HomeBlocks";
import type { CampusEvent } from "@/lib/naflis/store";
import { hiddenInLive } from "@/lib/appMode";

const CAMPUS_PAGES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/student-os/resources", label: "Resources", icon: BookOpen },
  { to: "/student-os/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/student-os/events", label: "Events", icon: Ticket },
  { to: "/student-os/opportunities", label: "Opportunities", icon: Briefcase },
  { to: "/student-os/lost-found", label: "Lost & Found", icon: SearchCheck },
];

/** The pill row shared by the five Campus pages. */
export function CampusNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav
      aria-label="Campus"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:px-0"
    >
      {CAMPUS_PAGES.filter((p) => !hiddenInLive(p.to)).map((p) => {
        const Icon = p.icon;
        const on = pathname.startsWith(p.to);
        return (
          <Link
            key={p.to}
            to={p.to}
            aria-current={on ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-bold transition ${
              on
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-card text-subtle-foreground shadow-soft hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} /> {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Title, subtitle and actions for a Campus page, above the Campus pill row. */
export function CampusHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      <CampusNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            <Icon className="h-6 w-6 shrink-0 text-link" strokeWidth={1.8} /> {title}
          </h1>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export const campusPrimaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60";
export const campusSecondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60";
export const campusSelect =
  "h-11 appearance-none rounded-xl border border-border bg-card pl-3 pr-9 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const campusCard = "rounded-3xl border border-border-soft bg-card shadow-soft";

/**
 * An SRC notice, as the landing page has always shown it: campus, organiser,
 * title, publish date, banner, description, venue and date, with a link to the
 * SRC portal. `children` replaces the default actions.
 */
export function NoticeDialog({
  notice,
  onClose,
  children,
}: {
  notice: CampusEvent | null;
  onClose: () => void;
  children?: ReactNode;
}) {
  const returnFocus = useReturnFocus(!!notice);
  return (
    <Dialog open={!!notice} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg rounded-[28px]" onCloseAutoFocus={returnFocus}>
        {notice && (
          <>
            <DialogHeader>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                  {notice.campus}
                </span>
                <span className="text-xs font-bold text-link">{notice.organizer}</span>
              </div>
              <DialogTitle className="text-lg font-extrabold leading-snug">
                {notice.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Official announcement published on {new Date(notice.createdAt).toLocaleDateString()}
              </DialogDescription>
            </DialogHeader>
            {notice.bannerUrl && (
              <div className="mt-2 h-44 w-full overflow-hidden rounded-2xl bg-muted">
                <ListingImage src={notice.bannerUrl} alt={notice.title} />
              </div>
            )}
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
              <p>{notice.description}</p>
              <div className="mt-3 space-y-1 rounded-2xl bg-muted p-3 text-xs text-subtle-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-link" strokeWidth={1.8} />
                  <span>Venue: {notice.venue}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-link" strokeWidth={1.8} />
                  <span>Date: {new Date(notice.eventDate).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {children ?? (
                <button type="button" onClick={onClose} className={campusSecondaryBtn}>
                  Close
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
