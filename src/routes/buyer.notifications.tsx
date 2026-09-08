import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNaflis } from "@/lib/naflis/store";

export const Route = createFileRoute("/buyer/notifications")({
  component: NotifPage,
});

function NotifPage() {
  const list = useNaflis((s) => s.notifications.filter((n) => n.userId === s.currentUserId));
  const markRead = useNaflis((s) => s.markNotifRead);
  const clearAll = useNaflis((s) => s.clearNotifs);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Button size="sm" variant="outline" onClick={clearAll}><CheckCheck className="mr-1 h-4 w-4" /> Mark all read</Button>
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n.id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                n.read ? "bg-card" : "border-sky-500/40 bg-accent"
              }`}
            >
              <div className={`grid h-9 w-9 place-items-center rounded-full ${n.read ? "bg-muted" : "bg-sky-500 text-white"}`}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
              </div>
              {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
