# NAFLIS Mall — Redesign audit (Phase 0)

Read-only audit of the working tree on 2026-10-14, as input to the "friendly UI" redesign.
Nothing in the code was changed to produce this.

> **Source tree audited:** branch `feat/payments-delivery-settlement` (commit `51a6005`), which is
> `main` + one unmerged commit (payments, tracking, Seller Hub). Items that exist **only on that
> branch** are marked **[feat]**. The live site (smart-hub-project.vercel.app) is built from `main`
> and does not have them.

## 1. Stack

| Concern | What the project uses |
|---|---|
| Framework | React 19 + TanStack Start (SSR via Nitro, deployed to Vercel; Lovable-connected) |
| Router | TanStack Router, file-based routes in `src/routes/` (`routeTree.gen.ts` is generated) |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"` in `src/styles.css`, tokens in `@theme inline` + `:root` / `.dark` CSS variables) |
| Components | shadcn/ui "new-york" (`src/components/ui/*`), Radix primitives, `lucide-react` icons (`components.json` → `iconLibrary: lucide`) |
| Font | Inter, loaded from Google Fonts in `src/routes/__root.tsx` `head().links`; `--font-sans` / `--font-display` in `styles.css` |
| Theme | Light + dark (`.dark` class; `ThemeToggle`, preference in `localStorage['naflis-theme']`, applied pre-paint by an inline script in `RootShell`) |
| Custom utilities | `gradient-hero`, `text-gradient-sea`, `shadow-premium`, `no-scrollbar`, colour tokens `navy`, `midnight`, `sea-blue`, `gold`, `success`, `warning`, `error` |
| State / data | Zustand store persisted to localStorage (`src/lib/naflis/store.ts`, ~3,000 lines, demo seed data); Supabase client (`src/lib/supabase.ts`) when env vars are set; services in `src/services/*`; TanStack Query provider in root |
| Auth | Supabase auth (`__root.tsx` session sync → `store.syncUser`); `/login` has email/password + Google + **demo sign-in buttons** (Buyer, Student, Admin, SRC (UG), Super Admin) |
| Role guards | `store.enterContext([...roles])` in route `beforeLoad` (redirects to `/login?redirect=…`); roles in `src/lib/naflis/roles.ts`; staff permissions in `src/lib/naflis/permissions.ts` |
| Feature flags | `src/lib/featureFlags.ts` (`useFeatureFlag`), backed by Supabase `feature_flags` |

## 2. Routes by role

### Public
| URL | File | Notes |
|---|---|---|
| `/` | `routes/index.tsx` (1,068 lines) | Landing page — see §4 |
| `/login` | `routes/login.tsx` | Sign in / sign up, Google, demo buttons, `?redirect=` |
| `/staff-invite?token=` | `routes/staff-invite.tsx` | Accept SRC/dean invitation |
| `/pay/$token` **[feat]** | `routes/pay.$token.tsx` | Seller payment link / QR |
| `/receipt/$reference` **[feat]** | `routes/receipt.$reference.tsx` | Payment receipt |
| `/courier-invite?token=` **[feat]** | `routes/courier-invite.tsx` | Courier invitation |

### Student (Student OS) — layout `routes/student-os.tsx` → `StudentOSShell`; enters the `student` context if held, otherwise open
| URL | File |
|---|---|
| `/student-os` | `student-os.index.tsx` — hub overview |
| `/student-os/marketplace` | `student-os.marketplace.tsx` |
| `/student-os/deals` | `student-os.deals.tsx` |
| `/student-os/resources` | `student-os.resources.tsx` |
| `/student-os/calendar` | `student-os.calendar.tsx` |
| `/student-os/events` | `student-os.events.tsx` |
| `/student-os/opportunities` | `student-os.opportunities.tsx` |
| `/student-os/lost-found` | `student-os.lost-found.tsx` |

### Buyer (NAFLIS Mall) — layout `routes/buyer.tsx` → `BuyerShell`; guard `enterContext(["buyer"])`
`/buyer` (home), `/buyer/categories`, `/buyer/deals`, `/buyer/search?q=&cat=`, `/buyer/product/$id`,
`/buyer/cart`, `/buyer/checkout`, `/buyer/orders`, `/buyer/orders/$orderId`, `/buyer/wishlist`,
`/buyer/wallet`, `/buyer/reserve`, `/buyer/installments`, `/buyer/messages`, `/buyer/notifications`.

### SRC / Dean (institutional)
| URL | File | Guard |
|---|---|---|
| `/campus-admin` | `campus-admin.tsx` (1,240 lines) | `src_head`, `dean`, `super_admin` |
| `/campus-admin/dashboard` | `campus-admin.dashboard.tsx` (alias of the portal) | inherits |

### Admin / staff
| URL | File | Guard |
|---|---|---|
| `/admin` | `admin.tsx` | `admin`, `super_admin` |
| `/finance` | `finance.tsx` | `finance` |
| `/dispute` | `dispute.tsx` | `dispute` |
| `/delivery` | `delivery.tsx` | `delivery` |
| `/seller`, `/seller/*` **[feat: Seller Hub]**; on `main` both redirect to `/buyer` | `seller.tsx`, `seller.index.tsx`, `seller.$.tsx` | signed in |

