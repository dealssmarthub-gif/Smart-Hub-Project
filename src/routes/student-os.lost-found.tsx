import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, HandHelping, ImagePlus, KeyRound, Loader2, MapPin, PackageSearch, SearchCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { fmtDate } from "@/lib/naflis/format";
import {
  CLAIM_PIPELINE,
  FOUND_STATUS_LABEL,
  LF_CATEGORIES,
  matchScore,
  type FoundStatus,
  type LostFoundItem,
} from "@/lib/naflis/lostFound";
import { SENSITIVE_LABEL, maskSensitive, photoNeedsShield, preparePhoto } from "@/lib/naflis/privacyShield";
import { toIsoDate } from "@/lib/naflis/timetable";

export const Route = createFileRoute("/student-os/lost-found")({
  component: LostAndFound,
});

function useViewer() {
  const userId = useNaflis((s) => s.currentUserId);
  const role = useNaflis((s) => s.role);
  return { userId, isDesk: ["src_head", "admin", "super_admin"].includes(role) };
}

function LostAndFound() {
  const items = useNaflis((s) => s.lostFound);
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const { userId, isDesk } = useViewer();
  const [reporting, setReporting] = useState<"lost" | "found" | null>(null);
  const [q, setQ] = useState("");

  const onCampus = (x: LostFoundItem) => activeCampus === "All Campuses" || x.campus === activeCampus;
  const search = (x: LostFoundItem) => !q.trim() || `${x.title} ${x.publicDescription} ${x.location} ${x.category}`.toLowerCase().includes(q.toLowerCase());
  const found = items.filter((x) => x.kind === "found" && x.status !== "closed" && onCampus(x) && search(x));
  const lost = items.filter((x) => x.kind === "lost" && x.status !== "closed" && onCampus(x) && search(x));
  const mine = items.filter((x) => x.reporterId === userId || x.claims.some((c) => c.claimantId === userId));
  const deskQueue = items.filter((x) => x.kind === "found" && ["claim_requested", "verification_required", "claim_approved", "collected"].includes(x.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <SearchCheck className="h-6 w-6 text-sky-500" /> Lost & Found
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeCampus}. ID numbers, card numbers and phone numbers are masked before anything is shown publicly.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReporting("lost")} disabled={!userId}>
            <PackageSearch className="mr-1 h-4 w-4" /> I lost something
          </Button>
          <Button onClick={() => setReporting("found")} disabled={!userId}>
            <HandHelping className="mr-1 h-4 w-4" /> I found something
          </Button>
        </div>
      </div>
      {!userId && <p className="text-xs text-muted-foreground">Sign in to report or claim an item.</p>}

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, places…" className="max-w-sm" />

      <Tabs defaultValue="found">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="found">Found items ({found.length})</TabsTrigger>
          <TabsTrigger value="lost">Lost reports ({lost.length})</TabsTrigger>
          <TabsTrigger value="mine">My reports & claims ({mine.length})</TabsTrigger>
          {isDesk && <TabsTrigger value="desk">Desk queue ({deskQueue.length})</TabsTrigger>}
        </TabsList>
        <TabsContent value="found" className="mt-4 grid gap-3 md:grid-cols-2">
          {found.length === 0 ? <EmptyNote text="No found items reported here yet." /> : found.map((x) => <ItemCard key={x.id} item={x} />)}
        </TabsContent>
        <TabsContent value="lost" className="mt-4 grid gap-3 md:grid-cols-2">
          {lost.length === 0 ? <EmptyNote text="No open lost-item reports." /> : lost.map((x) => <ItemCard key={x.id} item={x} />)}
        </TabsContent>
        <TabsContent value="mine" className="mt-4 grid gap-3 md:grid-cols-2">
          {mine.length === 0 ? <EmptyNote text="You haven't reported or claimed anything." /> : mine.map((x) => <ItemCard key={x.id} item={x} />)}
        </TabsContent>
        {isDesk && (
          <TabsContent value="desk" className="mt-4 grid gap-3 md:grid-cols-2">
            {deskQueue.length === 0 ? <EmptyNote text="No claims waiting on the desk." /> : deskQueue.map((x) => <ItemCard key={x.id} item={x} />)}
          </TabsContent>
        )}
      </Tabs>

      {reporting && <ReportDialog kind={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2">{text}</p>;
}

// ---------------------------------------------------------------------------
// Report flow
// ---------------------------------------------------------------------------

function ReportDialog({ kind, onClose }: { kind: "lost" | "found"; onClose: () => void }) {
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const report = useNaflis((s) => s.reportLostFound);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof LF_CATEGORIES)[number]>(LF_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [campus, setCampus] = useState(activeCampus === "All Campuses" ? "UG - Legon" : activeCampus);
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(toIsoDate(Date.now()));
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [handover, setHandover] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = maskSensitive(description);
  const titlePreview = maskSensitive(title);
  const shielded = photoNeedsShield(category, `${title} ${description}`);

  const submit = async () => {
    if (!title.trim() || !location.trim() || !description.trim()) return toast.error("Add a title, description and location.");
    if (kind === "found" && (!question.trim() || !answer.trim())) return toast.error("Add a verification question only the owner could answer.");
    setSaving(true);
    try {
      const photo = file ? await preparePhoto(file, shielded) : null;
      const item = report({
        kind,
        title: title.trim(),
        category,
        description: description.trim(),
        campus,
        location: location.trim(),
        date,
        photoPrivate: photo?.privateUrl,
        photoPublic: photo?.publicUrl,
        photoShielded: Boolean(photo) && shielded,
        verificationQuestion: kind === "found" ? question.trim() : undefined,
        verificationAnswer: kind === "found" ? answer.trim() : undefined,
        handoverPoint: kind === "found" ? handover.trim() || "Campus SRC office" : undefined,
      });
      if (!item) return toast.error("Sign in to report an item.");
      toast.success(kind === "found" ? "Thanks! The owner can now find and claim it." : "Report posted. We'll alert you if a match is handed in.");
      onClose();
    } catch {
      toast.error("Couldn't process that photo. Try a JPG or PNG.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === "found" ? "I found something" : "I lost something"}</DialogTitle>
          <DialogDescription>
            {kind === "found"
              ? "Describe it without giving away everything — keep one detail private for the verification question."
              : "The more detail, the better the match. Numbers like IDs and phones are masked publicly."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>What is it?</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Black HP laptop bag" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                {LF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{kind === "found" ? "Date found" : "Date lost"}</Label>
              <Input type="date" value={date} max={toIsoDate(Date.now())} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Campus</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={campus} onChange={(e) => setCampus(e.target.value)}>
                {CAMPUSES.filter((c) => c !== "All Campuses").map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Where?</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Balme Library" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Colour, brand, marks, what's inside…" />
          </div>

          {(description || title) && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5 text-xs">
              <p className="flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400"><ShieldCheck className="h-3.5 w-3.5" /> Public preview</p>
              <p className="mt-1 font-medium">{titlePreview.text || "—"}</p>
              <p className="mt-0.5 text-muted-foreground">{preview.text || "—"}</p>
              {[...preview.findings, ...titlePreview.findings].length > 0 && (
                <p className="mt-1 text-success">
                  Masked: {[...preview.findings, ...titlePreview.findings].map((f) => `${f.count} ${SENSITIVE_LABEL[f.kind]}`).join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>Photo (optional)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground hover:bg-muted">
              <ImagePlus className="h-4 w-4" /> {file ? file.name : "Add a photo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <p className="text-[11px] text-muted-foreground">
                Location metadata is stripped.{" "}
                {shielded ? "This looks like it shows ID details, so the public photo will be blurred; only you and an approved owner see it clearly." : "The photo will be shown as-is."}
              </p>
            )}
          </div>

          {kind === "found" && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="flex items-center gap-1 text-xs font-semibold"><KeyRound className="h-3.5 w-3.5" /> Private — only you and the desk see this</p>
              <div className="space-y-1">
                <Label className="text-xs">Verification question</Label>
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What's the lock-screen photo?" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected answer</Label>
                <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="e.g. A golden retriever" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Handover point</Label>
                <Input value={handover} onChange={(e) => setHandover(e.target.value)} placeholder="e.g. SRC office, JQB (default)" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Post report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Item card + claim lifecycle
// ---------------------------------------------------------------------------

function ItemCard({ item }: { item: LostFoundItem }) {
  const { userId, isDesk } = useViewer();
  const allItems = useNaflis((s) => s.lostFound);
  const isReporter = item.reporterId === userId;
  const myClaim = item.claims.find((c) => c.claimantId === userId && c.status !== "rejected");
  const approvedForMe = myClaim?.status === "approved" || myClaim?.status === "collected";
  // Clear photo only for the reporter, the desk, or the approved owner.
  const canSeePrivate = isReporter || isDesk || approvedForMe;
  const [showPrivate, setShowPrivate] = useState(false);
  const photo = canSeePrivate && showPrivate ? item.photoPrivate : item.photoPublic;

  const matches = useMemo(
    () =>
      item.kind === "lost" && isReporter
        ? allItems.filter((f) => matchScore(item, f) >= 4).sort((a, b) => matchScore(item, b) - matchScore(item, a)).slice(0, 3)
        : [],
    [item, isReporter, allItems],
  );

  return (
    <article className="flex flex-col rounded-2xl border bg-card p-4">
      <div className="flex gap-3">
        {photo ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border">
            <img src={photo} alt="" className="h-full w-full object-cover" />
            {item.photoShielded && !(canSeePrivate && showPrivate) && (
              <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[9px] font-semibold text-white">Privacy shield</span>
            )}
          </div>
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-muted">
            {item.kind === "found" ? <HandHelping className="h-6 w-6 text-muted-foreground" /> : <PackageSearch className="h-6 w-6 text-muted-foreground" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={item.kind === "found" ? "default" : "outline"}>{item.kind === "found" ? "Found" : "Lost"}</Badge>
            <span className="text-[11px] text-muted-foreground">{item.category}</span>
          </div>
          <h3 className="mt-1 font-semibold leading-snug">{item.title}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {item.location} · {fmtDate(new Date(item.date))}</p>
        </div>
      </div>

      <p className="mt-2 text-sm">{isReporter || isDesk ? item.description : item.publicDescription}</p>
      {(isReporter || isDesk) && item.maskedFindings.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-success">
          <ShieldCheck className="h-3 w-3" /> Public view hides {item.maskedFindings.join(", ")}.
        </p>
      )}
      {canSeePrivate && item.photoShielded && item.photoPrivate && (
        <button onClick={() => setShowPrivate((v) => !v)} className="mt-1 flex items-center gap-1 self-start text-[11px] text-sky-500">
          {showPrivate ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {showPrivate ? "Show public photo" : "Show original photo"}
        </button>
      )}

      {item.kind === "found" ? <ClaimPanel item={item} /> : <LostPanel item={item} matches={matches} />}
    </article>
  );
}

function Pipeline({ status }: { status: FoundStatus }) {
  const idx = CLAIM_PIPELINE.indexOf(status);
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label={`Status: ${FOUND_STATUS_LABEL[status]}`}>
      {CLAIM_PIPELINE.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center gap-1" title={FOUND_STATUS_LABEL[s]}>
          <span className={`h-1.5 w-full rounded-full ${i <= idx ? "bg-sky-500" : "bg-muted"}`} />
          <span className={`hidden text-center text-[9px] leading-tight sm:block ${i === idx ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {FOUND_STATUS_LABEL[s].replace(" · unclaimed", "")}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ClaimPanel({ item }: { item: LostFoundItem }) {
  const { userId, isDesk } = useViewer();
  const s = useNaflis();
  const status = item.status as FoundStatus;
  const isReporter = item.reporterId === userId;
  const canManage = isReporter || isDesk;
  const myClaim = item.claims.find((c) => c.claimantId === userId && c.status !== "rejected");
  const active = item.claims.find((c) => c.status !== "rejected" && c.status !== "collected") ?? item.claims.find((c) => c.status === "collected");
  const [claimOpen, setClaimOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState("");
  const [code, setCode] = useState("");

  const run = (res: { ok: boolean; message: string }) => (res.ok ? toast.success(res.message) : toast.error(res.message));
  const answerMatches =
    active?.proofAnswer && item.verificationAnswer && active.proofAnswer.trim().toLowerCase() === item.verificationAnswer.trim().toLowerCase();

  return (
    <div className="mt-auto pt-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{FOUND_STATUS_LABEL[status]}</Badge>
        {item.handoverPoint && (status === "claim_approved" || canManage) && <span className="text-[11px] text-muted-foreground">Handover: {item.handoverPoint}</span>}
      </div>
      <Pipeline status={status} />

      {/* Claimant side */}
      {!canManage && userId && status === "found" && !myClaim && (
        <Button size="sm" className="mt-3 w-full" onClick={() => setClaimOpen(true)}>This is mine</Button>
      )}
      {myClaim && !canManage && (
        <div className="mt-3 space-y-2 rounded-lg bg-muted p-2.5 text-xs">
          {myClaim.status === "pending" && <p>Claim sent. The finder will ask you to verify ownership.</p>}
          {myClaim.status === "verification_required" && (
            <>
              <p className="font-semibold">Verification: {item.verificationQuestion ?? "Describe something only the owner would know."}</p>
              {myClaim.proofAnswer ? (
                <p className="text-muted-foreground">Answer sent — waiting for the finder.</p>
              ) : (
                <div className="flex gap-2">
                  <Input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Your answer" className="h-8 text-xs" />
                  <Button size="sm" onClick={() => proof.trim() && run(s.submitClaimProof(item.id, myClaim.id, proof))}>Send</Button>
                </div>
              )}
            </>
          )}
          {myClaim.status === "approved" && (
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" /> Approved. Show code <b className="font-mono text-sm">{myClaim.collectionCode}</b> at {item.handoverPoint}.
            </p>
          )}
          {myClaim.status === "collected" && <p className="text-success">Collected. This case will be closed.</p>}
        </div>
      )}

      {/* Finder / desk side */}
      {canManage && active && (
        <div className="mt-3 space-y-2 rounded-lg border p-2.5 text-xs">
          <p><b>{active.claimantName}</b>: "{active.message}"</p>
          {status === "claim_requested" && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => run(s.requireVerification(item.id, active.id))}>Ask for proof</Button>
              <Button size="sm" variant="ghost" onClick={() => run(s.rejectClaim(item.id, active.id, "The finder declined this claim."))}>Decline</Button>
            </div>
          )}
          {status === "verification_required" && (
            <>
              <p className="text-muted-foreground">Q: {item.verificationQuestion} · expected: <b className="text-foreground">{item.verificationAnswer}</b></p>
              <p>Answer: {active.proofAnswer ? <b>{active.proofAnswer}</b> : <span className="text-muted-foreground">waiting…</span>}
                {active.proofAnswer && (answerMatches ? <span className="ml-1 text-success">✓ matches</span> : <span className="ml-1 text-warning">differs — use judgement</span>)}
              </p>
              <div className="flex gap-2">
                <Button size="sm" disabled={!active.proofAnswer} onClick={() => run(s.approveClaim(item.id, active.id))}>Approve claim</Button>
                <Button size="sm" variant="ghost" onClick={() => run(s.rejectClaim(item.id, active.id, "The proof didn't match."))}>Reject</Button>
              </div>
            </>
          )}
          {status === "claim_approved" && (
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Owner's collection code" className="h-8 font-mono text-xs uppercase" />
              <Button size="sm" onClick={() => run(s.confirmCollection(item.id, code))}>Confirm collection</Button>
            </div>
          )}
          {status === "collected" && <Button size="sm" onClick={() => run(s.closeLostFound(item.id))}>Close case</Button>}
        </div>
      )}
      {canManage && status === "found" && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => run(s.closeLostFound(item.id))}>Close listing</Button>
      )}

      {claimOpen && (
        <Dialog open onOpenChange={setClaimOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Claim "{item.title}"</DialogTitle>
              <DialogDescription>Tell the finder why it's yours. You'll then be asked a question only the owner can answer.</DialogDescription>
            </DialogHeader>
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="When and where you lost it, anything distinctive…" />
            <DialogFooter>
              <Button
                onClick={() => {
                  if (!message.trim()) return toast.error("Add a short message.");
                  run(s.requestClaim(item.id, message));
                  setClaimOpen(false);
                }}
              >
                Send claim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function LostPanel({ item, matches }: { item: LostFoundItem; matches: LostFoundItem[] }) {
  const { userId } = useViewer();
  const close = useNaflis((s) => s.closeLostFound);
  return (
    <div className="mt-auto space-y-2 pt-2">
      <Badge variant="secondary" className="capitalize">{item.status}</Badge>
      {matches.length > 0 && (
        <div className="rounded-lg bg-sky-500/5 p-2.5 text-xs">
          <p className="font-semibold">Possible matches handed in</p>
          <ul className="mt-1 space-y-0.5">
            {matches.map((m) => <li key={m.id}>• {m.title} — {m.location} ({FOUND_STATUS_LABEL[m.status as FoundStatus]})</li>)}
          </ul>
          <p className="mt-1 text-muted-foreground">Open the Found items tab and choose "This is mine" to claim.</p>
        </div>
      )}
      {item.reporterId === userId && item.status !== "closed" && (
        <Button size="sm" variant="ghost" onClick={() => { const r = close(item.id); if (r.ok) toast.success("Glad you found it!"); }}>
          Mark as recovered
        </Button>
      )}
    </div>
  );
}
