import type { OrderEvent } from "@/lib/naflis/store";
import { Check, Circle } from "lucide-react";

export function EscrowTimeline({ events }: { events: OrderEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        return (
          <li key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full ${
                  last ? "bg-violet text-violet-foreground" : "bg-success text-success-foreground"
                }`}
              >
                {last ? <Circle className="h-3 w-3 fill-current" /> : <Check className="h-3.5 w-3.5" />}
              </span>
              {i < events.length - 1 && <span className="mt-1 h-6 w-px bg-border" />}
            </div>
            <div className="flex-1 pb-2">
              <p className="text-sm font-medium capitalize">{String(e.status).replaceAll("-", " ")}</p>
              <p className="text-xs text-muted-foreground">{e.note}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(e.at).toLocaleString("en-GH")}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