### Super Admin — layout `routes/super.tsx` (guard `super_admin`, blocked while viewing-as)
`/super` (engine room, feature flags), `/super/staff` (staff grants & invites), `/super/view-as` (impersonation).

## 3. Shared components

| Component | Where used | What it carries |
|---|---|---|
| `Logo` | every shell, landing, login, invite pages | NAFLIS Mall wordmark + tagline |
| `StudentOSShell` | `/student-os/*` | Header: logo, "Student OS" badge, **campus selector** (`CampusContextBar`), **Verify Student ID / Verified Student** button, **List Student Item / Sell** button, `ThemeToggle`, `ContextSwitcher`, "Main Mall" link; sub-nav of 9 tabs (incl. **Institutional / SRC Access**); mounts `MobileBottomNav context="student"`, `CampusSwitchPrompt`, `ListStudentItemModal`, `StudentVerificationModal` |
| `BuyerShell` | `/buyer/*` | Header search (→ `/buyer/search`), mobile search + cart icons with badge, theme, workspace switcher, user chip, Sign Out; left sidebar of 13 links (some flag-gated: Student OS, Reserve & Pay, Installments) with badges (cart, wishlist, unread alerts); runs demo schedulers; mounts `MobileBottomNav context="buyer"` |
| `MobileBottomNav` | both shells (mobile only) | 4 tabs + **More** sheet (grid of extra destinations, workspace switcher rows, Join Student OS, Sign out) |
| `RoleShell` (+ `MetricCard`) | admin, finance, dispute, delivery, super, seller [feat] | Header with Landing link, theme, switcher, Sign Out; title/subtitle/icon/badge |
| `ContextSwitcher` / `useWorkspaces` | all shells | Role/workspace switching, Join Student OS, Seller Hub entry [feat] |
| `CampusContextBar`, `CampusSwitchPrompt` (`CampusContext.tsx`) | Student OS shell | Campus dropdown, "use my location", switch-campus prompt |
| `ThemeToggle` | all shells, landing | light/dark/system |
| `ListStudentItemModal` | Student OS (header Sell button, marketplace, hub) | Create a campus listing |
| `StudentVerificationModal` | Student OS, workspace switcher | Student ID verification |
| `ImpersonationBanner` | root | View-As session banner |
| `ProductCard`, `PurchaseOptions`, `PaymentPlans`, `EscrowTimeline` | buyer pages | Mall product UI, purchase methods, plans, order timeline |
| `TicketQR` / `QrScanner` | events, SRC console, Seller Hub [feat] | QR render + camera scan |
| `SrcConsole` | `/campus-admin` | Ticket tiers, publishing, gate check-in |
| SRC notice ticker | top of `/` (landing) | Pinned SRC announcements carousel with prev/next |
| `OrderTracking`, `TrackingTimeline`, `LiveMap`, `CourierWorkspace`, `StaffPanels`, `seller/*` **[feat]** | buyer order detail, delivery, finance, dispute, seller | Server-backed tracking & settlement |
| Toaster (sonner) | root | All feedback toasts |

## 4. Features per page

**Landing `/`** — pinned SRC notice ticker (prev/next); top nav: Student OS, Marketplace, Student Deals, **Safe Escrow** (opens escrow explainer modal), **Institutional / SRC Access**, theme, Sign In / (Dashboard + Sign Out when signed in); hero with CTAs (Student Deals, Student OS, "How escrow works" modal); live metrics strip (incl. "Protected in escrow"); quick-access feature cards (Marketplace, Deals, SRC portal, Resources); "deals" section (`#deals`) of group buys; mall products section ("Browse full mall" → `/buyer`); escrow section (`#escrow`) with 6-digit PIN steps; SRC/faculty banner (→ `/campus-admin`); footer link columns (Student OS Hub, Marketplace, Deals, Lecture Notes, SRC portal, Executive Sign In, Student Wallet, …); escrow modal with "Open SRC Portal".

**Student OS hub `/student-os`** — campus-filtered search, category chips, recent listings, "Active Group Buys" (join), Student Flash Deals, Top Study Materials & Past Exams, Browse Course Notes, Post Campus Listing (opens modal), verify-student prompt, escrow explainer text.

**Campus Marketplace `/student-os/marketplace`** — search; **campus select** (`requestCampusSwitch`); **condition select** (All + conditions); **sort** (newest / price asc / price desc); **category chips** (All + DB categories via `useCategories("student")`); empty state with reset; listing cards: image, condition, verified-student badge, campus, price (+ original price), meetup/hostel location with pin; **Contact** (modal with seller details & safety tip) and **Escrow Buy** (shows a toast only — see §6); List item (modal).

**Student Deals `/student-os/deals`** — tabs **All / Group buys / Vouchers**; group-buying pools (campus, progress, **Join** via `joinGroupDeal`); brand vouchers with **copy code**; verify-student prompt for gated deals.

