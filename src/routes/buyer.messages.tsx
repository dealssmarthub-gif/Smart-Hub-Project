import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmtTime } from "@/lib/naflis/format";

export const Route = createFileRoute("/buyer/messages")({
  component: MessagesPage,
});

const THREADS = [
  { id: "t1", name: "TrendTech Ghana (masked)", last: "Yes, the iPhone comes with 12-month warranty." },
  { id: "t2", name: "Kojo Delivery", last: "I'm 15 minutes away with your parcel." },
  { id: "t3", name: "NAFLIS Support", last: "Escrow released successfully." },
];

function MessagesPage() {
  const [active, setActive] = useState("t1");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Record<string, { from: "me" | "them"; body: string; at: number }[]>>({
    t1: [
      { from: "them", body: "Hi, how can we help?", at: Date.now() - 3600000 },
      { from: "me", body: "Does the iPhone come with warranty?", at: Date.now() - 3500000 },
      { from: "them", body: "Yes, the iPhone comes with 12-month warranty.", at: Date.now() - 3400000 },
    ],
    t2: [{ from: "them", body: "I'm 15 minutes away with your parcel.", at: Date.now() - 900000 }],
    t3: [{ from: "them", body: "Escrow released successfully.", at: Date.now() - 86400000 }],
  });

  const send = () => {
    if (!text.trim()) return;
    setMsgs((m) => ({ ...m, [active]: [...(m[active] ?? []), { from: "me", body: text, at: Date.now() }] }));
    setText("");
    setTimeout(() => {
      setMsgs((m) => ({
        ...m,
        [active]: [...(m[active] ?? []), { from: "them", body: "Thanks — a team member will reply shortly.", at: Date.now() }],
      }));
    }, 900);
  };

  return (
    <div className="grid gap-4 rounded-2xl border bg-card md:grid-cols-[240px_1fr]" style={{ minHeight: "60vh" }}>
      <aside className="border-b p-3 md:border-b-0 md:border-r">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-4 w-4" /> Threads
        </p>
        <div className="space-y-1">
          {THREADS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`w-full rounded-lg p-2 text-left text-sm transition ${active === t.id ? "bg-accent" : "hover:bg-muted"}`}
            >
              <p className="font-medium">{t.name}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{t.last}</p>
            </button>
          ))}
        </div>
      </aside>
      <div className="flex flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {(msgs[active] ?? []).map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.from === "me" ? "bg-violet text-violet-foreground" : "bg-muted"}`}>
                {m.body}
                <p className="mt-0.5 text-[10px] opacity-60">{fmtTime(m.at)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t p-3">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" />
          <Button onClick={send}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
