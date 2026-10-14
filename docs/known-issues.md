# Known issues (found during the redesign, intentionally not fixed)

The redesign changes presentation and navigation only. Behaviour and data issues found along the way are recorded here instead of being fixed. Each entry says where it is and how to reproduce it.

## Behaviour

### 1. Demo sign-in sometimes signs straight back out (Supabase configured)
- **Where:** `src/routes/login.tsx` (`handleDemoLogin`) and the auth listener in `src/routes/__root.tsx`.
- **What happens:** the demo button first calls `supabase.auth.signOut()`, then signs in the demo persona locally. The sign-out fires a `SIGNED_OUT` auth event a moment later; the root listener answers it with `syncUser(null)`, which can clear the demo account that was just set.
- **Reproduce:** run with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set → open `/login` → click **Demo Student** (repeat a few times). Sometimes you land signed in; sometimes the header still shows **Sign in** and guarded pages send you back to `/login`.
- **Not affected:** demo mode (Supabase variables empty) — sign-in always sticks.

### 2. Guarded pages redirect to `/login` on a full page load, even when signed in
- **Where:** route guards in `beforeLoad` (`buyer.tsx`, `campus-admin.tsx`, `admin.tsx`, `finance.tsx`, `dispute.tsx`, `delivery.tsx`, `super.tsx`, `seller.tsx`). They read the browser-only store, which is empty during the server render.
- **Reproduce:** sign in with **Demo Buyer** → type `/buyer/wallet` in the address bar (or press reload on it) → you are sent to `/login?redirect=/buyer/wallet`. Clicking **Continue** there opens the page. Navigating to the same page by clicking links works.

### 3. "Escrow Buy" on campus listings only shows a message
- **Where:** `/student-os/marketplace` and the student Home (`/student-os`) listing cards.
- **What happens:** the button shows "Escrow order created … Meetup code generated." but no order, hold or code is created.
- **Reproduce:** Demo Student → `/student-os/marketplace` → **Escrow Buy** on any card → `/buyer/orders` has no new order.

### 4. "Download" in the student Home's study-materials block only shows a message
- **Where:** `/student-os` → *Top Study Materials & Past Exams*.
- **What happens:** shows "Downloaded: …" without downloading a file. The Resource Hub page (`/student-os/resources`) has the real download.
- **Reproduce:** Demo Student → `/student-os` → **Download** on any row → no file is saved.

### 5. Escrow copy describes a flow the app doesn't have
- **Where:** landing escrow section and escrow modal, student Home escrow banner.
- **What happens:** the text promises a buyer-side "6-digit PIN release" and "cancel instantly for full automatic refund". No such buyer action exists (see the Phase 0 audit, §6).

### 6. Two campus selectors behave differently
- **Where:** the landing hero's campus dropdown and "Popular Campuses" chips call `setSelectedCampus` directly; the header campus pill (and the old Student OS bar) call `requestCampusSwitch`, which can show the "Switch to …?" prompt.
- **Reproduce:** on `/`, change the campus in the hero search → it switches immediately. Change it in the header pill → you may get a confirmation prompt.

### 7. "Back to <campus>?" prompt on every visit to Student OS
- **Where:** `useSuggestRegisteredCampus` (previously inside `CampusContextBar`).
- **What happens:** a verified student browsing another campus (or All Campuses) is asked to switch back each time Student OS mounts, unless they pick a campus. Possibly intended; recorded because it appears on almost every visit with the demo student.
- **Reproduce:** Demo Student → `/student-os` → the prompt appears; click **Not now** → reload → it appears again.

## Data and numbers (placeholder-looking, left as they are)

| # | Where | Value | Why it looks off |
|---|---|---|---|
| 8 | Landing metrics, "Student savings" | e.g. GH₵453,750 | Computed as `(originalPrice − price) × 15` for every product — the ×15 is invented. |
| 9 | Landing metrics, "Protected in escrow" | GH₵0 in a fresh browser | Sums orders in this browser's local demo store, not real held funds. |
| 10 | Landing metrics, "Active shoppers", "Verified sellers", "Requested items" | 7, 2, 7.2K | Counted from local seed data, not the backend. |
| 11 | Landing products when loaded from Supabase | old price, "High Campus Demand", flash sale | `originalPrice = price × 1.25`, `demand: 85` and an 8-hour flash sale are set in code for every product (`src/routes/index.tsx`, `fetchApprovedProducts`). |
| 12 | Group-buy "spots left" | e.g. "1 spot left" | Seed listings have fixed joined/target counts; nothing closes or fills over time. |

## Broken content

### 13. Broken seed image (HTTP 404)
- **URL:** `https://images.unsplash.com/photo-1585659722983-3a681d0e1e2f?w=800&q=80` (`IMG.microwave` in `src/lib/naflis/store.ts`).
- **Used by:** "Bruhm Microwave Oven" (mall product) and "Group Buy: Hostel Induction Cooker + 3-Piece Non-Stick Cooking Pots" (student listing).
- **Effect:** before the redesign the browser showed the image's alt text over a blank box; now the card shows a neutral placeholder. Replace the URL in the seed data to fix.

## Code health (pre-existing)

### 14. Lint baseline
- `npm run lint` already reports many errors in untouched files (mostly `@typescript-eslint/no-explicit-any` and Prettier formatting). New redesign files add none beyond React "fast refresh" warnings of the same kind the project already has.
