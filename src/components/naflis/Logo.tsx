import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-hero shadow-premium">
        <Sparkles className="h-4 w-4 text-white" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-black tracking-tight">
          <span className="text-foreground">NAFLIS</span>{" "}
          <span className="text-gradient-sea">Mall</span>
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Buy Smarter · Sell Smarter
        </span>
      </span>
    </Link>
  );
}
