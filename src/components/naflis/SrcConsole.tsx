import { useCallback, useState } from "react";
import { CalendarPlus, CheckCircle2, Loader2, Plus, Ticket as TicketIcon, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/naflis/format";
import { GHS } from "@/lib/naflis/format";
import { useNaflis, type TicketTier } from "@/lib/naflis/store";
import { QrScanner } from "@/components/naflis/TicketQR";
import { validateTicket } from "@/services/staffService";

/** Create ticketed events for a campus and track sales. */
export function SrcEventsTickets({ campus }: { campus: string }) {
  const hasPermission = useNaflis((s) => s.hasPermission);
  const events = useNaflis((s) => s.campusEvents);
  const tickets = useNaflis((s) => s.tickets);
  const addCampusEvent = useNaflis((s) => s.addCampusEvent);
  const canCreate = hasPermission("student.events.create", campus);
  const canSell = hasPermission("student.tickets.sell", campus);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [organizer, setOrganizer] = useState("SRC Entertainment Committee");
  const [ticketed, setTicketed] = useState(true);
  const [salesEnd, setSalesEnd] = useState("");
  const [tiers, setTiers] = useState<Omit<TicketTier, "sold">[]>([{ id: "t1", name: "Regular", price: 30, capacity: 500 }]);
  const [busy, setBusy] = useState(false);

  const mine = events.filter((e) => e.campus === campus && e.kind !== "announcement");

  const publish = async () => {
    if (!title.trim() || !date) return toast.error("Add a title and a date.");
    if (ticketed && (!canSell || tiers.some((t) => !t.name.trim() || t.price < 0 || t.capacity < 1))) {
      return toast.error(canSell ? "Each ticket type needs a name, a price of 0 or more, and capacity." : "You can create events but not sell tickets here.");
    }
    setBusy(true);
    let eventId: string | undefined;
    let tierRows = tiers.map((t) => ({ ...t, id: "tier_" + uid(), sold: 0 }));
    // With a Supabase session, the server owns the ids (and RLS checks scope again).
    if (supabase) {
      const { data: session } = await supabase.auth.getSession();
      if (session.session) {
        const { data, error } = await supabase
          .from("campus_events")
          .insert({ title: title.trim(), description, event_date: new Date(date).toISOString(), venue, campus, organizer, pinned: false, kind: "event" })
          .select("id")
          .single();
        if (error) {
          setBusy(false);
          return toast.error(error.message.includes("row-level") ? `You're not authorised to publish for ${campus}.` : error.message);
        }
        eventId = data.id;
        if (ticketed) {
          const { data: rows, error: tErr } = await supabase
            .from("ticket_tiers")
            .insert(tiers.map((t) => ({ event_id: eventId, name: t.name, price_minor: Math.round(t.price * 100), capacity: t.capacity, sales_end_at: salesEnd ? new Date(salesEnd).toISOString() : null })))
            .select("id, name, price_minor, capacity");
          if (tErr) {
            setBusy(false);
            return toast.error(tErr.message);
          }
          tierRows = (rows ?? []).map((r: any) => ({ id: r.id, name: r.name, price: r.price_minor / 100, capacity: r.capacity, sold: 0 }));
        }
      }
    }
    const created = addCampusEvent({
      id: eventId,
      kind: "event",
      title: title.trim(),
      description: description.trim(),
      eventDate: new Date(date).toISOString(),
      venue: venue.trim() || "TBA",
      campus,
      pinned: false,
      organizer: organizer.trim() || "SRC",
      ticketing: ticketed ? { tiers: tierRows, salesEndAt: salesEnd ? new Date(salesEnd).toISOString() : undefined } : undefined,
    });
    setBusy(false);
    if (!created) return toast.error(`You're not authorised to publish events for ${campus}.`);
    toast.success(ticketed ? "Event published — tickets are on sale in Student OS." : "Event published.");
    setTitle(""); setDate(""); setVenue(""); setDescription(""); setSalesEnd("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <section className="h-fit space-y-3 rounded-2xl border bg-card p-5">
        <h3 className="flex items-center gap-2 font-bold"><CalendarPlus className="h-4 w-4 text-sky-500" /> New event · {campus}</h3>
        {!canCreate ? (
          <p className="text-sm text-muted-foreground">Your role doesn't include creating events for {campus}.</p>
        ) : (
          <>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Starts</Label><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Venue</Label><Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Great Hall" /></div>
            </div>
            <Input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Organiser" />
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's happening" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-sky-500" checked={ticketed} disabled={!canSell} onChange={(e) => setTicketed(e.target.checked)} />
              Sell tickets {!canSell && <span className="text-xs text-muted-foreground">(not in your permissions)</span>}
            </label>
            {ticketed && canSell && (
              <div className="space-y-2 rounded-lg border p-3">
                {tiers.map((t, i) => (
                  <div key={t.id} className="grid grid-cols-[1fr_80px_80px_auto] items-end gap-2">
                    <div className="space-y-1"><Label className="text-[10px]">Ticket type</Label><Input value={t.name} onChange={(e) => setTiers((c) => c.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></div>
                    <div className="space-y-1"><Label className="text-[10px]">GHS</Label><Input type="number" min={0} value={t.price} onChange={(e) => setTiers((c) => c.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} /></div>
                    <div className="space-y-1"><Label className="text-[10px]">Capacity</Label><Input type="number" min={1} value={t.capacity} onChange={(e) => setTiers((c) => c.map((x, j) => (j === i ? { ...x, capacity: Number(e.target.value) } : x)))} /></div>
                    <Button size="icon" variant="ghost" disabled={tiers.length === 1} onClick={() => setTiers((c) => c.filter((_, j) => j !== i))} aria-label="Remove ticket type"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setTiers((c) => [...c, { id: "t" + uid(), name: "VIP", price: 80, capacity: 100 }])}><Plus className="mr-1 h-3.5 w-3.5" /> Ticket type</Button>
                <div className="space-y-1"><Label className="text-xs">Sales close</Label><Input type="datetime-local" value={salesEnd} onChange={(e) => setSalesEnd(e.target.value)} /></div>
              </div>
            )}
            <Button className="w-full" onClick={publish} disabled={busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Publish event</Button>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-bold">Events at {campus}</h3>
        {mine.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No events yet.</p>}
        {mine.map((e) => {
          const evTickets = tickets.filter((t) => t.eventId === e.id);
          const checkedIn = evTickets.filter((t) => t.status === "checked_in").length;
          return (
            <div key={e.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.eventDate).toLocaleString("en-GH")} · {e.venue}</p>
                </div>
                {e.ticketing ? <Badge><TicketIcon className="mr-1 h-3 w-3" /> Ticketed</Badge> : <Badge variant="outline">Free entry</Badge>}
              </div>
              {e.ticketing && (
                <div className="mt-3 space-y-1.5 text-xs">
                  {e.ticketing.tiers.map((t) => (
                    <div key={t.id}>
                      <div className="flex justify-between"><span>{t.name} · {GHS(t.price)}</span><span>{t.sold} / {t.capacity} sold · {GHS(t.sold * t.price)}</span></div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-sky-500" style={{ width: `${Math.min(100, (t.sold / t.capacity) * 100)}%` }} /></div>
                    </div>
                  ))}
                  <p className="text-muted-foreground">{evTickets.length} issued in this app · {checkedIn} checked in</p>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** Gate screen: scan or type a ticket code; each ticket admits once. */
export function TicketCheckIn({ campus }: { campus: string }) {
  const hasPermission = useNaflis((s) => s.hasPermission);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  const [log, setLog] = useState<{ ok: boolean; message: string; at: number }[]>([]);
  const allowed = hasPermission("student.tickets.validate", campus);

  const check = useCallback(async (raw: string) => {
    if (!raw.trim()) return;
    setBusy(true);
    const res = { ...(await validateTicket(raw)), at: Date.now() };
    setBusy(false);
    setResult(res);
    setLog((l) => [res, ...l].slice(0, 10));
    setCode("");
  }, []);

  if (!allowed) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Your role doesn't include validating tickets for {campus}.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h3 className="font-bold">Scan tickets · {campus}</h3>
        <QrScanner onScan={check} />
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check(code)} placeholder="Or type / paste the ticket code" className="font-mono uppercase" />
          <Button onClick={() => check(code)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}</Button>
        </div>
        {result && (
          <div className={`flex items-center gap-3 rounded-xl p-4 ${result.ok ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
            {result.ok ? <CheckCircle2 className="h-8 w-8 shrink-0" /> : <XCircle className="h-8 w-8 shrink-0" />}
            <div>
              <p className="text-lg font-black">{result.ok ? "ADMIT" : "DENY"}</p>
              <p className="text-sm">{result.message}</p>
            </div>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="font-bold">Recent scans</h3>
        {log.length === 0 && <p className="text-sm text-muted-foreground">Nothing scanned yet.</p>}
        {log.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-2.5 text-xs">
            {r.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-error" />}
            <span className="flex-1">{r.message}</span>
            <span className="text-muted-foreground">{new Date(r.at).toLocaleTimeString("en-GH")}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
