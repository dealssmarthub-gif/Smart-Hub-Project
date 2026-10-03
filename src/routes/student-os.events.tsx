import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, MapPin, Ticket as TicketIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShallow } from "zustand/react/shallow";
import { useNaflis, type CampusEvent } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { TicketQR } from "@/components/naflis/TicketQR";
import { buyTicket, describePaymentError, newIdempotencyKey, ticketQrPayload, type PaymentMethod } from "@/services/walletService";

export const Route = createFileRoute("/student-os/events")({
  component: CampusEventsTickets,
});

function CampusEventsTickets() {
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const events = useNaflis(
    useShallow((s) =>
      s.campusEvents.filter(
        (e) => e.kind !== "announcement" && (activeCampus === "All Campuses" || e.campus === activeCampus) && new Date(e.eventDate).getTime() > Date.now() - 86_400_000,
      ),
    ),
  );
  const myTickets = useNaflis(useShallow((s) => s.tickets.filter((t) => t.holderId === s.currentUserId)));
  const allEvents = useNaflis((s) => s.campusEvents);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight"><TicketIcon className="h-6 w-6 text-sky-500" /> Campus Events</h1>
        <p className="text-sm text-muted-foreground">Events at {activeCampus}. Tickets carry a unique QR code checked once at the gate.</p>
      </div>
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Upcoming ({events.length})</TabsTrigger>
          <TabsTrigger value="mine">My tickets ({myTickets.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="events" className="mt-4 grid gap-4 md:grid-cols-2">
          {events.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2">No upcoming events here.</p>}
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </TabsContent>
        <TabsContent value="mine" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myTickets.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No tickets yet.</p>}
          {myTickets.map((t) => {
            const ev = allEvents.find((e) => e.id === t.eventId);
            const tier = ev?.ticketing?.tiers.find((x) => x.id === t.tierId);
            return (
              <div key={t.id} className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center">
                <p className="font-semibold">{ev?.title ?? "Event"}</p>
                <p className="text-xs text-muted-foreground">{tier?.name} · {ev ? new Date(ev.eventDate).toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                {t.status === "valid" ? (
                  <TicketQR value={ticketQrPayload(t.token)} size={180} />
                ) : (
                  <div className="grid h-[180px] w-[180px] place-items-center rounded-lg bg-muted text-sm text-muted-foreground">
                    {t.status === "checked_in" ? <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-success" /> Used</span> : "Void"}
                  </div>
                )}
                <p className="font-mono text-[11px] tracking-wider">{t.token}</p>
                <Badge variant={t.status === "valid" ? "default" : "secondary"} className="capitalize">{t.status.replace("_", " ")}</Badge>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EventCard({ event }: { event: CampusEvent }) {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const [tierId, setTierId] = useState(event.ticketing?.tiers[0]?.id ?? "");
  const [method, setMethod] = useState<PaymentMethod>("wallet");
  const [busy, setBusy] = useState(false);
  // Same key for retries of one purchase attempt; a new one after it settles or definitively fails.
  const keyRef = useRef<string | null>(null);
  const tier = event.ticketing?.tiers.find((t) => t.id === tierId);
  const closed = event.ticketing?.salesEndAt ? Date.now() > new Date(event.ticketing.salesEndAt).getTime() : false;

  const buy = async () => {
    if (!tier) return;
    keyRef.current ??= newIdempotencyKey("tkt");
    setBusy(true);
    try {
      const res = await buyTicket({ eventId: event.id, tierId: tier.id, method, idempotencyKey: keyRef.current });
      keyRef.current = null;
      toast.success(res.message + " Find it under My tickets.");
    } catch (err) {
      const d = describePaymentError(err);
      if (!d.retryable) keyRef.current = null;
      toast.error(d.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border bg-card">
      {event.bannerUrl && <img src={event.bannerUrl} alt="" className="h-32 w-full object-cover" />}
      <div className="space-y-2 p-4">
        <p className="text-[11px] font-semibold uppercase text-sky-500">{event.organizer}</p>
        <h3 className="font-bold leading-snug">{event.title}</h3>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {new Date(event.eventDate).toLocaleString("en-GH", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {event.venue}</p>
        <p className="line-clamp-2 text-sm">{event.description}</p>
        {event.ticketing ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <select aria-label="Ticket type" className="h-9 rounded-md border bg-background px-2 text-xs" value={tierId} onChange={(e) => setTierId(e.target.value)}>
              {event.ticketing.tiers.map((t) => (
                <option key={t.id} value={t.id} disabled={t.sold >= t.capacity}>
                  {t.name} · {t.price ? GHS(t.price) : "Free"}{t.sold >= t.capacity ? " (sold out)" : ` · ${t.capacity - t.sold} left`}
                </option>
              ))}
            </select>
            {tier && tier.price > 0 && (
              <select aria-label="Pay with" className="h-9 rounded-md border bg-background px-2 text-xs" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                <option value="wallet">NAFLIS Wallet</option>
                <option value="card">Card</option>
                <option value="momo">Mobile Money</option>
              </select>
            )}
            <Button size="sm" onClick={buy} disabled={busy || !signedIn || closed || !tier || tier.sold >= tier.capacity}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {closed ? "Sales closed" : tier?.price ? `Buy · ${GHS(tier.price)}` : "Get ticket"}
            </Button>
          </div>
        ) : (
          <Badge variant="outline">Free entry · no ticket needed</Badge>
        )}
      </div>
    </article>
  );
}
