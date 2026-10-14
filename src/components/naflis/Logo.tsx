import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

/** `compact` hides the wordmark on phones (icon only), keeping it from sm up. */
export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" aria-label="NAFLIS Mall home" className={`inline-flex min-h-11 items-center gap-2 ${className}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-hero shadow-premium">
        <Sparkles className="h-4 w-4 text-white" />
      </span>
      <span className={`flex-col leading-none ${compact ? "hidden sm:flex" : "flex"}`}>
        <span className="text-sm font-extrabold tracking-tight">
          <span className="text-foreground">NAFLIS</span>{" "}
          <span className="text-gradient-sea">Mall</span>
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Buy Smarter · Study Smarter
        </span>
      </span>
    </Link>
  );
}
