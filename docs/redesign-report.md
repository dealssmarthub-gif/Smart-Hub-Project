# NAFLIS Discount Mall — UI redesign report

Branch `redesign/friendly-ui`, based on `main`. Nothing has been pushed, merged or deployed.
The payments branch (`feat/payments-delivery-settlement`) was not touched.

| Commit | What |
|---|---|
| `3d45899` | docs: redesign audit (Phase 0) |
| `6861a06` | Phase 1: design tokens, Plus Jakarta Sans, shared app shell |
| `76fbe27` | Phase 2: Home (guest landing and student hub) |
| `a165116` | Phase 3: Shop (campus marketplace and deals) |
| `eefa0b1` | Phase 4: Campus (resources, calendar, events, opportunities, lost & found) |
| `e93006d` | Phase 5: Me, buyer pages, staff and auth pages, accent → tokens |
| `7940f2d` | fix: stop infinite render loop on buyer orders and alerts pages |
| `566f7c4` | Phase 6 QA fixes for redesign regressions |
| *(this commit)* | docs: this report |

Screenshots for every phase are in `docs/redesign-shots/phase-1` … `phase-6` (kept out of git).

---

## 1. What each phase did

**Phase 0 — Audit.** `docs/redesign-audit.md`: stack, every route by role, shared components, features per page, the "must still work" checklist, gaps between the design spec and the code, odd data.

**Phase 1 — Foundation.** Design tokens in `src/styles.css` (light and dark, ≥ 4.5:1 text contrast), Plus Jakarta Sans, 44px targets and visible focus. A shared shell (`src/components/naflis/shell/`) with the four places — **Home, Shop, Campus, Me** — as a desktop top nav and a floating phone tab bar, a campus picker, an account menu (with role-based **Dashboard** links for staff), and a site footer. `/me` added as the account hub that lists every destination the old mobile "More" sheet and sidebars offered. Student OS and the mall shell were moved onto it; `MobileBottomNav.tsx` is kept but no longer mounted.

**Phase 2 — Home.** New guest landing (`/`) and student hub (`/student-os`): greeting header, search, quick-access tiles, escrow banner, "Almost full" group buys (sorted by fewest spots left, no invented closing times), SRC notice row (opens the notice dialog), feed and study materials. The Home tab goes to `/` for guests and `/student-os` for signed-in students. All original sections and copy kept.

**Phase 3 — Shop.** One Shop header with segmented tabs (**Marketplace / Group buys / Discounts**, via `?view=` on the deals page), a **NAFLIS Mall** entry and a **Sell an item** button (floating on phones). Marketplace filters (campus, condition, sort) move into a filter sheet on phones and stay inline on desktop; every filter, chip and listing action is kept. Listing images fall back to a neutral placeholder only when missing or broken.

**Phase 4 — Campus.** A shared Campus pill row and page header across Resources, Calendar, Events & Tickets, Opportunities and Lost & Found. The Campus tab lands on the Resource Hub, which now also carries the "Around campus" tiles and the SRC notices row. No change to download, ticket, posting or reporting behaviour.

**Phase 5 — Me, buyer, staff and auth pages.** `/me` becomes a dashboard: profile (name, verified badge, campus), real wallet balance with **Top up** only, the buyer's real active order with its real status and actions, and an empty state that links to Shop. The interim sky-blue accent (≈ 180 hard-coded classes) is replaced by theme tokens everywhere; the shadcn primitives (button, input, select, textarea, card, tabs) get the new radii and 44px heights; the staff shell, SRC portal, login and invite pages are restyled. Contrast fixed for white text on the violet gradient.

