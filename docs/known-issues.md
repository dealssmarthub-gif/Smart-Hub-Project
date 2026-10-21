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
| 11 | ✅ Fixed (live-mode Phase 3). Landing products when loaded from Supabase | old price, "High Campus Demand", flash sale | `originalPrice = price × 1.25`, `demand: 85` and an 8-hour flash sale are set in code for every product (`src/routes/index.tsx`, `fetchApprovedProducts`). |
| 12 | Group-buy "spots left" | e.g. "1 spot left" | Seed listings have fixed joined/target counts; nothing closes or fills over time. |

> **Prices must come from real data.** Rows 8 and 11 are invented pricing/savings logic. They are left exactly as they are during the redesign; the agreed follow-up is to show **real original prices only** (no computed "old price", no multiplied savings) — to be fixed in a later, separate change.

| # | Where | Value | Why it looks off |
|---|---|---|---|
| 15 | Group-buy cards on `/student-os/deals` | struck-through old price | Shown whenever `originalPrice` exists, without checking it is higher than the price (the marketplace and Home cards do check). Seed data happens to be consistent today. |
| 16 | Brand voucher cards | "Verified" badge on every voucher | Hard-coded on all four static vouchers; nothing is verified per voucher. The vouchers, codes and validity text are static data in `student-os.deals.tsx`. |

## Broken content

### 13. Broken seed image (HTTP 404)
- **URL:** `https://images.unsplash.com/photo-1585659722983-3a681d0e1e2f?w=800&q=80` (`IMG.microwave` in `src/lib/naflis/store.ts`).
- **Used by:** "Bruhm Microwave Oven" (mall product) and "Group Buy: Hostel Induction Cooker + 3-Piece Non-Stick Cooking Pots" (student listing).
- **Effect:** before the redesign the browser showed the image's alt text over a blank box; now the card shows a neutral placeholder. Replace the URL in the seed data to fix.
- **Second broken image (found in Phase 3):** `https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=800&q=80` (HTTP 404), used by the "Spotify Premium Student" brand voucher in `src/routes/student-os.deals.tsx` (`STATIC_STUDENT_DISCOUNTS`). Shows the neutral placeholder.

## Found in Phase 3 (Shop)