**Resource Hub `/student-os/resources`** — search by course code/subject/title; **type chips** (resource types); resource rows with **Preview** (modal) and **Download** (`handleDownload`, increments count); **Upload Study Material** modal (title, course code, description, type, file) with validation toasts.

**Academic Calendar `/student-os/calendar`** — views (day/week/month…), prev/next/Today, type toggles (classes, exams, events…), course/lecturer filter, day picker.

**Events & Tickets `/student-os/events`** — event list, ticket tiers, **buy ticket** (wallet/card/MoMo via `buyTicket`), my tickets with QR.

**Opportunities `/student-os/opportunities`** — type filter, search, **save/unsave**, "How to apply", reset filters.

**Lost & Found `/student-os/lost-found`** — search, **report lost / report found** (title, category, campus, description, handover point, verification question, photo), "This is mine" claim, proof Q&A, approve/decline/ask-for-proof, collection code confirm, close case/listing, private-details toggle.

**Buyer mall** — home (deals, recommendations), categories, deals, search with filters, product detail (buy, cart, reserve, pay later, wishlist, price alert, ask seller), cart, checkout (promo codes, wallet/card/MoMo, delivery method, purchase methods), orders + order detail (timeline, confirm receipt, dispute [feat]), wishlist, **wallet** (balance, escrow, **Add money** with amount presets & source, linked methods, transactions, auto-fund), reserve & pay, installments, messages, notifications.

**SRC portal `/campus-admin`** — tabs **Announcements / Resources / Tickets / Check-in / Intelligence**; publish/pin/delete notices & events, upload/delete academic resources, ticket tiers, QR gate check-in, analytics; campus scoping by staff grants.

**Login `/login`** — sign in / sign up modes, password visibility, Google, demo buttons, "already signed in" continue / sign out.

**Admin, Finance, Dispute, Delivery, Super** — operational dashboards (tables, approvals, flags, staff, view-as). Out of scope for redesign beyond tokens/shell.

## 5. Must-still-work checklist

- [ ] Every URL in §2 loads (incl. `/campus-admin/dashboard`, `/buyer/*`, `/super/*`, `/seller` behaviour for the branch chosen)
- [ ] Role guards still redirect to `/login?redirect=…`; demo sign-in for all 5 demo accounts
- [ ] Campus selector (+ location prompt) changes marketplace/hub results
- [ ] Marketplace: search, campus, condition, sort, all DB categories, reset, Contact modal, Escrow Buy, List item
- [ ] Deals: All/Group/Vouchers tabs, Join group buy, Copy voucher code, verify-student gate
- [ ] Resources: search, type chips, Preview, Download (+count), Upload with validation
- [ ] Calendar: views, navigation, type toggles, filter
- [ ] Events: buy ticket, ticket QR
- [ ] Opportunities: filter, search, save, how to apply
- [ ] Lost & Found: report lost/found, claim flow, proof, approve/decline, collection code, close
- [ ] Verify Student ID modal; List Student Item modal
- [ ] Landing: SRC ticker, Safe Escrow modal, all CTAs and footer links, metrics
- [ ] Buyer: search, cart badge, wishlist, checkout, orders, wallet top-up, reserve, installments, messages, notifications
- [ ] Workspace switcher, Join Student OS, Sign out (desktop + mobile More sheet)
- [ ] SRC portal tabs and actions; Admin/Finance/Dispute/Delivery/Super dashboards
- [ ] Theme toggle (light/dark) — see open question 4
- [ ] Impersonation banner; toasts

## 6. Gaps between the design spec and the code (need a decision before building)

1. **"Escrow Buy" is not a real flow on the campus marketplace.** The button only shows a success toast
   ("Escrow hold secured… code sent!"); nothing is created or charged.
2. **There is no buyer-side "6-digit release code → Release payment / Cancel & refund" flow.** The spec's
   Me-page escrow card describes one. In the code, the code is entered by the courier/seller; the buyer can
   view it and confirm receipt or open a dispute (**[feat]** branch), and on `main` the buyer page has
   "Confirm delivery & release escrow".
3. **Wallet has no Withdraw.** `/buyer/wallet` supports Add money (top-up) only.
4. **"Group buys closing soon"** — group deals (`StudentListing.isGroupDeal`) have a target and a joined
   count but **no closing time**. "Closing soon" can only mean "fewest spots left", unless the wording changes.
5. **Two marketplaces exist:** the student campus marketplace (`/student-os/marketplace`, `/student-os/deals`)
   and the NAFLIS Mall B2C store (`/buyer`, `/buyer/deals`, categories, cart, checkout). The spec's 4-place
   IA maps Shop to the student pages; the B2C mall has no named home in it.

## 7. Odd data / bugs noticed (not to be changed in this pass)

- Landing "Protected in escrow" sums local demo-store orders; with a fresh browser it reads GH₵0.
- Landing "Total saved" metric is `(originalPrice − price) × 15` per product — a fabricated multiplier.
- Escrow Buy toast claims a code was sent when nothing happens (see §6.1).
- Landing and several pages still say "escrow" for funds held in an ordinary provider collection (flagged in the payments report).
- Existing code does not pass `prettier --check`, and lint has many pre-existing `no-explicit-any` errors.
