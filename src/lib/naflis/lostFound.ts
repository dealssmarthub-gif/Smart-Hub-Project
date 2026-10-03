// ============================================================================
// LOST & FOUND — report types and the claim lifecycle.
// Found item: found → claim_requested → verification_required → claim_approved
//             → collected → closed   (a failed verification returns it to found)
// Lost report: open → matched → closed
// ============================================================================

export const LF_CATEGORIES = [
  "ID / Student card",
  "Bank card",
  "Passport",
  "Wallet / Purse",
  "Phone",
  "Laptop / Tablet",
  "Keys",
  "Bag",
  "Books / Notes",
  "Clothing",
  "Jewellery / Watch",
  "Other",
] as const;

export type FoundStatus = "found" | "claim_requested" | "verification_required" | "claim_approved" | "collected" | "closed";
export type LostStatus = "open" | "matched" | "closed";

/** Who acts: the finder, the person claiming, or the campus Lost & Found desk (SRC / admin). */
export type LfActor = "finder" | "claimant" | "desk";

interface Step {
  to: FoundStatus;
  actors: LfActor[];
  label: string;
}

export const CLAIM_TRANSITIONS: Record<FoundStatus, Step[]> = {
  found: [
    { to: "claim_requested", actors: ["claimant"], label: "Request claim" },
    { to: "closed", actors: ["finder", "desk"], label: "Close listing" },
  ],
  claim_requested: [
    { to: "verification_required", actors: ["finder", "desk"], label: "Ask for proof of ownership" },
    { to: "found", actors: ["finder", "desk"], label: "Decline claim" },
  ],
  verification_required: [
    { to: "claim_approved", actors: ["finder", "desk"], label: "Approve claim" },
    { to: "found", actors: ["finder", "desk"], label: "Reject — proof didn't match" },
  ],
  claim_approved: [
    { to: "collected", actors: ["finder", "desk"], label: "Confirm collection" },
    { to: "found", actors: ["desk"], label: "Revoke approval" },
  ],
  collected: [{ to: "closed", actors: ["finder", "claimant", "desk"], label: "Close case" }],
  closed: [],
};

export const FOUND_STATUS_LABEL: Record<FoundStatus, string> = {
  found: "Found · unclaimed",
  claim_requested: "Claim requested",
  verification_required: "Verification required",
  claim_approved: "Claim approved",
  collected: "Collected",
  closed: "Closed",
};

export const CLAIM_PIPELINE: FoundStatus[] = ["found", "claim_requested", "verification_required", "claim_approved", "collected", "closed"];

export function canClaimTransition(from: FoundStatus, to: FoundStatus, actor: LfActor): boolean {
  return CLAIM_TRANSITIONS[from].some((s) => s.to === to && s.actors.includes(actor));
}

export interface LfClaim {
  id: string;
  claimantId: string;
  claimantName: string;
  /** Why they think it's theirs (claimant-written, shown to finder/desk only). */
  message: string;
  /** Answer to the finder's private verification question. */
  proofAnswer?: string;
  status: "pending" | "verification_required" | "approved" | "rejected" | "collected";
  /** Shown to the approved claimant; the finder/desk enters it at handover. */
  collectionCode?: string;
  createdAt: number;
}

export interface LfEvent {
  at: number;
  status: string;
  note: string;
  actor: LfActor | "system";
}

export interface LostFoundItem {
  id: string;
  kind: "lost" | "found";
  title: string;
  category: (typeof LF_CATEGORIES)[number];
  /** Raw text — visible to the reporter (and the desk) only. */
  description: string;
  /** Privacy-shielded text for public view. */
  publicDescription: string;
  /** What the shield caught, for the reporter's reassurance. */
  maskedFindings: string[];
  photoPrivate?: string;
  photoPublic?: string;
  photoShielded: boolean;
  campus: string;
  location: string;
  /** When it was lost / found (YYYY-MM-DD). */
  date: string;
  reporterId: string;
  reporterName: string;
  /** Found items: a question only the owner can answer. Never shown publicly. */
  verificationQuestion?: string;
  verificationAnswer?: string;
  /** Where the item can be collected, e.g. "Balme Library front desk". */
  handoverPoint?: string;
  status: FoundStatus | LostStatus;
  claims: LfClaim[];
  /** Lost report ↔ found item link once matched. */
  matchedWith?: string;
  timeline: LfEvent[];
  createdAt: number;
}

/** Simple relevance score between a lost report and a found item. */
export function matchScore(lost: LostFoundItem, found: LostFoundItem): number {
  if (lost.kind !== "lost" || found.kind !== "found" || found.status === "closed") return 0;
  let score = 0;
  if (lost.category === found.category) score += 3;
  if (lost.campus === found.campus) score += 2;
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const a = words(`${lost.title} ${lost.publicDescription}`);
  for (const w of words(`${found.title} ${found.publicDescription}`)) if (a.has(w)) score += 1;
  const days = Math.abs(new Date(found.date).getTime() - new Date(lost.date).getTime()) / 86_400_000;
  if (days <= 3) score += 1;
  return score;
}

/** 6-character collection code from a CSPRNG, avoiding look-alike characters. */
export function collectionCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
