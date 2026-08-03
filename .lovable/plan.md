# NAFLIS Discount Mall — Build Plan

This is a very large spec (35 sections, 7 roles, dozens of workflows). Delivering it all in one shot would produce shallow, broken screens. I'll build it as a **connected, investor-demoable prototype** in phases, each phase leaving the app fully functional. All data lives in a single reactive local-storage store so actions in one role instantly appear in another (buyer order → seller order → delivery job → admin metric).

## Architecture (once, up front)

- **Stack**: existing TanStack Start + React + TS + Tailwind v4 + shadcn.
- **State**: a single Zustand store persisted to `localStorage` (`naflis-store`) holding users, products, stores, orders, wallets, escrow ledger, deliveries, disputes, credit apps, installment plans, reservations, promos, campaigns, search events, product requests, price alerts, demand insights, notifications, messages, subscriptions, audit logs.
- **Roles**: `RoleContext` + `<RoleSwitcher />` in the top bar. Switching role re-renders the shell (buyer bottom-nav on mobile / sidebar on desktop; seller, delivery, finance, dispute, admin, super-admin each get their own sidebar).
- **Design tokens** in `src/styles.css`: deep navy, midnight blue, electric violet, premium gold, plus semantic success/warning/error. Light + dark + system theme via `next-themes`-style toggle. Typography: Inter (loaded via `<link>` in `__root.tsx`).
- **Seed**: 12 users, 40+ products across 17 categories with GHS pricing, price history, demand data, 1 pre-seeded dispute, 1 pre-seeded Reserve & Pay plan, 1 pre-seeded installment plan, promo codes (`NAFLIS10`, `FLASH20`, `FREESHIP`, `BLACKFRIDAY`, `FIRSTBUY`).
- **Investor Demo panel**: floating button opens a drawer with the 10 scripted scenarios, each with step tracker + "Run step" buttons that drive the store.
- **Reset Demo** and **Demo Guide** buttons in the profile menu.

## Phases

Each phase is a single turn. After phase 1 the app is already demoable; each later phase adds depth without breaking earlier flows.

### Phase 1 — Foundation + Buyer core + Landing (this turn)
- Design system, theme toggle, Inter font, layout shell, role switcher, reset/guide buttons.
- Zustand store + full seed data + persistence.
- Public landing page (hero, live metrics, trending, flash sales, categories, how-it-works, FAQ, CTA — all links wired).
- Buyer: home, search + filters, category browse, product detail (all buttons functional: buy, add to cart, reserve, pay-later, wishlist, price alert, ask seller), cart, checkout (promo codes, wallet, escrow), order success + timeline.
- Wallet dashboard (balance, escrow, transactions, add money, auto-funding config).
- Notifications center + in-app messaging (masked).
- Investor Demo drawer scaffold + Scenario 1 (search → compare → promo → wallet checkout → escrow).

### Phase 2 — Reserve & Pay + Take Now Pay Later + Escrow deep + Delivery
- Full Reserve & Pay workflow + dashboard + seeded plan.
- Take Now Pay Later: eligibility engine, credit score 0–1000, installment plan, auto-deduction simulator, approved + declined seeded applicants.
- Escrow timeline component reused across orders.
- Delivery Partner role: dashboard, accept → pickup → deliver with code, proof of delivery, earnings.
- Scenarios 2, 3, 9.

### Phase 3 — Seller experience + Intelligence + Brand Studio
- Seller dashboard, product CRUD, campaign builder, promo code manager, store management.
- Seller Intelligence dashboard: search insights, opportunity map, price intelligence (with Apply Recommendation), demand forecasting charts (Recharts).
- Automated Store Builder + Catalog Generator (template-driven simulated AI).
- Product Requests inbox + Group Buying + Price Watch (seller side).
- Subscriptions (Starter/Growth/Professional/Enterprise) with wallet checkout.
- Scenarios 4, 5, 6, 7.

### Phase 4 — Admin + Finance + Dispute + Fraud + Reports
- Admin dashboard with all modules (users, sellers, products, orders, escrow, wallets, credit, installments, settlements, delivery, disputes, promotions, intelligence, fraud, reports, content, settings, audit logs) — each a searchable/filterable/sortable table with detail views.
- Finance Officer dashboard with approve/decline/restructure controls.
- Dispute Officer dashboard + seeded dispute resolution flow.
- Fraud monitoring with risk scores.
- Verified Discount badges + price-history enforcement.
- Reports with simulated PDF/Excel/CSV export toasts.
- Scenarios 8, 10.

## Technical notes for you

- No new backend; Lovable Cloud stays off. Everything is local-first for the demo.
- `zustand` + `zustand/middleware/persist`, `recharts`, `date-fns`, `next-themes`, `sonner` (already present), `lucide-react` (already present).
- All navigation via TanStack `<Link>` and file-based routes under `src/routes/`.
- Each role gets a pathless layout: `src/routes/_buyer.tsx`, `_seller.tsx`, `_delivery.tsx`, `_finance.tsx`, `_dispute.tsx`, `_admin.tsx`. Role switcher just navigates to that role's root.
- Buttons that would normally hit a real API instead dispatch store actions + toast + timeline entry, so the whole thing feels live.

## What I need from you

Confirm the phased approach and I'll start Phase 1 immediately. If you'd rather I compress into fewer/larger turns (accepting rougher polish per area) or reorder phases (e.g. seller intelligence before delivery, since it's the investor centerpiece), tell me now.