### 17. ✅ Fixed (live-mode Phase 3) — Contact falls back to a placeholder phone number
- **Fix:** the fallback number is gone. **Contact seller** shows only when the listing has a phone (in live mode, the vendor's `contact_phone`); WhatsApp links turn local numbers (024…) into 233…. The original report follows.
- **Where:** marketplace **Contact** dialog (`/student-os/marketplace`).
- **What happens:** when a listing has no `sellerPhone`, the WhatsApp link goes to `233240000000` and the call button to `+233 24 000 0000`, numbers that belong to nobody in the app.
- **Reproduce:** Demo Student → **Sell an item** without a phone number → marketplace → **Contact** on that listing → the dialog offers "Call +233 24 000 0000".

### 18. "Copy Code" always reports success
- **Where:** brand voucher cards on `/student-os/deals`.
- **What happens:** `navigator.clipboard.writeText` is not awaited or checked, so the "Copied promo code" toast shows even when the browser refuses clipboard access (plain `http://` on a non-localhost address, or clipboard permission denied) and nothing was copied.
- **Reproduce:** open the site over a LAN address (`http://192.168.x.x:…`) → Discounts → **Copy Code** → the toast says copied, the clipboard is unchanged.

### 19. "Verify to Unlock All Deals" doesn't lock anything
- **Where:** `/student-os/deals` header.
- **What happens:** unverified students can already join pools and copy every code; verification only changes the badge.

### 20. Two different "Escrow Buy" messages
- **Where:** the marketplace says "Escrow hold secured … Meetup verification code sent!"; the student Home says "Escrow order created … Meetup code generated." Neither creates anything (see #3).

## Found in Phase 4 (Campus)

### 21. "Download PDF" on the Resource Hub doesn't download a file
- **Live mode (Phase 3):** fixed. The Resource Hub lists published `campus_resources` and **Download** opens the uploaded file and counts it (`naflis_count_download`). Demo mode is unchanged.
- **Where:** `/student-os/resources` → **Download PDF** and, in **Preview**, **Download Full Document**.
- **What happens:** the download count goes up and a toast says "File saved to your downloads", but no file is downloaded; resources have no file attached.
- **Reproduce:** Demo Student → Resources → **Download PDF** → the count increases, the browser downloads nothing.

### 22. "Upload Material" takes no file
- **Live mode (Phase 3):** the button is hidden; resources are published from the SRC portal with their file (required in live mode). Demo mode is unchanged.
- **Where:** `/student-os/resources` → **Upload Material**.
- **What happens:** the form has title, type, course code, campus and description but no file field. Publishing creates a resource with a stock photo, seller "Campus Contributor" and a fixed seller id (`u_student`) regardless of who is signed in.

### 23. Every resource claims to be verified
- **Live mode (Phase 3):** no verification claims are shown. Demo mode is unchanged.
- **Where:** resource rows ("Verified Exam Pack") and Preview ("✓ Full questions & marking scheme verified by peer study group", "✓ Step-by-step calculation breakdowns included").
- **What happens:** the same claims are shown for every resource, including ones just uploaded through the form above.

### 24. SRC notices are not on the Events page
- **Where:** `/student-os/events` filters out announcements (`kind !== "announcement"`).
- **What happens:** students read SRC notices only in the landing-page ticker, the Calendar (as pinned events), and, since this redesign, the notice cards on the student Home and the Resource Hub (these open the same notice dialog as the landing page).

### 25. "How to apply" on Opportunities only shows a message
- **Where:** opportunity cards without an `applyUrl` → **How to apply**.
- **What happens:** a toast says "Apply through <organisation>'s careers page." with no link.

### 26. Ticket buttons are disabled for guests with no explanation
- **Where:** `/student-os/events` → event cards.
- **What happens:** when signed out, the **Buy / Get ticket** button is greyed out without saying that signing in is required.

### 27. Lost & Found claim panel re-renders on any store change
- **Where:** `ClaimPanel` in `student-os.lost-found.tsx` calls `useNaflis()` with no selector, so every card re-renders whenever anything in the app store changes. A performance note only; behaviour is correct.

## Found in Phase 5 (Me, wallet/orders, staff and auth pages)

### 28. ✅ Fixed in Phase 6 — Orders page and every order detail page crash ("This page didn't load")
- **Fix:** commit "fix: stop infinite render loop on buyer orders and alerts pages" (`useShallow` selector; the orders route now renders the order page through an `<Outlet />` when one is open). Regression test: `tests/buyer-pages-render.test.ts`. The original report follows.
- **Where:** `/buyer/orders` and `/buyer/orders/<id>` (same on `main`).
- **Reproduce:** sign in with **Demo Buyer** → open **Me → Orders & escrow** (or **Track order** on the Me active-order card).
- **What happens:** the error screen appears; the console shows "The result of getSnapshot should be cached" then "Maximum update depth exceeded".
- **Cause:** `buyer.orders.tsx` selects `s.orders.filter(...)` inside `useNaflis`, which returns a new array on every read (zustand 5 loops on this). `buyer.orders.tsx` is also the *parent* route of `buyer.orders.$orderId.tsx`, so the detail page crashes too, and it has no `<Outlet />`, so the detail page would not render even without the crash.
- **Knock-on:** the order page's **Confirm delivery & release escrow** and the demo **Simulate next status** button can't be reached, so an order can't be moved to "Delivered" from the buyer UI.

### 29. ✅ Fixed in Phase 6 — Alerts page uses the same crashing selector
- **Where:** `/buyer/notifications` selects `s.notifications.filter(...)` in `useNaflis` (same pattern as #28). Reproduce: Demo Buyer → **Me → Alerts**.

### 30. No buyer-side "Open a dispute" action
- **Where:** buyer order pages. The order machine allows the buyer to move an order to `disputed`, and the store has `openDispute`, but the only button that calls it is the staff "Seed a demo dispute" panel on `/dispute`. The Me active-order card therefore shows no dispute option (none was invented).

### 31. Wallet buttons that do nothing
- **Where:** `/buyer/wallet` → **Withdraw**, **Send**, **Freeze wallet** and **Link another method**.
- **What happens:** nothing (no handler). Kept as they were; the Me wallet card shows **Top up** only.

### 32. Order numbers can be very short
- **Where:** Me active-order card, order list. `Order #{id.slice(2, 10)}` shows e.g. "#id1n" for locally created orders, whose ids are short.

### 33. Expensive first cart item blocks wallet checkout
- **Where:** `/buyer` → first **Add to cart** is the iPhone 16 Pro Max (GH₵18,500) while the demo wallet holds GH₵4,200, so **Pay** with the wallet is disabled ("Short by … top up first"). Not a bug as such, but the demo flow needs Mobile Money/Card (simulated in demo mode) to place an order.

## Found in Phase 6 (final QA) — all also present on `main`

### 34. Mall product, Reserve & Pay and Installments scroll sideways at tablet width
- **Where:** `/buyer/product/<id>` (page 873–877px wide), `/buyer/reserve` and `/buyer/installments` (780px) at a 768px window. The mall sidebar appears from 768px and the page content is laid out for a wider area.
- **Reproduce:** Demo Buyer → open any mall product → resize the window to 768px → the page scrolls horizontally; the "Flash sale" badge and the old price sit off the right edge.

### 35. Product page action buttons overlap
- **Where:** `/buyer/product/<id>` → the row under **Buy now / Add to cart** (**Wishlist**, **Price alert**, **Ask**, **Share**) when the content column is narrow (e.g. 768px window). Labels and icons draw over each other because the row doesn't wrap.

### 36. Mall product cards cut off prices on phones
- **Where:** `/buyer`, `/buyer/deals`, `/buyer/search` product grid at 360–390px: the struck-through old price (and at 768px, some prices and the **View** button) run past the card edge.

### 37. Dark theme logs a hydration warning on every page
- **Where:** every route, dark theme only. The server renders the light theme, then the browser switches to dark before React hydrates, so React warns "A tree hydrated but some attributes of the server rendered HTML didn't match". No visible effect.

### 38. Accessibility gaps found by axe-core
- Switches without a name: wallet **Auto-funding** (`/buyer/wallet`) and every feature-flag switch on `/super`.
- Icon-only delete button on SRC notice cards (`/campus-admin`) has no accessible name.
- Catalog bars on `/admin` are `progressbar`s without a name.
- Order page totals (`/buyer/orders/<id>`) use `<dt>/<dd>` without a `<dl>`.

### 39. Mall sidebar Alerts badge counts every account's notifications
- **Where:** `BuyerShell` counts `notifications.filter((n) => !n.read)` without filtering by the signed-in user, so the sidebar can say 12 while the bell (which filters by user) says 8.

### 40. No demo account reaches Finance, Dispute or Delivery
- **Where:** `/finance`, `/dispute`, `/delivery`. The five demo buttons don't hold these roles and **View as** only offers buyer, student and SRC accounts, so these dashboards can only be opened with real staff accounts (or by editing the local demo store, which is how Phase 6 checked their layout).

## Found during security hardening

### 41. Student listings are never saved to Supabase
- **Where:** `src/components/naflis/ListStudentItemModal.tsx`, `handleSubmit` → `supabase.from("products").insert(...)`.
- **What happens:** the insert sends no `vendor_id`, but `products.vendor_id` is NOT NULL and the INSERT policy requires the caller to own that vendor. The insert always fails. The code doesn't check the returned `{ error }` (the `try/catch` only catches thrown errors), so the failure is silent: the listing appears in the local store only and is gone on another device.
- **Also:** a student usually has no `vendors` row, so a fix needs to decide which vendor a student listing belongs to (create one on first listing, or a separate table).
- **Reproduce:** with Supabase configured, sign in as a real (non-demo) user → **Sell an item** → submit → the toast says posted, `select count(*) from products` is unchanged, and the network tab shows the insert returning an error.
- **Status:** ✅ fixed in live-mode Phase 3 (migration `20261021120000_student_listings_and_vendor_admin`, `src/services/studentListings.ts`). A listing is a `products` row with `listing_type = 'student'`; the seller's first listing creates their vendor (pending), and the listing is public once an admin approves the vendor (Super Admin → Vendors). Insert errors are now shown to the user. Checks: `supabase/tests/student_listings.test.sql`.

## Code health (pre-existing)

### 14. Lint baseline
- `npm run lint` already reports many errors in untouched files (mostly Prettier formatting and `@typescript-eslint/no-explicit-any`).
- Phase 6 measurement (`eslint src tests supabase`, both checkouts with LF line endings): `main` 2,863 errors / 14 warnings; branch 3,188 errors / 21 warnings before the Phase 6 clean-up. After formatting every file the redesign created or that was Prettier-clean on `main`, and typing the new test, the redesign-owned files have **0 errors**; the remainder are formatting differences inside lines the redesign touched in files that were already unformatted on `main` (reformatting those would rewrite unrelated lines), plus 7 React "fast refresh" warnings from files that export a hook or constant next to components — the same pattern the project already uses.
- On a Windows checkout with `core.autocrlf=true` the Prettier count is inflated (every CRLF line ending is reported); compare on LF checkouts.