**Phase 6 — Final QA.** The orders/alerts crash (#28/#29) fixed in its own commit with a regression test. Full route sweep, checklist walk with every demo account, keyboard and axe-core accessibility checks, bundle-size comparison and dead-code list (below). Regressions the redesign introduced were fixed in `566f7c4`; everything else is recorded in `docs/known-issues.md`.

---

## 2. Phase 6 results

### Build, types, lint and tests

| Check | Result |
|---|---|
| `npx vite build` | passes |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 7 files, 59 tests pass (2 new: `tests/buyer-pages-render.test.ts`) |
| Lint (`eslint src tests supabase`, LF checkouts) | `main` 2,863 errors / 14 warnings. Files the redesign created: 0 errors after formatting. Remaining differences are Prettier formatting inside touched lines of files that were already unformatted on `main`, and 7 React fast-refresh warnings (hook or constant exported next to components — an existing project pattern). Details in known issue #14. |

### Crash fix (#28/#29)
`/buyer/orders`, `/buyer/orders/<id>` and `/buyer/notifications` now render. The order page shows **Confirm delivery & release escrow** once an order is delivered; in demo mode an order can be advanced with **Simulate next status**, and confirming from the order page or from **I've received my order** on `/me` moves it to Completed. Screenshots: `docs/redesign-shots/phase-6/p6-orders-*`, `p6-order-detail-paid-*`, `p6-order-detail-delivered-*`, `p6-me-delivered-*`, `p6-alerts-*`.

### Route sweep
Every route in the audit (except the three that only exist on the payments branch: `/pay/$token`, `/receipt/$reference`, `/courier-invite`) plus `/me`, at **360, 390, 768 and 1280px**, in **light and dark**, signed in with the matching demo account: 42 routes × 2 themes × 4 widths. `/finance`, `/dispute` and `/delivery` have no demo account (#40); their layout was checked by pointing the local demo store at the seeded staff users.

| Check | Branch | `main` |
|---|---|---|
| Horizontal scroll | Mall product (768px), Reserve & Pay (768px), Installments (768px) — same as `main` (#34) | Same three, plus every Student OS page and the SRC portal at 768px (fixed by the redesign) |
| Text clipped / off-screen | Mall product-card prices at 360–768px — same as `main` (#36). All other "clipped" hits are screen-reader-only labels. | Same |
| Hidden behind the phone tab bar | none | n/a (no tab bar) |
| Console errors | Dark-theme hydration warning on every page — same as `main` (#37). No new errors. | Same, plus the orders/alerts infinite-loop errors (now fixed) |

During QA a 500 appeared once on the first load of `/student-os/marketplace`; it came from two dev servers sharing the `node_modules/.vite` cache and did not reproduce on a clean server.

### Accessibility
- **Keyboard:** the top nav, tab bar, filter sheet and dialogs are reachable in a sensible order with a visible focus ring. Dialogs trap focus and close on Escape. *Fixed in Phase 6:* focus now returns to the button that opened a dialog (it used to fall to the page body), and dialog/sheet close buttons are 44px (were 16px).
- **Touch targets:** every redesign control is ≥ 44px. *Fixed:* compact logo (32px wide), Me "Details" link, footer links. Remaining small controls are pre-existing (wallet auto-funding switch 36×20).
- **Icon-only buttons:** all redesign icon buttons have labels. Pre-existing unnamed controls are listed in #38.
- **axe-core 4.10 (WCAG 2.1 A/AA)** on `/`, `/login`, `/student-os`, marketplace, resources, `/me`, `/buyer`, wallet, checkout, an order page, `/campus-admin`, `/admin`, `/super`, both themes:
  - Branch: 0 contrast failures (`main` has dozens of 2.5–4.1:1 sky-blue texts and buttons); 0 unlabelled selects (`main` has 4). *Fixed in Phase 6:* the SRC "Pinned" badge (white on amber, 2.1:1).
  - Remaining, all pre-existing: switches without names (wallet, `/super`), unnamed delete button on SRC notice cards, unnamed progress bars on `/admin`, `<dt>/<dd>` without `<dl>` on the order page (#38).

### Bundle size and font (report only)

| | `main` | branch | change |
|---|---|---|---|
| Client JS (gzip) | 467.0 KB (107 files) | 537.8 KB (118 files) | +70.8 KB |
| CSS (gzip) | 16.5 KB | 17.5 KB | +1.0 KB |
| **JS + CSS (gzip)** | **483.5 KB** | **555.3 KB** | **+14.9 %** |

Most of the increase sits in the shared chunk (`store.js` 30 → 81 KB gzip): the new shell, mounted on every page, brings the account menu, notification bell, campus picker and the dialog/dropdown primitives into the common chunk instead of per-page chunks. New code itself is small (AppShell 3.7 KB, Me 3.3 KB, CampusPicker 3.1 KB, HomeBlocks 2.6 KB, CampusBlocks 1.6 KB gzip). Not optimised, as agreed.

Font: Plus Jakarta Sans from Google Fonts, **5 weights (400–800)** (main loaded Inter at 6), `display=swap`, with `preconnect` to both Google Fonts hosts.

### Unused files (nothing deleted)
- `src/components/naflis/MobileBottomNav.tsx` — no longer mounted (kept on purpose).
- `src/components/ui/accordion.tsx` — only `main`'s landing page imported it, and never rendered it.
- `CampusContextBar` export in `src/components/naflis/CampusContext.tsx` — replaced by `CampusPicker`; the file's other exports are used.
- Already unused on `main`: `src/components/naflis/RolePreview.tsx` and the shadcn primitives `alert`, `aspect-ratio`, `avatar`, `breadcrumb`, `calendar`, `carousel`, `chart`, `collapsible`, `command`, `context-menu`, `drawer`, `form`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `popover`, `resizable`, `scroll-area`, `sidebar`, `table`, `toggle-group`. `src/services/intelligenceService.ts` is imported only by tests.

---

## 3. Feature-preservation matrix

Walked through the real UI with each demo account (scripted clicks against the demo-mode dev server, then checked against the same walk on `main`).
**works** = exercised and behaves as on `main` · **unchanged** = same behaviour, including a known limitation · **changed** = works, but reached or shown differently · **could not verify** = not exercisable in demo mode / headless.

### Guest
| Item | Status |
|---|---|
| Guarded routes redirect to `/login?redirect=…` | works |
| Landing SRC ticker, previous/next | works (1/4 → 2/4 → 1/4) |
| Safe Escrow modal | changed — the top-nav item is now **How escrow works** (opens the same modal); the landing escrow section is still at `#escrow` |
| Landing CTAs, footer links | changed — new hero layout and footer; every original destination is still linked |
| Landing metrics | unchanged — same values (placeholder numbers, #8–#11) |
| Theme toggle (light/dark/system) | works |

### Demo Student
| Item | Status |
|---|---|
| Demo sign-in | works |
| Campus selector + "Switch to …?" prompt changes results | changed — header campus pill (same `requestCampusSwitch` + prompt); the location button is next to it |
| Marketplace search, campus, condition, sort, category chips, reset | changed — on phones campus/condition/sort are in a **Filters** sheet; inline on desktop |
| Contact modal | works |
| Escrow Buy | unchanged — still a message only (#3, #20) |
| List item | changed — button reads **Sell an item** (floating on phones); same modal |
| Deals: All / Group / Vouchers | changed — Shop tabs **Group buys / Discounts** (`?view=`), and the original chips remain on the page |
| Join group buy | works |
| Copy voucher code | unchanged — toast shows even when the clipboard refuses (#18) |
| Verify-student gate on deals | unchanged — gates nothing (#19) |
| Resources: search, type chips, Preview | works |
| Resources: Download (+count) | unchanged — count and toast, no file (#21) |
| Resources: Upload with validation | works — empty title is blocked; form still has no file (#22) |
| Calendar: views, prev/next/Today, type toggles, filter | works |
| Events: buy ticket, ticket QR | works (ticket appears under My tickets with QR) |
| Opportunities: filter, search, save, How to apply, reset | works (How to apply is a message only, #25) |
| Lost & Found: report lost / report found | works |
| Lost & Found: "This is mine" | works (button present on another user's found item and responds; the rest of the claim needs a second account, below) |
| Lost & Found: proof Q&A, approve/decline, collection code, close | could not verify — needs a second student account; Demo Buyer and Demo Student are the same user |
| Verify Student ID modal | works |
| List Student Item modal | works |
| Workspace switcher | changed — in the account menu (desktop) and **Me → Workspaces & access** (phone) instead of the header switcher and More sheet |
| Join Student OS | could not verify — every demo account that reaches it already holds the Student role |
| Sign out | changed — account menu (desktop) and **Me → Sign out** (phone) |
| Phone tab bar Home / Shop / Campus / Me | works (`/student-os`, marketplace, resources, `/me`) |

### Demo Buyer
| Item | Status |
|---|---|
| Demo sign-in | works |
| Header search → `/buyer/search` | works |
| Cart badge | works |
| Wishlist | works |
| Checkout (promo, delivery, payment method) | works — demo payment is simulated; the wallet can't cover the first cart item (#33), so the walk used Mobile Money |
| Orders list, order page, timeline | works (fixed in Phase 6, #28) |
| Confirm delivery & release escrow | works — order page and **I've received my order** on `/me` |
| Buyer dispute | could not verify — no buyer dispute action exists on `main` (#30) |
| Wallet top-up (Add money) | works (GH₵4,200 → GH₵4,400) |
| Withdraw / Send / Freeze / Link method | unchanged — no handler (#31) |
| Reserve & Pay, Installments | unchanged — pages load; plans not exercised end to end; overflow at 768px as on `main` (#34) |
| Messages | works (loads) |
| Notifications / Alerts | works (fixed in Phase 6, #29) |
| `/me` active order and empty state | new — real latest unfinished order, real status, Track order, Message seller; empty state links to Shop |
| `/seller`, `/seller/*` | unchanged — redirect to `/buyer` |

### Demo SRC (UG)
| Item | Status |
|---|---|
| Demo sign-in, `/campus-admin`, `/campus-admin/dashboard` | works |
| Tabs: Announcements, Slides, Events & Tickets, Check-in, Intelligence | works (tab row scrolls on narrow screens) |
| Publish Announcement / Upload Lecture Slides forms | works (forms open); submitting was not exercised |
| QR gate check-in | could not verify — needs a camera |

### Demo Admin
| Item | Status |
|---|---|
| Demo sign-in, `/admin` tabs (Overview, Users, Stores, Fraud, Audit) | works |
| Finance, Dispute, Delivery dashboards | could not verify with a demo account (#40); layout checked via the local demo store |

### Demo Super Admin
| Item | Status |
|---|---|
| Demo sign-in, `/super` | works |
| Feature-flag switches | works (toggled and restored) |
| `/super/staff` | works (loads) |
| View As + impersonation banner | works (banner "Viewing as") |

Toasts work throughout.

---

## 4. Wording changes compared with `main`

Behaviour copy (escrow, payments, verification claims) was not rewritten; the escrow and pricing wording issues are listed under P0 below.

**Navigation (new information architecture)**
- New places: **Home**, **Shop**, **Campus**, **Me**. The old mobile **More** sheet's destinations are now the **Me** page.
- Top nav **Safe Escrow** → **How escrow works**.
- **Sign Out** → **Sign out**; staff and SRC headers hide "Landing" behind an arrow icon on phones (the button is labelled "Landing").
- Account menu: **Me**, **<Role> dashboard** links for staff roles, workspace rows, **Join Student OS**, **Sign out**.
- Mall search field label: "Search" → "Search NAFLIS Mall".
- New footer: **Escrow terms**, **Student wallet**, **Student OS**, **SRC access**, **Sign in**, "Verified student commerce".

**Landing `/`**
- Hero: new eyebrow "Verified student commerce" and headline "Buy smarter. Study smarter." The old headline "The Verified Campus & Student Commerce Operating System" is kept inside the intro sentence; "Smart Campus Commerce & Student Hub" is kept.
- New: search title "What do you need today?", "Funds held in escrow", "Group buy", "All group buys", "See group buy", "How it works".
- "Campus Toolkits & Modules / Engineered specifically… / 5 Integrated Pillars" merged into one line under the tiles; pillar titles lose their numbers ("1. Student Marketplace" → "Student Marketplace", etc.); pillar descriptions and button labels unchanged.
- Group buys section titled **Almost full** ("Student group buys with the fewest spots left.").
- "How Campus Escrow Protects Every Cedi" → "How escrow protects every cedi". Step texts (including "Release with 6-Digit PIN") unchanged.
- "✓ 100% Protected Handover" → "100% Protected Handover"; "Clear filter ✕" → "Clear filter".
- New line above the SRC portal block: "Student leader or faculty head?" (the original heading is kept).

**Student hub `/student-os`**
- Greeting "Hi, <first name>" with "What do you need today?"; "Open Student OS & Campus Marketplace." becomes the subtitle.
- Tiles renamed with the old text kept as the hint: "Find Roommate / Hostel" → **Marketplace** ("Find roommate / hostel items: dorm appliances, room items & sublets."), "Student Flash Deals" → **Group buys**, "Browse Course Notes" → **Past questions**; new **Events** tile.
- "Active Group Buys" → **Almost full** ("Active group buys, fewest spots left first.").
- Escrow banner title "Pay only after you've checked the item" (the old "Campus Handover & Escrow Protection" stays above it).
- "Student Verified" → "Verified"; "Group Buy Deal" → "Group buy"; "Open Resource Hub →" → "Open Resource Hub".

**Shop**
- Tabs **Marketplace / Group buys / Discounts**, link **NAFLIS Mall**, button **Sell an item** (was "List Item").
- Marketplace: field labels **Campus**, **Condition**, **Sort by**; filter sheet "Filters — Campus, condition and sort order for the marketplace.", **Reset**, "Show N items"; seller badge "Student" → "Verified" (shown only where the data says verified); safety tip loses its 🛡️.

**Campus**
- Page titles moved into a shared header (same titles and subtitles). Resource Hub adds "Around campus" tiles and an SRC notices card.

**Me (new)**
- "Me", "NAFLIS Wallet", "Available balance · GH₵… held in escrow", **Top up**, **Details**, "Active order", "Your payment stays in escrow until you confirm you've received the order.", **I've received my order**, **Track order**, **Message seller**, "No active order — When you buy something, you can follow it here until it reaches you.", **Go to Shop**, group headings (My account, Workspaces & access, Shop, Campus, More, Session).

**Staff, SRC, login, invite**: copy unchanged.

---

## 5. Known issues, by priority

Numbers refer to `docs/known-issues.md`. Everything below exists on `main` too unless marked.

### P0 — money and trust
- **Invented prices and savings** — landing "Student savings" multiplies every discount by 15 (#8); mall products loaded from Supabase get `originalPrice = price × 1.25`, demand 85 and an 8-hour flash sale (#11); deals show an old price without checking it is higher (#15). Agreed follow-up: show real original prices only.
- **Escrow wording promises more than the code does** — landing escrow section, escrow modal and hub banner describe a buyer "6-digit PIN release" and "cancel instantly for full automatic refund" that don't exist (#5). "Escrow Buy" on campus listings says an escrow hold/order was created, but nothing is created (#3, #20). "Protected in escrow" counts only this browser's demo orders (#9).
  *Note on the new `/me` line* ("stays in escrow until you confirm you've received the order"): true for the buyer's confirm button; the other release path is the courier entering the buyer's delivery code (`deliveryComplete`), which is also a buyer confirmation.
- **The nobody's-number fallback** — Contact falls back to `+233 24 000 0000` / `233240000000` when a listing has no phone (#17).
- **Hard-coded Verified badges** — every brand voucher (#16) and every resource ("Verified Exam Pack", "verified by peer study group") (#23) claim verification regardless of data.
- **Buyer dispute missing** — the order machine and store support it, but no buyer-facing action exists (#30).

### P1 — broken features
- Downloads produce no file: Resource Hub **Download PDF** / **Download Full Document** (#21) and the hub's study-materials **Download** (#4).
- Uploads take no file and record a fixed seller id (#22).
- Wallet **Withdraw**, **Send**, **Freeze wallet**, **Link another method** do nothing (#31).
- ~~Orders and Alerts crash~~ — **fixed in this branch** (#28, #29).
- Demo sign-in can be undone by the Supabase sign-out event when Supabase is configured (#1).
- Guarded pages redirect to `/login` on a full page load or reload, even when signed in (#2).
- Finance, Dispute and Delivery dashboards have no demo account (#40).

### P2 — polish
- Mall product, Reserve & Pay and Installments scroll sideways at 768px (#34); product action buttons overlap (#35); mall product cards cut off prices on phones (#36).
- Dark-theme hydration warning in the console (#37).
- Accessibility gaps listed in #38 (unnamed switches, delete button, progress bars; `dt/dd` without `dl`).
- Mall sidebar Alerts badge counts every account's notifications (#39).
- "Verify to Unlock All Deals" gates nothing (#19); "Copy Code" always says copied (#18); "How to apply" is a message only (#25); ticket buttons disabled for guests without explanation (#26).
- Two campus selectors behave differently (#6); "Back to <campus>?" prompt on most visits (#7).
- Placeholder-looking counts and group-buy spots (#10, #12); broken seed images (#13); very short order numbers (#32); the first demo cart item exceeds the demo wallet (#33).
- Lost & Found claim panel re-renders on any store change (#27); lint baseline (#14).

---

## 6. Manual test script — real Supabase backend and Paystack test mode

Run against a deployment or `npm run dev` with your real `.env` (Supabase URL and anon key) and the Paystack **test** keys configured where the project already expects them. Use your own test accounts; the demo buttons are for demo mode only. Do each block on a phone-sized window (≈ 375px) and on desktop, and repeat a few pages in dark mode.

**A. Sign-in and guards**
1. Signed out, open `/buyer/wallet` → you land on `/login?redirect=/buyer/wallet`.
2. Sign in with a buyer test account → you return to `/buyer/wallet`.
3. Reload the page → note whether you are sent to `/login` again (known issue #2) and that **Continue** takes you back.
4. Account menu → **Sign out** → header shows **Sign in**. Sign in again from `/me` → **Sign in**.
5. Click **Demo Student** with Supabase configured, several times → note any time you end up signed out (#1).

**B. Student (account with the Student role)**
1. Header campus pill → pick another campus → **Switch** → marketplace and hub show that campus; reload → the choice persists (saved through `saveActiveCampus`).
2. Verify Student ID modal → submit → badge on `/me` reads **Verified student** after the backend approves.
3. **Sell an item** → create a listing with a phone number → it appears in the marketplace for another student account; **Contact** shows that number.
4. Deals → **Join Pool** on a group buy → the spot count rises for another account too (if group buys are server-backed in your setup; otherwise note "local only").
5. Events → buy a paid ticket → pay with Paystack test card (see D) → ticket with QR appears under **My tickets**; SRC account scans it at **Ticket Check-in** (needs a camera).
6. Lost & Found → **I found something** with a verification question → a second student account clicks **This is mine**, answers → first account sees **Approve claim / Decline / Ask for proof** → approve → collection code → **Confirm collection** → **Close case**.

**C. SRC / institution (account with an SRC grant)**
1. `/campus-admin` → **Publish Announcement**, pin it → it appears in the landing ticker, the hub's SRC row and the Resource Hub notices for that campus only.
2. **Upload Lecture Slides** → resource appears in the Resource Hub for that campus.
3. Super Admin: `/super/staff` → invite a staff email → open the invite link (`/staff-invite?token=…`) signed in as that email → **Accept invitation** → the SRC portal opens scoped to the invited campus.

**D. Buyer and Paystack test mode**
1. `/buyer` → add an item to the cart → the cart badge updates.
2. `/buyer/checkout` → choose **NAFLIS Card / Bank card** → pay with Paystack's documented **test** card (for example `4084 0840 8408 4081`, any future expiry, CVV `408`; follow the PIN/OTP Paystack's test docs give) → the order appears in **Me → Orders & escrow** as **Paid · In escrow** after the webhook confirms it (not before).
3. Repeat with **Mobile Money** using Paystack's test MoMo number → same result; also try a declined test card → no order is marked paid.
4. `/me` → the **Active order** card shows that order, its status and **Track order**; the wallet card shows the amount held in escrow.
5. Move the order to **Delivered** through the real actors (seller/courier/staff in your setup) → `/me` shows **I've received my order** → click it → order becomes **Completed**, the escrow hold is released (check the seller's settlement in your backend). Also try the same from the order page's **Confirm delivery & release escrow**.
6. `/buyer/wallet` → **Add money** → note whether the balance is server-backed (survives a reload / another device) or local only.
7. `/buyer/notifications` and `/buyer/orders` load without the "This page didn't load" screen.

**E. Staff**
1. Admin account → `/admin`, all five tabs.
2. Finance, Dispute and Delivery accounts → `/finance`, `/dispute`, `/delivery` load and their actions work (these could not be checked with demo accounts).
3. Super Admin → `/super` toggle a non-critical feature flag and back; **View As** a student → the "Viewing as" banner appears and payments are blocked → end the session.

**F. Presentation checks**
1. Phone width: nothing scrolls sideways (except the known mall pages, #34), nothing sits under the tab bar, every button is easy to tap.
2. Dark mode: text is readable everywhere; filled buttons stay violet with white text.
3. Keyboard: Tab through the header and a dialog; focus is always visible and returns to the button after a dialog closes.

---

## 7. Flows only testable in demo mode during this work
All sign-ins (demo buttons only), checkout and Paystack payments (simulated), wallet top-up, ticket purchase, order status changes (**Simulate next status**), escrow release, SRC publishing and uploads, staff and Super Admin actions, feature flags and View As. None of these reached a real backend.

---

## 8. Draft pull request description

> **Title:** UI redesign: friendlier, simpler NAFLIS Mall (Home, Shop, Campus, Me)
>
> ### Summary
> A presentation-and-navigation redesign of NAFLIS Discount Mall. No backend, schema, auth, payment, escrow, role or route changes; every existing route, feature, filter, form and handler is kept.
>
> - **New shell:** four places — Home, Shop, Campus, Me — as a desktop top nav and a floating phone tab bar; account menu with staff dashboard links; campus picker; footer.
> - **Design tokens:** violet palette, Plus Jakarta Sans, 44px targets, visible focus, light and dark themes with ≥ 4.5:1 text contrast. The interim hard-coded sky accent is gone.
> - **Home:** new landing and student hub; "Almost full" group buys sorted by fewest spots left.
> - **Shop:** segmented Marketplace / Group buys / Discounts, NAFLIS Mall entry, Sell an item, phone filter sheet.
> - **Campus:** shared header and pill row across Resources, Calendar, Events, Opportunities, Lost & Found; Resource Hub doubles as the Campus hub.
> - **Me:** profile, real wallet (Top up only), the buyer's real active order with real actions, and every former "More" destination.
> - **Staff, SRC portal, login, invite:** restyled on the same tokens.
> - **Bug fix (separate commit):** orders list, order page and Alerts no longer crash (infinite render loop with zustand 5); regression test added.
>
> ### Testing
> - `vite build`, `tsc --noEmit`, `vitest run` (59 tests) pass.
> - Route sweep of every route at 360/390/768/1280px in light and dark; checklist walk with all five demo accounts; axe-core on key pages; keyboard checks. Details in `docs/redesign-report.md`.
> - Only demo mode was exercised; the manual script in the report covers real Supabase and Paystack test mode.
>
> ### Known issues
> Not fixed here, listed by priority in `docs/redesign-report.md` and `docs/known-issues.md` — notably invented old prices/savings, escrow copy that promises a PIN release the app doesn't have, the placeholder contact number, hard-coded "Verified" badges, and no buyer dispute action.
>
> ### Notes
> - Client JS + CSS grows from 483.5 KB to 555.3 KB gzip (+14.9 %), mostly the shell's shared components moving into the common chunk.
> - `MobileBottomNav.tsx` is no longer used but kept.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
