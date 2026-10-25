import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, LogIn, MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { telHref, whatsappNumber } from "@/lib/naflis/format";
import { useNaflis } from "@/lib/naflis/store";
import { revealSellerPhone, type ContactResult } from "@/services/sellerContact";

const primary =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep disabled:opacity-60";
const secondary =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-accent";

/**
 * Contact a seller (live). Signed out: sign in or register first, then come
 * back to this page. Signed in: "Contact seller" fetches the number from the
 * database (naflis_vendor_contact) and offers WhatsApp and Call.
 */
export function ContactSeller({
  vendorId,
  sellerName,
  itemTitle,
  autoReveal = false,
}: {
  vendorId: string;
  sellerName: string;
  itemTitle: string;
  /** Reveal at once (the person already tapped "Contact seller" to get here). */
  autoReveal?: boolean;
}) {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const navigate = useNavigate();
  const href = useRouterState({ select: (r) => r.location.href });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContactResult | null>(null);

  const reveal = async () => {
    setBusy(true);
    setResult(await revealSellerPhone(vendorId));
    setBusy(false);
  };

  useEffect(() => {
    if (autoReveal && signedIn && !result) void reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when shown signed in
  }, [autoReveal, signedIn, vendorId]);

  if (!signedIn || (result && !result.ok && result.reason === "sign_in")) {
    return (
      <button
        type="button"
        className={primary}
        onClick={() => navigate({ to: "/login", search: { redirect: href } })}
      >
        <LogIn className="h-4 w-4" strokeWidth={1.8} /> Sign in to contact seller
      </button>
    );
  }

  if (!result) {
    return (
      <button type="button" className={primary} onClick={reveal} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
        )}
        Contact seller
      </button>
    );
  }

  if (!result.ok) {
    return (
      <p role="status" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        {result.message}
      </p>
    );
  }

  const tel = telHref(result.phone);
  const wa = whatsappNumber(result.phone);
  if (!tel) {
    return (
      <p role="status" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        {sellerName || "This seller"} hasn&apos;t added a phone number yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {wa && (
        <a
          className={primary}
          href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I saw ${itemTitle} on NAFLIS Mall.`)}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.8} /> WhatsApp
        </a>
      )}
      <a className={secondary} href={tel}>
        <Phone className="h-4 w-4 text-link" strokeWidth={1.8} /> Call {result.phone}
      </a>
    </div>
  );
}
