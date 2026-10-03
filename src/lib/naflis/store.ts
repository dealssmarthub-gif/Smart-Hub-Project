import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "./format";
import { supabase } from "../supabase";
import { normalizeRole, resolveRoles, type Role } from "./roles";
import { canTransition, orderStateLabel, toOrderState, type OrderActor, type OrderState } from "./orderMachine";
import { deliveryUnlocked, type DeliveryRule, type Frequency, type PurchaseConfig, type PurchaseMethod } from "./purchase";
import { maskSensitive, SENSITIVE_LABEL } from "./privacyShield";
import { ROLE_META } from "./roles";
import { STAFF_TEMPLATES, can, type Permission, type StaffGrant } from "./permissions";
import type { Tier } from "./intelligence";
import {
  canClaimTransition,
  collectionCode,
  matchScore,
  FOUND_STATUS_LABEL,
  type FoundStatus,
  type LfActor,
  type LostFoundItem,
} from "./lostFound";

// ============================================================================
// TYPES
// ============================================================================

export type { Role };

export type PaymentOption = "wallet" | "card" | "momo" | "reserve" | "installment";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  /** Primary role the account was created with. */
  role: Role;
  /** Every role the account holds; see resolveRoles() for the derived set. */
  roles?: Role[];
  institutionId?: string;
  avatar: string;
  verified: boolean;
  creditScore?: number;
  creditLimit?: number;
  tags?: string[];
}

export interface Store {
  id: string;
  name: string;
  ownerId: string;
  logo: string;
  tagline: string;
  rating: number;
  reviews: number;
  verified: boolean;
  followers: number;
  location: string;
  categories: string[];
  subscription: "starter" | "growth" | "professional" | "enterprise";
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  storeId: string;
  category: string;
  image: string;
  images?: string[];
  price: number; // discounted current price (GHS)
  originalPrice: number;
  stock: number;
  location: string;
  rating: number;
  reviews: number;
  description: string;
  specs: Record<string, string>;
  paymentOptions: PaymentOption[];
  deliveryDays: number;
  freeDelivery: boolean;
  flashSale?: { endsAt: number };
  priceHistory: { date: string; price: number }[];
  demand: number; // 0-100
  viewersNow: number;
  waitingForDrop: number;
  tags: string[];
  verifiedDiscount: boolean;
  createdAt: number;
  /** Seller-configured purchase methods; missing means legacy defaults (see getPurchaseConfig). */
  purchaseConfig?: PurchaseConfig;
}

export interface CartItem {
  productId: string;
  qty: number;
  paymentOption?: PaymentOption;
  /** How the buyer chose to pay for this line; defaults to pay in full. */
  method?: PurchaseMethod;
}

export interface WalletTx {
  id: string;
  type: "credit" | "debit" | "escrow-in" | "escrow-out" | "refund" | "cashback";
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: number;
  orderId?: string;
}

export interface Wallet {
  userId: string;
  balance: number;
  escrow: number;
  reserved: number;
  creditLimit: number;
  outstanding: number;
  cashback: number;
  autoFund: {
    enabled: boolean;
    threshold: number;
    max: number;
    source: "momo" | "bank" | "card";
  };
  linked: { type: "momo" | "bank" | "card"; label: string; masked: string }[];
  transactions: WalletTx[];
}

/** Order lifecycle — see orderMachine.ts for the legal transitions. */
export type OrderStatus = OrderState;

export interface OrderEvent {
  at: number;
  status: OrderStatus | string;
  note: string;
  actor?: string;
}

export interface Order {
  id: string;
  buyerId: string;
  items: { productId: string; qty: number; price: number; method?: PurchaseMethod }[];
  subtotal: number;
  discount: number;
  promoCode?: string;
  delivery: number;
  escrowFee: number;
  total: number;
  paymentOption: PaymentOption;
  status: OrderStatus;
  address: string;
  createdAt: number;
  timeline: OrderEvent[];
  deliveryPartnerId?: string;
  deliveryCode?: string;
  installmentPlanId?: string;
  reservationId?: string;
  planIds?: string[];
  reservationIds?: string[];
  /** Money collected so far for this order (GHS). */
  amountPaid?: number;
  /** Buyer money currently held in escrow for this order (GHS). */
  escrowHeld?: number;
  /** Still owed under installment / credit / reservation terms (GHS). */
  amountOutstanding?: number;
  /** False while an installment delivery rule or unpaid reservation blocks dispatch. */
  deliveryUnlocked?: boolean;
  paymentIntentId?: string;
  idempotencyKey?: string;
  /** Created and settled by the payments Edge Function rather than the demo processor. */
  serverBacked?: boolean;
}

export interface PromoCode {
  code: string;
  type: "percent" | "fixed" | "free-shipping";
  value: number;
  minSpend?: number;
  maxDiscount?: number;
  description: string;
  active: boolean;
}

/** Inventory hold: a fee keeps stock aside until `expiresAt`. */
export interface Reservation {
  id: string;
  buyerId: string;
  productId: string;
  orderId: string;
  qty: number;
  fee: number;
  /** Owed to complete the purchase. */
  balance: number;
  expiresAt: number;
  autoExpire: boolean;
  refundOnExpiry: boolean;
  status: "active" | "converted" | "expired" | "cancelled";
  createdAt: number;
}

export interface PlanEntry {
  seq: number;
  kind: "deposit" | "installment";
  due: number;
  graceUntil: number;
  amount: number;
  paid: boolean;
  paidAt?: number;
  late?: boolean;
}

/** Installment plan (seller-financed, delivery rule applies) or credit sale (NAFLIS-financed BNPL). */
export interface InstallmentPlan {
  id: string;
  kind: "installment" | "credit";
  buyerId: string;
  productId: string;
  orderId: string;
  principal: number;
  financeCharge: number;
  total: number;
  paid: number;
  frequency: Frequency;
  gracePeriodDays: number;
  lateFeePct: number;
  deliveryRule: DeliveryRule;
  deliverAfterInstallments: number;
  schedule: PlanEntry[];
  status: "active" | "completed" | "late" | "defaulted" | "cancelled";
  createdAt: number;
}

/** Demo-mode stand-in for a server payment intent (keyed by idempotency key). */
export interface LocalPaymentIntent {
  id: string;
  idempotencyKey: string;
  userId: string;
  requestHash: string;
  purpose: "order" | "installment" | "reservation_balance" | "topup";
  amount: number;
  method: "wallet" | "card" | "momo";
  status: "requires_payment" | "processing" | "succeeded" | "failed" | "canceled";
  orderId?: string;
  planId?: string;
  reservationId?: string;
  failureReason?: string;
  createdAt: number;
  confirmedAt?: number;
}

/** Result of a confirmed checkout, written into the store as one unit. */
export interface CheckoutSettlement {
  /** "update" refreshes an existing order (plan / reservation payments) without checkout side effects. */
  kind?: "checkout" | "update";
  order: Order;
  plans: InstallmentPlan[];
  reservations: Reservation[];
  /** Authoritative buyer wallet after settlement. */
  wallet?: { balance: number; escrow: number };
  walletTx?: WalletTx[];
  escrowRecords?: EscrowRecord[];
  stockDeltas?: { productId: string; delta: number }[];
}

export interface PlanPaymentSettlement {
  planId: string;
  seqs: number[];
  amount: number;
  at: number;
  wallet?: { balance: number; escrow: number };
  walletTx?: WalletTx[];
}

export interface ReservationPaymentSettlement {
  reservationId: string;
  amount: number;
  at: number;
  wallet?: { balance: number; escrow: number };
  walletTx?: WalletTx[];
}

export interface SearchEvent {
  id: string;
  buyerId?: string;
  query: string;
  category?: string;
  region: string;
  matches: number;
  createdAt: number;
}

export interface ProductRequest {
  id: string;
  buyerId: string;
  buyerName: string;
  name: string;
  category: string;
  brand?: string;
  specs?: string;
  region: string;
  desiredBy?: string;
  priceMin: number;
  priceMax: number;
  wantsReserve: boolean;
  wantsInstallment: boolean;
  interestedBuyers: number;
  createdAt: number;
}

export interface PriceAlert {
  id: string;
  buyerId: string;
  productId: string;
  target: number;
  createdAt: number;
  triggered: boolean;
}

export interface Dispute {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  reason: string;
  description: string;
  evidence: string[];
  status: "open" | "under-review" | "resolved" | "escalated";
  resolution?: string;
  createdAt: number;
}

export interface Delivery {
  id: string;
  orderId: string;
  partnerId?: string;
  pickup: string;
  dropoff: string;
  fee: number;
  status: "unassigned" | "assigned" | "picked-up" | "in-transit" | "delivered";
  code: string;
  createdAt: number;
}

export interface EscrowRecord {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  gross: number;
  platformFee: number;
  deliveryFee: number;
  sellerNet: number;
  status: "held" | "frozen" | "released" | "refunded" | "split";
  createdAt: number;
  releasedAt?: number;
  note?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  link?: string;
}

export interface Message {
  id: string;
  threadId: string;
  from: string;
  to: string;
  body: string;
  createdAt: number;
  read: boolean;
}

export type StudentItemCondition = "Brand New" | "Like New" | "Used - Good" | "Used - Fair";

export interface StudentListing {
  id: string;
  title: string;
  category: string;
  price: number;
  originalPrice?: number;
  campus: string;
  condition: StudentItemCondition;
  sellerName: string;
  sellerId: string;
  sellerPhone?: string;
  sellerAvatar?: string;
  image: string;
  images?: string[];
  description: string;
  hostelLocation?: string;
  isVerifiedStudent: boolean;
  isGroupDeal?: boolean;
  groupDealTarget?: number;
  groupDealJoined?: number;
  groupDiscountPrice?: number;
  resourceType?: "Past Questions" | "Lecture Notes" | "Summary / Cheatsheet" | "Lab Manual" | "Campus Guide" | "Other";
  fileUrl?: string;
  courseCode?: string;
  academicYear?: string;
  downloads?: number;
  createdAt: number;
}

export interface StudentVerification {
  isVerified: boolean;
  studentId?: string;
  institution?: string;
  course?: string;
  level?: string;
  verifiedAt?: number;
}

export const CAMPUSES = [
  "All Campuses",
  "UG - Legon",
  "KNUST - Kumasi",
  "UCC - Cape Coast",
  "UPSA - Accra",
  "ATU - Accra",
  "Ashesi University",
  "GIMPA",
  "UMaT - Tarkwa",
  "Ho Technical University",
] as const;

export const RESOURCE_TYPES = [
  "All Types",
  "Past Questions",
  "Lecture Notes",
  "Summary / Cheatsheet",
  "Lab Manual",
  "Campus Guide",
] as const;

export interface TicketTier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  sold: number;
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  venue: string;
  bannerUrl?: string;
  campus: string;
  pinned: boolean;
  organizer: string;
  createdBy?: string;
  createdAt: number;
  /** Announcements are notices; events can also sell tickets. Missing = event (legacy rows). */
  kind?: "announcement" | "event";
  ticketing?: { tiers: TicketTier[]; salesEndAt?: string };
}

export interface Ticket {
  id: string;
  eventId: string;
  tierId: string;
  holderId: string;
  holderName: string;
  /** 128-bit random token encoded in the QR code; the lookup key at the gate. */
  token: string;
  price: number;
  status: "valid" | "checked_in" | "void";
  purchasedAt: number;
  checkedInAt?: number;
  checkedInBy?: string;
  serverBacked?: boolean;
}

export interface BundleDraft {
  id: string;
  storeId: string;
  productIds: [string, string];
  names: [string, string];
  discountPct: number;
  bundlePrice: number;
  createdAt: number;
}

/** Seller Intelligence UI state — persisted so it survives refreshes. */
export interface IntelligenceState {
  campus?: string;
  tab?: string;
  /** Recommendation ids the seller dismissed, with when. */
  dismissed: Record<string, number>;
  applied: { id: string; kind: "price" | "restock" | "bundle"; detail: string; at: number }[];
  bundles: BundleDraft[];
  upgradeRequests: { storeId: string; tier: Tier; at: number }[];
}

export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  adminName: string;
  targetUserId: string;
  targetName: string;
  role: Role;
  /** e.g. "UG - Legon" or a store name, shown in the banner. */
  context: string;
  reason: string;
  startedAt: number;
  expiresAt: number;
  endedAt?: number;
  endReason?: "exit" | "expired";
}

export interface CampusResource {
  id: string;
  title: string;
  description: string;
  resourceType: string;
  courseCode: string;
  department: string;
  campus: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  downloads: number;
  createdBy?: string;
  createdAt: number;
}

export interface DemandLog {
  id: string;
  searchQuery: string;
  campus: string;
  resultsCount: number;
  userId?: string | null;
  createdAt: number;
}

export const SEED_CAMPUS_EVENTS: CampusEvent[] = [
  {
    id: "ce_srcweek",
    title: "Legon SRC Week Jam 2026",
    description: "Live performances, food court and the inter-hall dance-off. Tickets are QR-validated at the gate.",
    eventDate: "2026-10-24T18:00:00Z",
    venue: "Legon Sports Stadium",
    bannerUrl: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1200&q=80",
    campus: "UG - Legon",
    pinned: true,
    organizer: "UG SRC Entertainment Committee",
    createdBy: "u_src1",
    createdAt: Date.now() - 86_400_000,
    kind: "event",
    ticketing: {
      salesEndAt: "2026-10-24T17:00:00Z",
      tiers: [
        { id: "tier_regular", name: "Regular", price: 30, capacity: 2000, sold: 412 },
        { id: "tier_vip", name: "VIP", price: 80, capacity: 150, sold: 63 },
      ],
    },
  },
  {
    id: "ce_1",
    title: "Official UG SRC General Assembly & Student Welfare Grant Notice",
    description: "The 67th Student Representative Council announces emergency disbursement of campus welfare subsidies and book allowance grants. Apply via student portal.",
    eventDate: "2026-10-02T10:00:00Z",
    venue: "R.S. Amegashie Auditorium, Legon",
    bannerUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80",
    campus: "UG - Legon",
    pinned: true,
    organizer: "UG SRC Executives",
    createdAt: Date.now() - 3600000,
  },
  {
    id: "ce_2",
    title: "KNUST Annual Tech & Innovation Trade Fair: Pitch & Student Market",
    description: "Annual entrepreneurship exhibition. Over 100 student booths, live developer demo day, and startup angel grant pitches.",
    eventDate: "2026-10-08T09:00:00Z",
    venue: "Great Hall Grounds, KNUST Kumasi",
    bannerUrl: "https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1200&q=80",
    campus: "KNUST - Kumasi",
    pinned: true,
    organizer: "KNUST SRC & Innovation Center",
    createdAt: Date.now() - 7200000,
  },
  {
    id: "ce_3",
    title: "UCC 24/7 Library Night Shuttles & Examination Support Desk",
    description: "Campus security and SRC transport committee inaugurates extended night shuttles across Sasakawa, Casford, and Valco halls for revision week.",
    eventDate: "2026-10-05T18:00:00Z",
    venue: "Main University Library Quadrangle",
    bannerUrl: "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1200&q=80",
    campus: "UCC - Cape Coast",
    pinned: true,
    organizer: "UCC SRC Welfare Board",
    createdAt: Date.now() - 14400000,
  },
  {
    id: "ce_4",
    title: "UPSA Career Fair & Corporate Banking Apprenticeship Drive",
    description: "On-campus CV review sessions, interviews with Standard Chartered, Ecobank and PwC for final year and Level 300 business students.",
    eventDate: "2026-10-12T08:30:00Z",
    venue: "UPSA Auditorium, Accra",
    bannerUrl: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1200&q=80",
    campus: "UPSA - Accra",
    pinned: false,
    organizer: "UPSA Professional Development SRC",
    createdAt: Date.now() - 28800000,
  },
];

export const SEED_CAMPUS_RESOURCES: CampusResource[] = [
  {
    id: "cr_1",
    title: "DCIT 101 & 103: Intro to Computer Science Past Exam Solutions (2018-2025)",
    description: "Complete worked step-by-step solutions for binary arithmetic, Boolean algebra, basic C/Python snippets, and end-of-semester past exams.",
    resourceType: "Past Questions",
    courseCode: "DCIT 101",
    department: "Computer Science",
    campus: "UG - Legon",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    fileName: "DCIT101_Past_Questions_2018_2025.pdf",
    fileSize: "3.4 MB",
    downloads: 489,
    createdAt: Date.now() - 86400000 * 10,
  },
  {
    id: "cr_2",
    title: "MATH 121: Single Variable Calculus & Algebra Master Revision Cheatsheet",
    description: "High-yield formulas, integration by parts shortcuts, Taylor series summaries, and common exam traps compiled by TAs.",
    resourceType: "Summary / Cheatsheet",
    courseCode: "MATH 121",
    department: "Mathematics",
    campus: "UG - Legon",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    fileName: "MATH121_Calculus_Formula_Cheatsheet.pdf",
    fileSize: "1.8 MB",
    downloads: 612,
    createdAt: Date.now() - 86400000 * 8,
  },
  {
    id: "cr_3",
    title: "COE 251: Digital Electronics & Logic Gates KNUST Question Pack & Circuit Diagrams",
    description: "Karnaugh mapping techniques, sequential circuit flip-flops, state diagram reductions, and 7 years of past midterm and final questions.",
    resourceType: "Past Questions",
    courseCode: "COE 251",
    department: "Computer Engineering",
    campus: "KNUST - Kumasi",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    fileName: "COE251_KNUST_Logic_Gates_Pack.pdf",
    fileSize: "4.2 MB",
    downloads: 345,
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: "cr_4",
    title: "BUSS 202: Business Law & Company Regulations Slide Decks",
    description: "Lecture slides covering contract formation, breach remedies, agency relationships, and Ghanaian company regulations.",
    resourceType: "Lecture Slides",
    courseCode: "BUSS 202",
    department: "Business Administration",
    campus: "UPSA - Accra",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    fileName: "BUSS202_Business_Law_Lecture_Slides.pdf",
    fileSize: "5.1 MB",
    downloads: 278,
    createdAt: Date.now() - 86400000 * 3,
  },
];

export const SEED_DEMAND_LOGS: DemandLog[] = [
  { id: "dl_1", searchQuery: "Lenovo IdeaPad", campus: "UG - Legon", resultsCount: 2, createdAt: Date.now() - 3600000 },
  { id: "dl_2", searchQuery: "Lenovo IdeaPad", campus: "UG - Legon", resultsCount: 2, createdAt: Date.now() - 7200000 },
  { id: "dl_3", searchQuery: "HP Charger", campus: "UG - Legon", resultsCount: 4, createdAt: Date.now() - 10800000 },
  { id: "dl_4", searchQuery: "Casio fx-991EX Calculator", campus: "KNUST - Kumasi", resultsCount: 1, createdAt: Date.now() - 14400000 },
  { id: "dl_5", searchQuery: "Lenovo IdeaPad", campus: "UG - Legon", resultsCount: 2, createdAt: Date.now() - 18000000 },
  { id: "dl_6", searchQuery: "Single Bed Mattress", campus: "UG - Legon", resultsCount: 3, createdAt: Date.now() - 21600000 },
  { id: "dl_7", searchQuery: "HP Charger", campus: "UG - Legon", resultsCount: 4, createdAt: Date.now() - 25200000 },
  { id: "dl_8", searchQuery: "Dorm Table Fan", campus: "UCC - Cape Coast", resultsCount: 1, createdAt: Date.now() - 28800000 },
  { id: "dl_9", searchQuery: "MacBook Air M1", campus: "Ashesi University", resultsCount: 2, createdAt: Date.now() - 32400000 },
  { id: "dl_10", searchQuery: "Lab Coat & Safety Goggles", campus: "KNUST - Kumasi", resultsCount: 5, createdAt: Date.now() - 36000000 },
];

// ============================================================================
// SEED
// ============================================================================

const IMG = {
  phone: "https://images.unsplash.com/photo-1592286927505-1def25115558?w=800&q=80",
  iphone: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&q=80",
  laptop: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80",
  tv: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&q=80",
  chair: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=800&q=80",
  gamingChair: "https://images.unsplash.com/photo-1610395219791-21b0353e43c4?w=800&q=80",
  sneakers: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
  fridge: "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&q=80",
  ac: "https://images.unsplash.com/photo-1631545308456-1cf5b9b8f4fe?w=800&q=80",
  blender: "https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&q=80",
  bag: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
  powerbank: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80",
  headphones: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
  watch: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
  perfume: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80",
  jacket: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80",
  sofa: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80",
  rice: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&q=80",
  oil: "https://images.unsplash.com/photo-1620577930369-b95bfea15910?w=800&q=80",
  babyseat: "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800&q=80",
  console: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800&q=80",
  camera: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80",
  speaker: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
  microwave: "https://images.unsplash.com/photo-1585659722983-3a681d0e1e2f?w=800&q=80",
  washer: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800&q=80",
  tablet: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&q=80",
  book: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=80",
  lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80",
  dress: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80",
  cream: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=80",
  tire: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
  toy: "https://images.unsplash.com/photo-1558877385-8c1b8b9c1a2f?w=800&q=80",
  fan: "https://images.unsplash.com/photo-1618220252344-8ec99ec624b1?w=800&q=80",
  glasses: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80",
  bike: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=800&q=80",
  guitar: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&q=80",
  luggage: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
};

const AVATARS = [
  "https://api.dicebear.com/9.x/notionists/svg?seed=Ama",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Kwame",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Efua",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Yaw",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Akosua",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Kojo",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Adjoa",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Nana",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Kofi",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Abena",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Yaa",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Kobby",
];

const seedUsers: User[] = [
  { id: "u_buyer1", name: "Ama Owusu", email: "ama@demo.gh", phone: "+233 24 000 0001", region: "Greater Accra", role: "buyer", roles: ["buyer", "student"], institutionId: "UG - Legon", avatar: AVATARS[0], verified: true, creditScore: 780, creditLimit: 8000, tags: ["verified", "returning"] },
  { id: "u_buyer2", name: "Kwame Mensah", email: "kwame@demo.gh", phone: "+233 24 000 0002", region: "Ashanti", role: "buyer", avatar: AVATARS[1], verified: false, creditScore: 520, creditLimit: 0, tags: ["new"] },
  { id: "u_buyer3", name: "Efua Boateng", email: "efua@demo.gh", phone: "+233 24 000 0003", region: "Western", role: "buyer", avatar: AVATARS[2], verified: true, creditScore: 890, creditLimit: 20000, tags: ["high-credit"] },
  { id: "u_buyer4", name: "Yaw Antwi", email: "yaw@demo.gh", phone: "+233 24 000 0004", region: "Northern", role: "buyer", avatar: AVATARS[3], verified: false, creditScore: 310, creditLimit: 0, tags: ["declined-credit"] },
  { id: "u_seller1", name: "TrendTech Ghana", email: "seller@trendtech.gh", phone: "+233 30 200 0001", region: "Greater Accra", role: "seller", avatar: AVATARS[4], verified: true, tags: ["electronics"] },
  { id: "u_seller2", name: "Kente & Co", email: "seller@kente.gh", phone: "+233 30 200 0002", region: "Ashanti", role: "seller", avatar: AVATARS[5], verified: true, tags: ["fashion"] },
  { id: "u_seller3", name: "New Seller Corp", email: "seller@new.gh", phone: "+233 30 200 0003", region: "Western", role: "seller", avatar: AVATARS[6], verified: false, tags: ["new"] },
  { id: "u_delivery1", name: "Kojo Delivery", email: "kojo@ride.gh", phone: "+233 24 000 0011", region: "Greater Accra", role: "delivery", avatar: AVATARS[7], verified: true },
  { id: "u_finance1", name: "Nana Finance", email: "nana@naflis.gh", phone: "+233 30 200 0011", region: "Greater Accra", role: "finance", avatar: AVATARS[8], verified: true },
  { id: "u_dispute1", name: "Abena Resolutions", email: "abena@naflis.gh", phone: "+233 30 200 0012", region: "Greater Accra", role: "dispute", avatar: AVATARS[9], verified: true },
  { id: "u_admin1", name: "Yaa Admin", email: "yaa@naflis.gh", phone: "+233 30 200 0013", region: "Greater Accra", role: "admin", avatar: AVATARS[10], verified: true },
  { id: "u_super1", name: "Kobby Super", email: "kobby@naflis.gh", phone: "+233 30 200 0014", region: "Greater Accra", role: "super_admin", roles: ["super_admin", "admin"], avatar: AVATARS[11], verified: true },
  { id: "u_src2", name: "Kwabena Asante", email: "kwabena@src.knust.gh", phone: "+233 24 000 0022", region: "Ashanti", role: "src_head", roles: ["student", "src_head"], institutionId: "KNUST - Kumasi", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Kwabena", verified: true },
  { id: "u_dean1", name: "Prof. Grace Adjei", email: "dean.students@ug.edu.gh", phone: "+233 30 250 0001", region: "Greater Accra", role: "dean", roles: ["dean"], institutionId: "UG - Legon", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Grace", verified: true },
  { id: "u_src1", name: "Esi SRC", email: "esi@src.ug.gh", phone: "+233 24 000 0021", region: "Greater Accra", role: "src_head", roles: ["student", "src_head"], institutionId: "UG - Legon", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Esi", verified: true },
];

const seedStores: Store[] = [
  { id: "s_trendtech", name: "TrendTech Ghana", ownerId: "u_seller1", logo: AVATARS[4], tagline: "Certified electronics, unbeatable prices.", rating: 4.8, reviews: 1204, verified: true, followers: 12500, location: "Osu, Accra", categories: ["Electronics", "Phones", "Laptops"], subscription: "professional" },
  { id: "s_kente", name: "Kente & Co", ownerId: "u_seller2", logo: AVATARS[5], tagline: "Modern African fashion, delivered.", rating: 4.6, reviews: 812, verified: true, followers: 8700, location: "Kumasi", categories: ["Fashion", "Shoes"], subscription: "growth" },
  { id: "s_new", name: "New Seller Corp", ownerId: "u_seller3", logo: AVATARS[6], tagline: "Just getting started.", rating: 0, reviews: 0, verified: false, followers: 12, location: "Takoradi", categories: ["Home"], subscription: "starter" },
];

// Deterministic seed data: SSR and client must produce identical initial state.
// Use a fixed epoch and a seeded PRNG at module load; runtime actions still use Date.now().
const SEED_EPOCH = 1_752_566_400_000; // 2026-07-15T00:00:00Z, matches the demo "now"
let __rngState = 0x9e3779b9;
function srand() {
  // Mulberry32
  __rngState = (__rngState + 0x6d2b79f5) | 0;
  let t = __rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function priceHist(base: number): { date: string; price: number }[] {
  const arr: { date: string; price: number }[] = [];
  for (let i = 30; i >= 0; i--) {
    const drift = (Math.sin(i / 3) * 0.05 + (srand() - 0.5) * 0.03) * base;
    arr.push({ date: new Date(SEED_EPOCH - i * 86400000).toISOString().slice(0, 10), price: Math.round(base + drift) });
  }
  return arr;
}

function mkProduct(p: Partial<Product> & Pick<Product, "name" | "brand" | "storeId" | "category" | "image" | "price" | "originalPrice">): Product {
  return {
    id: "p_" + uid(),
    stock: 20 + Math.floor(srand() * 80),
    location: p.storeId === "s_kente" ? "Kumasi" : p.storeId === "s_new" ? "Takoradi" : "Accra",
    rating: 4 + srand(),
    reviews: 20 + Math.floor(srand() * 500),
    description: `Premium ${p.name} from ${p.brand}. Verified seller, escrow-protected.`,
    specs: { Brand: p.brand, Warranty: "12 months", Condition: "New" },
    paymentOptions: ["wallet", "card", "momo", "reserve", "installment"],
    deliveryDays: 1 + Math.floor(srand() * 4),
    freeDelivery: srand() > 0.5,
    priceHistory: priceHist(p.originalPrice),
    demand: 40 + Math.floor(srand() * 60),
    viewersNow: 3 + Math.floor(srand() * 40),
    waitingForDrop: Math.floor(srand() * 200),
    tags: [],
    verifiedDiscount: true,
    createdAt: SEED_EPOCH - Math.floor(srand() * 30) * 86400000,
    ...p,
  } as Product;
}


const seedProducts: Product[] = [
  mkProduct({ name: "iPhone 16 Pro Max 256GB", brand: "Apple", storeId: "s_trendtech", category: "Phones", image: IMG.iphone, price: 18500, originalPrice: 21000, flashSale: { endsAt: SEED_EPOCH + 8 * 3600_000 } }),
  mkProduct({ name: "Samsung Galaxy S24 Ultra", brand: "Samsung", storeId: "s_trendtech", category: "Phones", image: IMG.phone, price: 16800, originalPrice: 19500 }),
  mkProduct({ name: "MacBook Air M3 13\"", brand: "Apple", storeId: "s_trendtech", category: "Laptops", image: IMG.laptop, price: 15200, originalPrice: 17800 }),
  mkProduct({ name: "HP EliteBook Student Laptop", brand: "HP", storeId: "s_trendtech", category: "Laptops", image: IMG.laptop, price: 7200, originalPrice: 8500 }),
  mkProduct({ name: "Samsung 55\" 4K QLED TV", brand: "Samsung", storeId: "s_trendtech", category: "Electronics", image: IMG.tv, price: 8900, originalPrice: 11200, flashSale: { endsAt: SEED_EPOCH + 4 * 3600_000 } }),
  mkProduct({ name: "LG Double-Door Fridge 320L", brand: "LG", storeId: "s_trendtech", category: "Home Appliances", image: IMG.fridge, price: 6800, originalPrice: 8200 }),
  mkProduct({ name: "1.5HP Split Air Conditioner", brand: "Hisense", storeId: "s_trendtech", category: "Home Appliances", image: IMG.ac, price: 4500, originalPrice: 5900 }),
  mkProduct({ name: "Philips Pro Blender 1000W", brand: "Philips", storeId: "s_trendtech", category: "Home Appliances", image: IMG.blender, price: 780, originalPrice: 1100 }),
  mkProduct({ name: "Ergonomic Office Chair", brand: "ErgoWorks", storeId: "s_new", category: "Furniture", image: IMG.chair, price: 1180, originalPrice: 1450 }),
  mkProduct({ name: "Pro Gaming Chair", brand: "RaceX", storeId: "s_new", category: "Gaming", image: IMG.gamingChair, price: 1250, originalPrice: 1650 }),
  mkProduct({ name: "Nike Air Max Sneakers", brand: "Nike", storeId: "s_kente", category: "Shoes", image: IMG.sneakers, price: 890, originalPrice: 1150 }),
  mkProduct({ name: "School Backpack Set", brand: "Kente & Co", storeId: "s_kente", category: "School Supplies", image: IMG.bag, price: 220, originalPrice: 320 }),
  mkProduct({ name: "20000mAh Power Bank", brand: "Anker", storeId: "s_trendtech", category: "Electronics", image: IMG.powerbank, price: 320, originalPrice: 460, stock: 4 }),
  mkProduct({ name: "Sony Noise-Cancelling Headphones", brand: "Sony", storeId: "s_trendtech", category: "Electronics", image: IMG.headphones, price: 1980, originalPrice: 2500 }),
  mkProduct({ name: "Apple Watch Series 10", brand: "Apple", storeId: "s_trendtech", category: "Electronics", image: IMG.watch, price: 3200, originalPrice: 3900 }),
  mkProduct({ name: "Signature Perfume 100ml", brand: "Boss", storeId: "s_kente", category: "Beauty", image: IMG.perfume, price: 690, originalPrice: 950 }),
  mkProduct({ name: "Leather Trench Jacket", brand: "Kente & Co", storeId: "s_kente", category: "Fashion", image: IMG.jacket, price: 780, originalPrice: 1050 }),
  mkProduct({ name: "3-Seater Modern Sofa", brand: "HomeMood", storeId: "s_new", category: "Furniture", image: IMG.sofa, price: 4200, originalPrice: 5500 }),
  mkProduct({ name: "Perfect Basmati Rice 25kg", brand: "Golden", storeId: "s_new", category: "Groceries", image: IMG.rice, price: 620, originalPrice: 780 }),
  mkProduct({ name: "Frytol Cooking Oil 5L", brand: "Frytol", storeId: "s_new", category: "Groceries", image: IMG.oil, price: 240, originalPrice: 310 }),
  mkProduct({ name: "Infant Car Seat", brand: "SafeRide", storeId: "s_new", category: "Baby Products", image: IMG.babyseat, price: 1180, originalPrice: 1450 }),
  mkProduct({ name: "PlayStation 5 Slim", brand: "Sony", storeId: "s_trendtech", category: "Gaming", image: IMG.console, price: 6900, originalPrice: 8200 }),
  mkProduct({ name: "Canon EOS R50 Camera", brand: "Canon", storeId: "s_trendtech", category: "Electronics", image: IMG.camera, price: 9800, originalPrice: 11500 }),
  mkProduct({ name: "JBL Party Speaker", brand: "JBL", storeId: "s_trendtech", category: "Electronics", image: IMG.speaker, price: 2200, originalPrice: 2900 }),
  mkProduct({ name: "Bruhm Microwave Oven", brand: "Bruhm", storeId: "s_trendtech", category: "Home Appliances", image: IMG.microwave, price: 1450, originalPrice: 1900 }),
  mkProduct({ name: "LG Front-Load Washer 8kg", brand: "LG", storeId: "s_trendtech", category: "Home Appliances", image: IMG.washer, price: 5200, originalPrice: 6800 }),
  mkProduct({ name: "iPad Air 11\" M2", brand: "Apple", storeId: "s_trendtech", category: "Electronics", image: IMG.tablet, price: 6900, originalPrice: 8200 }),
  mkProduct({ name: "GCE-Level Study Set", brand: "EduPro", storeId: "s_new", category: "School Supplies", image: IMG.book, price: 180, originalPrice: 240 }),
  mkProduct({ name: "Nordic Table Lamp", brand: "HomeMood", storeId: "s_new", category: "Furniture", image: IMG.lamp, price: 260, originalPrice: 360 }),
  mkProduct({ name: "Summer Print Dress", brand: "Kente & Co", storeId: "s_kente", category: "Fashion", image: IMG.dress, price: 320, originalPrice: 450 }),
  mkProduct({ name: "Vitamin C Face Cream", brand: "GlowLab", storeId: "s_kente", category: "Beauty", image: IMG.cream, price: 140, originalPrice: 210 }),
  mkProduct({ name: "All-Weather Car Tire 17\"", brand: "Michelin", storeId: "s_new", category: "Automotive", image: IMG.tire, price: 1250, originalPrice: 1600 }),
  mkProduct({ name: "Learning Blocks Toy Set", brand: "PlaySmart", storeId: "s_new", category: "Baby Products", image: IMG.toy, price: 210, originalPrice: 290 }),
  mkProduct({ name: "Rechargeable Standing Fan", brand: "Bruhm", storeId: "s_trendtech", category: "Home Appliances", image: IMG.fan, price: 780, originalPrice: 1050 }),
  mkProduct({ name: "Blue-Light Reading Glasses", brand: "OptiCare", storeId: "s_kente", category: "Health & Wellness", image: IMG.glasses, price: 180, originalPrice: 260 }),
  mkProduct({ name: "Urban Commuter Bicycle", brand: "Trek", storeId: "s_new", category: "Travel", image: IMG.bike, price: 2800, originalPrice: 3600 }),
  mkProduct({ name: "Acoustic Guitar Starter", brand: "Yamaha", storeId: "s_trendtech", category: "Electronics", image: IMG.guitar, price: 1450, originalPrice: 1900 }),
  mkProduct({ name: "Hard-Shell Travel Luggage", brand: "Voyager", storeId: "s_kente", category: "Travel", image: IMG.luggage, price: 690, originalPrice: 950 }),
  mkProduct({ name: "Office Desk with Drawers", brand: "HomeMood", storeId: "s_new", category: "Office Equipment", image: IMG.chair, price: 1650, originalPrice: 2200 }),
  mkProduct({ name: "Wall Paint 20L", brand: "Coral", storeId: "s_new", category: "Home Improvement", image: IMG.lamp, price: 480, originalPrice: 640 }),
  // Competing listings from other stores (gives Seller Intelligence real price comparables).
  mkProduct({ name: "Sony WH-CH720N Noise Cancelling Headphones", brand: "Sony", storeId: "s_new", category: "Electronics", image: IMG.headphones, price: 1450, originalPrice: 1700 }),
  mkProduct({ name: "JBL Tune Noise Cancelling Headphones", brand: "JBL", storeId: "s_kente", category: "Electronics", image: IMG.headphones, price: 1390, originalPrice: 1600 }),
  mkProduct({ name: "Oraimo 20000mAh Power Bank", brand: "Oraimo", storeId: "s_new", category: "Electronics", image: IMG.powerbank, price: 290, originalPrice: 350 }),
  mkProduct({ name: "Baseus 20000mAh Power Bank", brand: "Baseus", storeId: "s_kente", category: "Electronics", image: IMG.powerbank, price: 340, originalPrice: 420 }),
];

const seedPromos: PromoCode[] = [
  { code: "NAFLIS10", type: "percent", value: 10, description: "10% off any order", active: true, minSpend: 200, maxDiscount: 500 },
  { code: "FLASH20", type: "percent", value: 20, description: "20% off flash-sale items", active: true, maxDiscount: 800 },
  { code: "FREESHIP", type: "free-shipping", value: 100, description: "Free delivery on any order", active: true },
  { code: "BLACKFRIDAY", type: "percent", value: 25, description: "Black Friday 25% off", active: true, maxDiscount: 1500 },
  { code: "FIRSTBUY", type: "fixed", value: 50, description: "GHS 50 off your first order", active: true, minSpend: 300 },
];

function seedWallet(userId: string, balance: number, escrow = 0): Wallet {
  const tx: WalletTx[] = [
    { id: uid(), type: "credit", amount: balance, balanceAfter: balance, description: "Initial funding via MTN MoMo", createdAt: SEED_EPOCH - 7 * 86400000 },
  ];
  return {
    userId, balance, escrow, reserved: 0, creditLimit: 0, outstanding: 0, cashback: 45,
    autoFund: { enabled: false, threshold: 100, max: 500, source: "momo" },
    linked: [
      { type: "momo", label: "MTN Mobile Money", masked: "•••• 0123" },
      { type: "bank", label: "GCB Bank", masked: "•••• 4498" },
    ],
    transactions: tx,
  };
}

const seedProductRequests: ProductRequest[] = [
  { id: "pr_" + uid(), buyerId: "u_buyer1", buyerName: "Ama Owusu", name: "Pro Gaming Chair with lumbar support", category: "Gaming", brand: "RaceX", specs: "Reclining, RGB, weight up to 130kg", region: "Kumasi", desiredBy: "This month", priceMin: 900, priceMax: 1300, wantsReserve: true, wantsInstallment: true, interestedBuyers: 2812, createdAt: SEED_EPOCH - 2 * 86400000 },
  { id: "pr_" + uid(), buyerId: "u_buyer3", buyerName: "Efua Boateng", name: "iPhone 16 Pro Max 512GB", category: "Phones", brand: "Apple", region: "Accra", priceMin: 18000, priceMax: 21000, wantsReserve: false, wantsInstallment: true, interestedBuyers: 4380, createdAt: SEED_EPOCH - 86400000 },
];

const seedStudentListings: StudentListing[] = [
  {
    id: "sl_textbook1",
    title: "Fundamentals of Physics (10th Edition Extended) - Halliday & Resnick",
    category: "Textbooks & Course Notes",
    price: 180,
    originalPrice: 380,
    campus: "UG - Legon",
    condition: "Used - Good",
    sellerName: "Ama Mensah",
    sellerId: "u_buyer1",
    sellerPhone: "+233 24 555 1201",
    sellerAvatar: AVATARS[0],
    image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=80",
    description: "Required for Level 100 & 200 Physics / Engineering students at Legon. Minor highlighter marks in chapter 3, otherwise pages are crisp.",
    hostelLocation: "Commonwealth Hall / Night Market Meetup",
    isVerifiedStudent: true,
    courseCode: "PHYS 101",
    academicYear: "2024/2025",
    createdAt: SEED_EPOCH - 3 * 86400000,
  },
  {
    id: "sl_laptop1",
    title: "MacBook Air M1 2020 (8GB RAM / 256GB SSD) Space Gray",
    category: "Laptops & Tech Gadgets",
    price: 6400,
    originalPrice: 7900,
    campus: "KNUST - Kumasi",
    condition: "Like New",
    sellerName: "Kwame Addo",
    sellerId: "u_buyer2",
    sellerPhone: "+233 20 444 8821",
    sellerAvatar: AVATARS[1],
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
    description: "Clean laptop, 92% battery health, original 30W USB-C brick & cable included. Upgrading to M3 for senior capstone project.",
    hostelLocation: "Unity Hall (Conti) Quad",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 5 * 86400000,
  },
  {
    id: "sl_fridge1",
    title: "Hisense 93L Bedside Hostel Refrigerator (Low Noise)",
    category: "Hostel & Room Essentials",
    price: 1150,
    originalPrice: 1650,
    campus: "UG - Legon",
    condition: "Used - Good",
    sellerName: "Efua Boateng",
    sellerId: "u_buyer3",
    sellerPhone: "+233 55 999 4120",
    sellerAvatar: AVATARS[2],
    image: "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&q=80",
    description: "Compact dorm fridge with ice compartment. Energy efficient (A+), cooled drinks and groceries during last academic year. Clean and tested.",
    hostelLocation: "Pent Hall (Block B, Room 314)",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 2 * 86400000,
  },
  {
    id: "sl_calc1",
    title: "Casio FX-991EX ClassWiz Scientific Calculator (Original)",
    category: "Electronics & Accessories",
    price: 190,
    originalPrice: 280,
    campus: "KNUST - Kumasi",
    condition: "Like New",
    sellerName: "Yaw Antwi",
    sellerId: "u_buyer4",
    sellerPhone: "+233 24 111 9090",
    sellerAvatar: AVATARS[3],
    image: "https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=800&q=80",
    description: "Original Casio ClassWiz with QR code verification and solar panel. Perfect for engineering, math, and business exam calculations.",
    hostelLocation: "Brunei Complex / Engineering Gate",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 6 * 86400000,
  },
  {
    id: "sl_thrift1",
    title: "Vintage Heavyweight KNUST Tech Crest Hoodie (Burgundy)",
    category: "Campus Thrift & Fashion",
    price: 140,
    originalPrice: 240,
    campus: "KNUST - Kumasi",
    condition: "Used - Good",
    sellerName: "Kofi Owusu",
    sellerId: "u_seller2",
    sellerAvatar: AVATARS[5],
    image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80",
    description: "Authentic university tech fleece hoodie. Fits oversized M/L. Freshly laundered and ready for chilly evening study sessions in library.",
    hostelLocation: "Commercial Area / Tech Junction",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 8 * 86400000,
  },
  {
    id: "sl_fan1",
    title: "Binatone 16\" Rechargeable Oscillating Stand Fan (12hr Battery)",
    category: "Hostel & Room Essentials",
    price: 360,
    originalPrice: 520,
    campus: "UCC - Cape Coast",
    condition: "Like New",
    sellerName: "Adjoa Serwaa",
    sellerId: "u_buyer1",
    sellerAvatar: AVATARS[6],
    image: "https://images.unsplash.com/photo-1618220252344-8ec99ec624b1?w=800&q=80",
    description: "Lifesaver during campus power fluctuations. Built-in LED nightlight and USB output to charge your phone during lights-out.",
    hostelLocation: "Valco Hall / Old Site Library",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 1 * 86400000,
  },
  {
    id: "sl_group1",
    title: "Group Buy: MTN 50GB Student Campus High-Speed Bundle (90-Day Validity)",
    category: "Electronics & Accessories",
    price: 120,
    originalPrice: 200,
    groupDiscountPrice: 120,
    groupDealTarget: 10,
    groupDealJoined: 8,
    isGroupDeal: true,
    campus: "All Campuses",
    condition: "Brand New",
    sellerName: "Campus Telecom Pool",
    sellerId: "u_seller1",
    sellerAvatar: AVATARS[4],
    image: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&q=80",
    description: "Join with fellow students to unlock bulk discounted MTN 50GB data. Automated activation to student SIM upon reaching target group count.",
    hostelLocation: "Instant Electronic Delivery via MoMo / SIM",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 1 * 86400000,
  },
  {
    id: "sl_group2",
    title: "Group Buy: Apple & Windows Student Ergonomic Study Kit (Laptop Stand + Wireless Mouse + Hub)",
    category: "Laptops & Tech Gadgets",
    price: 185,
    originalPrice: 320,
    groupDiscountPrice: 185,
    groupDealTarget: 6,
    groupDealJoined: 5,
    isGroupDeal: true,
    campus: "All Campuses",
    condition: "Brand New",
    sellerName: "TrendTech Ghana Campus Hub",
    sellerId: "u_seller1",
    sellerAvatar: AVATARS[4],
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80",
    description: "Aluminum folding laptop stand, silent Bluetooth optical mouse, and 4-in-1 USB-C expansion hub. Guaranteed 1 spot remaining to unlock!",
    hostelLocation: "Central Campus Pickup Station",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 2 * 86400000,
  },
  {
    id: "sl_group3",
    title: "Group Buy: Hostel Induction Cooker + 3-Piece Non-Stick Cooking Pots",
    category: "Hostel & Room Essentials",
    price: 310,
    originalPrice: 460,
    groupDiscountPrice: 310,
    groupDealTarget: 5,
    groupDealJoined: 3,
    isGroupDeal: true,
    campus: "UG - Legon",
    condition: "Brand New",
    sellerName: "Dorm Essentials Direct",
    sellerId: "u_seller3",
    sellerAvatar: AVATARS[5],
    image: "https://images.unsplash.com/photo-1585659722983-3a681d0e1e2f?w=800&q=80",
    description: "Hostel compliant electric induction cooker (auto cut-off) with 3 non-stick soup and stew pans. 2 more students needed for group price drop.",
    hostelLocation: "Legon Hall Annex / Evandy Hostel",
    isVerifiedStudent: true,
    createdAt: SEED_EPOCH - 4 * 86400000,
  },
  {
    id: "sl_res1",
    title: "DCIT 101 & 103: Intro to Computer Science Past Exam Solutions (2018-2025)",
    category: "Textbooks & Course Notes",
    price: 0,
    originalPrice: 60,
    campus: "UG - Legon",
    condition: "Brand New",
    sellerName: "CS Department Honors Guild",
    sellerId: "u_admin1",
    sellerAvatar: AVATARS[10],
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80",
    description: "Complete worked step-by-step solutions for binary arithmetic, Boolean algebra, basic C/Python snippets, and end-of-semester past exams.",
    hostelLocation: "Digital Resource · Instant Download",
    isVerifiedStudent: true,
    resourceType: "Past Questions",
    courseCode: "DCIT 101",
    academicYear: "2024/2025",
    downloads: 489,
    createdAt: SEED_EPOCH - 10 * 86400000,
  },
  {
    id: "sl_res2",
    title: "MATH 121: Single Variable Calculus & Algebra Master Revision Cheatsheet",
    category: "Textbooks & Course Notes",
    price: 0,
    originalPrice: 45,
    campus: "UG - Legon",
    condition: "Brand New",
    sellerName: "Legon Math Society",
    sellerId: "u_admin1",
    sellerAvatar: AVATARS[0],
    image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80",
    description: "High-yield formulas, integration by parts shortcuts, Taylor series summaries, and common exam traps compiled by TAs.",
    hostelLocation: "Digital Resource · Instant Download",
    isVerifiedStudent: true,
    resourceType: "Summary / Cheatsheet",
    courseCode: "MATH 121",
    academicYear: "2024/2025",
    downloads: 612,
    createdAt: SEED_EPOCH - 8 * 86400000,
  },
  {
    id: "sl_res3",
    title: "COE 251: Digital Electronics & Logic Gates KNUST Question Pack & Circuit Diagrams",
    category: "Textbooks & Course Notes",
    price: 0,
    originalPrice: 50,
    campus: "KNUST - Kumasi",
    condition: "Brand New",
    sellerName: "KNUST Electrical & Computer Union",
    sellerId: "u_seller1",
    sellerAvatar: AVATARS[4],
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&q=80",
    description: "Karnaugh mapping techniques, sequential circuit flip-flops, state diagram reductions, and 7 years of past midterm and final questions.",
    hostelLocation: "Digital Resource · Instant Download",
    isVerifiedStudent: true,
    resourceType: "Past Questions",
    courseCode: "COE 251",
    academicYear: "2023/2024",
    downloads: 345,
    createdAt: SEED_EPOCH - 12 * 86400000,
  },
  {
    id: "sl_res4",
    title: "BUSS 204: Managerial Accounting & Budgeting Comprehensive Notes",
    category: "Textbooks & Course Notes",
    price: 0,
    originalPrice: 55,
    campus: "UCC - Cape Coast",
    condition: "Brand New",
    sellerName: "UCC Business Students Association",
    sellerId: "u_buyer3",
    sellerAvatar: AVATARS[2],
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80",
    description: "Covers standard costing, variance analysis, CVP analysis, and operating leverage with practical exam questions and marking criteria.",
    hostelLocation: "Digital Resource · Instant Download",
    isVerifiedStudent: true,
    resourceType: "Lecture Notes",
    courseCode: "BUSS 204",
    academicYear: "2024/2025",
    downloads: 278,
    createdAt: SEED_EPOCH - 5 * 86400000,
  },
  {
    id: "sl_res5",
    title: "Campus Guide: Hostel Rent Secrets, Verified Roommates & Budgeting in Ghana",
    category: "Services & Tutoring",
    price: 0,
    originalPrice: 35,
    campus: "All Campuses",
    condition: "Brand New",
    sellerName: "Open Student OS Guild",
    sellerId: "u_super1",
    sellerAvatar: AVATARS[11],
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&q=80",
    description: "Step-by-step campus survival guide: tenancy agreements, escrow payment safety, utility bill splits, and discount food hubs near every campus.",
    hostelLocation: "Digital Guidebook · Instant Access",
    isVerifiedStudent: true,
    resourceType: "Campus Guide",
    downloads: 1240,
    createdAt: SEED_EPOCH - 15 * 86400000,
  },
];

// ============================================================================
// STATE
// ============================================================================

interface State {
  currentUserId: string | null;
  role: Role;
  users: User[];
  stores: Store[];
  products: Product[];
  promos: PromoCode[];
  cart: CartItem[];
  wishlist: string[];
  wallets: Record<string, Wallet>;
  orders: Order[];
  reservations: Reservation[];
  installments: InstallmentPlan[];
  searchEvents: SearchEvent[];
  productRequests: ProductRequest[];
  priceAlerts: PriceAlert[];
  disputes: Dispute[];
  deliveries: Delivery[];
  notifications: Notification[];
  messages: Message[];
  auditLog: { id: string; at: number; actor: string; action: string; target?: string }[];
  escrowLedger: EscrowRecord[];
  /** Demo-mode payment intents, keyed `${userId}:${idempotencyKey}`. */
  paymentIntents: Record<string, LocalPaymentIntent>;
  featureFlags: Record<string, boolean>;
  demoStep: number;

  // Student OS state
  /** Active campus — the campus context the student is browsing. */
  selectedCampus: string;
  /** Registered institution — where the student is verified. Changes only through verification. */
  registeredInstitution: string | null;
  /** Pending "switch campus?" prompt. */
  campusPrompt: { campus: string; reason: "manual" | "location" | "registered" } | null;
  /** Campus → time until which automatic prompts for it are snoozed ("Not now"). */
  campusPromptSnooze: Record<string, number>;
  lostFound: LostFoundItem[];
  savedOpportunities: string[];
  studentProfile: StudentVerification;
  studentListings: StudentListing[];
  studentModalOpen: boolean;
  verifyModalOpen: boolean;
  resourceDownloads: Record<string, number>;

  // actions
  /** Demo persona sign-in: jumps to the seeded account for a role. */
  setRole: (r: Role) => void;
  /** Switch the active context to another role the current user holds. */
  switchRole: (r: Role) => boolean;
  /** Route guard: make one of `allowed` the active context if the user holds it. */
  enterContext: (allowed: Role[]) => boolean;
  grantRole: (r: Role, userId?: string) => void;
  revokeRole: (r: Role, userId?: string) => void;
  /** Unlocks the seller role; in demo mode also creates the shop. */
  openShop: () => void;
  /** Pull the account's roles from Supabase `profiles` (no-op offline). */
  refreshRoles: () => Promise<void>;
  setUser: (id: string | null) => void;
  signIn: (userId: string) => void;
  signOut: () => void;
  syncUser: (sessionUser: any) => void;
  addToCart: (productId: string, qty?: number, opt?: PaymentOption, method?: PurchaseMethod) => void;
  setCartMethod: (productId: string, method: PurchaseMethod) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  setPriceAlert: (productId: string, target: number) => void;
  recordSearch: (query: string, matches: number) => void;
  createProductRequest: (data: Omit<ProductRequest, "id" | "createdAt" | "interestedBuyers" | "buyerId" | "buyerName">) => void;
  applyPromo: (code: string, subtotal: number) => { ok: boolean; discount: number; message: string; promo?: PromoCode };
  // Payment settlement — called only by services/walletService after the
  // payment server (or the demo processor) has confirmed the money moved.
  recordPaymentIntent: (intent: LocalPaymentIntent) => void;
  applySettlement: (settlement: CheckoutSettlement) => void;
  applyPlanPayment: (settlement: PlanPaymentSettlement) => void;
  applyReservationPayment: (settlement: ReservationPaymentSettlement) => void;
  /** Expire overdue reservations and flag late installments (demo-mode orders only). */
  runSchedulers: (now?: number) => void;
  cancelReservation: (reservationId: string) => void;
  /** Moves an order along the state machine; returns false if the transition is illegal. */
  advanceOrder: (orderId: string, status: OrderStatus, note: string, actor?: string) => boolean;
  // Connected role actions (Phase 2)
  sellerAcceptOrder: (orderId: string) => void;
  sellerStartPreparing: (orderId: string) => void;
  sellerMarkReady: (orderId: string) => void;
  deliveryAcceptJob: (orderId: string, partnerId: string) => void;
  deliveryConfirmPickup: (orderId: string, partnerId: string) => { ok: boolean; message: string };
  deliveryComplete: (orderId: string, partnerId: string, code: string) => { ok: boolean; message: string };
  openDispute: (input: { orderId: string; reason: string; description: string; evidence?: string[] }) => Dispute | null;
  resolveDispute: (
    disputeId: string,
    kind: "full-refund" | "release" | "split" | "escalate",
    opts?: { splitPct?: number; note?: string },
  ) => void;
  processRefund: (orderId: string) => void;
  approveCredit: (userId: string, limit: number) => void;
  declineCredit: (userId: string, reason?: string) => void;
  setFeatureFlag: (key: string, enabled: boolean) => void;
  fundWallet: (amount: number, source: string) => void;
  toggleAutoFund: (enabled: boolean) => void;
  markNotifRead: (id: string) => void;
  clearNotifs: () => void;
  pushNotif: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  notifyUsers: (userIds: string[], n: Omit<Notification, "id" | "createdAt" | "read" | "userId">) => void;
  audit: (action: string, target?: string) => void;
  resetDemo: () => void;
  setDemoStep: (n: number) => void;

  // Student OS actions
  setSelectedCampus: (campus: string) => void;
  /** Asks the student before changing the active campus. Automatic prompts respect "Not now". */
  requestCampusSwitch: (campus: string, reason: "manual" | "location" | "registered") => void;
  resolveCampusPrompt: (accept: boolean) => void;
  toggleSavedOpportunity: (id: string) => void;
  reportLostFound: (
    input: Omit<LostFoundItem, "id" | "publicDescription" | "maskedFindings" | "status" | "claims" | "timeline" | "createdAt" | "reporterId" | "reporterName">,
  ) => LostFoundItem | null;
  requestClaim: (itemId: string, message: string) => { ok: boolean; message: string };
  requireVerification: (itemId: string, claimId: string) => { ok: boolean; message: string };
  submitClaimProof: (itemId: string, claimId: string, answer: string) => { ok: boolean; message: string };
  approveClaim: (itemId: string, claimId: string) => { ok: boolean; message: string };
  rejectClaim: (itemId: string, claimId: string, reason: string) => { ok: boolean; message: string };
  confirmCollection: (itemId: string, code: string) => { ok: boolean; message: string };
  closeLostFound: (itemId: string) => { ok: boolean; message: string };
  verifyStudent: (data: { studentId: string; institution: string; course?: string; level?: string }) => void;
  addStudentListing: (listing: Omit<StudentListing, "id" | "createdAt">) => StudentListing;
  joinGroupDeal: (dealId: string) => { ok: boolean; message: string };
  setStudentModalOpen: (open: boolean) => void;
  setVerifyModalOpen: (open: boolean) => void;
  incrementResourceDownload: (resourceId: string) => void;

  // Institutional / SRC & Demand Intelligence
  campusEvents: CampusEvent[];
  campusResources: CampusResource[];
  demandLogs: DemandLog[];

  /** Scoped: returns null when the current user lacks the permission for that campus. */
  addCampusEvent: (event: Omit<CampusEvent, "id" | "createdAt"> & { id?: string }) => CampusEvent | null;
  togglePinEvent: (id: string) => boolean;
  deleteCampusEvent: (id: string) => boolean;
  addCampusResource: (res: Omit<CampusResource, "id" | "createdAt" | "downloads">) => CampusResource | null;
  deleteCampusResource: (id: string) => boolean;

  // Institutional staff & permissions
  staffGrants: StaffGrant[];
  /** Does the current user hold `permission` for `campus`? Super admins always do (unless viewing as someone). */
  hasPermission: (permission: Permission, campus: string) => boolean;
  addStaffGrant: (grant: StaffGrant) => { ok: boolean; message: string };
  activateStaffGrant: (grantId: string, userId: string) => { ok: boolean; message: string };
  updateStaffGrant: (grantId: string, patch: Partial<Pick<StaffGrant, "permissions" | "campusId" | "title">>) => { ok: boolean; message: string };
  revokeStaffGrant: (grantId: string) => { ok: boolean; message: string };

  // Seller Intelligence
  intelligence: IntelligenceState;
  setIntelligencePref: (patch: Partial<Pick<IntelligenceState, "campus" | "tab">>) => void;
  dismissInsight: (id: string) => void;
  restoreInsights: () => void;
  saveBundleDraft: (draft: BundleDraft) => void;
  /** Owner-checked catalog edit. status 403 when the product isn't in the caller's store. */
  sellerUpdateProduct: (productId: string, patch: { price?: number; stockDelta?: number }) => { ok: boolean; status: 200 | 403 | 404; message: string };
  setStoreSubscription: (storeId: string, tier: Tier) => { ok: boolean; status: 200 | 403 | 404; message: string };
  requestSubscriptionUpgrade: (storeId: string, tier: Tier) => void;

  // Tickets
  tickets: Ticket[];
  issueTicket: (ticket: Ticket) => void;
  checkInTicket: (token: string) => { ok: boolean; message: string; ticket?: Ticket };

  // View-as
  impersonation: ImpersonationSession | null;
  impersonationSessions: ImpersonationSession[];
  /** Admin identity to restore on Exit View. */
  adminReturn: { userId: string; role: Role } | null;
  startImpersonation: (input: { targetUserId: string; role: Role; reason: string; sessionId?: string; minutes?: number }) => { ok: boolean; message: string };
  endImpersonation: (reason?: "exit" | "expired") => ImpersonationSession | null;
  logDemandSearch: (query: string, campus?: string, resultsCount?: number) => void;
}

function initialState() {
  return {
    currentUserId: null as string | null,
    role: "guest" as Role,
    users: seedUsers,
    stores: seedStores,
    products: seedProducts,
    promos: seedPromos,
    cart: [] as CartItem[],
    wishlist: [] as string[],
    wallets: {
      u_buyer1: seedWallet("u_buyer1", 4200, 0),
      u_buyer2: seedWallet("u_buyer2", 380, 0),
      u_buyer3: seedWallet("u_buyer3", 15600, 0),
      u_buyer4: seedWallet("u_buyer4", 120, 0),
      u_seller1: seedWallet("u_seller1", 0, 0),
      u_seller2: seedWallet("u_seller2", 0, 0),
      u_seller3: seedWallet("u_seller3", 0, 0),
      u_delivery1: seedWallet("u_delivery1", 0, 0),
    } as Record<string, Wallet>,
    orders: [] as Order[],
    reservations: [] as Reservation[],
    installments: [] as InstallmentPlan[],
    searchEvents: [] as SearchEvent[],
    productRequests: seedProductRequests,
    priceAlerts: [] as PriceAlert[],
    disputes: [] as Dispute[],
    deliveries: [] as Delivery[],
    notifications: [
      { id: uid(), userId: "u_buyer1", type: "flash-sale", title: "Flash sale started", body: "iPhone 16 Pro Max is 12% off for 8 hours.", createdAt: SEED_EPOCH - 3600_000, read: false, link: "/buyer" },
      { id: uid(), userId: "u_buyer1", type: "price-drop", title: "Price drop on wishlist", body: "Sony headphones dropped to GHS 1,980.", createdAt: SEED_EPOCH - 7200_000, read: false, link: "/buyer" },
    ] as Notification[],
    messages: [] as Message[],
    auditLog: [] as { id: string; at: number; actor: string; action: string; target?: string }[],
    escrowLedger: [] as EscrowRecord[],
    paymentIntents: {} as Record<string, LocalPaymentIntent>,
    featureFlags: {
      brandStudio: true,
      priceIntelligence: true,
      takeNowPayLater: true,
      reservePay: true,
      fraudHardBlock: false,
    } as Record<string, boolean>,
    demoStep: 0,

    // Student OS state
    selectedCampus: "All Campuses",
    registeredInstitution: "UG - Legon" as string | null,
    campusPrompt: null as { campus: string; reason: "manual" | "location" | "registered" } | null,
    campusPromptSnooze: {} as Record<string, number>,
    lostFound: SEED_LOST_FOUND,
    savedOpportunities: [] as string[],
    studentProfile: {
      isVerified: true,
      studentId: "10984523",
      institution: "UG - Legon",
      course: "BSc. Computer Science",
      level: "Level 300",
      verifiedAt: SEED_EPOCH - 15 * 86400000,
    },
    studentListings: seedStudentListings,
    studentModalOpen: false,
    verifyModalOpen: false,
    resourceDownloads: {} as Record<string, number>,

    // Institutional / SRC & Demand Intelligence
    campusEvents: SEED_CAMPUS_EVENTS,
    staffGrants: SEED_STAFF_GRANTS,
    tickets: [] as Ticket[],
    intelligence: { dismissed: {}, applied: [], bundles: [], upgradeRequests: [] } as IntelligenceState,
    impersonation: null as ImpersonationSession | null,
    impersonationSessions: [] as ImpersonationSession[],
    adminReturn: null as { userId: string; role: Role } | null,
    campusResources: SEED_CAMPUS_RESOURCES,
    demandLogs: SEED_DEMAND_LOGS,
  };
}

const tpl = (id: string) => STAFF_TEMPLATES.find((t) => t.id === id)!;
const SEED_STAFF_GRANTS: StaffGrant[] = [
  { id: "sg_ug_president", userId: "u_src1", email: "esi@src.ug.gh", name: "Esi SRC", title: tpl("src_president").title, role: "src_head", institutionId: "ug", campusId: "UG - Legon", permissions: tpl("src_president").permissions, status: "active", invitedBy: "u_super1", createdAt: SEED_EPOCH - 30 * 86_400_000, acceptedAt: SEED_EPOCH - 29 * 86_400_000 },
  { id: "sg_knust_president", userId: "u_src2", email: "kwabena@src.knust.gh", name: "Kwabena Asante", title: tpl("src_president").title, role: "src_head", institutionId: "knust", campusId: "KNUST - Kumasi", permissions: tpl("src_president").permissions, status: "active", invitedBy: "u_super1", createdAt: SEED_EPOCH - 30 * 86_400_000, acceptedAt: SEED_EPOCH - 28 * 86_400_000 },
  { id: "sg_ug_dean", userId: "u_dean1", email: "dean.students@ug.edu.gh", name: "Prof. Grace Adjei", title: tpl("dean_students").title, role: "dean", institutionId: "ug", campusId: "*", permissions: tpl("dean_students").permissions, status: "active", invitedBy: "u_super1", createdAt: SEED_EPOCH - 60 * 86_400_000, acceptedAt: SEED_EPOCH - 59 * 86_400_000 },
];

const SEED_LOST_FOUND: LostFoundItem[] = (() => {
  const mk = (x: Omit<LostFoundItem, "publicDescription" | "maskedFindings" | "claims" | "timeline" | "photoShielded"> & { photoShielded?: boolean }): LostFoundItem => {
    const shield = maskSensitive(x.description);
    return {
      photoShielded: false,
      ...x,
      publicDescription: shield.text,
      maskedFindings: shield.findings.map((f) => `${f.count} ${SENSITIVE_LABEL[f.kind]}`),
      claims: [],
      timeline: [{ at: x.createdAt, status: x.status, note: x.kind === "found" ? "Found item reported" : "Lost item reported", actor: x.kind === "found" ? "finder" : "claimant" }],
    };
  };
  return [
    mk({ id: "lf_seed_id", kind: "found", title: "UG student ID card", category: "ID / Student card", description: "Blue UG student ID, name starts with K. Student number 10984577 printed under the photo. Also has a Ghana Card GHA-728361945-3 tucked behind it.", campus: "UG - Legon", location: "Balme Library, 2nd floor reading room", date: "2026-10-01", reporterId: "u_src1", reporterName: "Esi SRC", verificationQuestion: "What's written on the lanyard?", verificationAnswer: "Legon Hall", handoverPoint: "SRC Office, JQB", photoShielded: true, status: "found", createdAt: SEED_EPOCH - 2 * 86_400_000 }),
    mk({ id: "lf_seed_pods", kind: "found", title: "White earbuds case", category: "Other", description: "Wireless earbuds in a white case with a small sticker. Found under a seat after the 10:30 lecture.", campus: "UG - Legon", location: "N Block LT 2", date: "2026-10-02", reporterId: "u_buyer3", reporterName: "Efua Boateng", verificationQuestion: "What is the sticker on the case?", verificationAnswer: "a star", handoverPoint: "N Block porter's desk", status: "found", createdAt: SEED_EPOCH - 86_400_000 }),
    mk({ id: "lf_seed_bag", kind: "lost", title: "Black backpack with laptop", category: "Bag", description: "Black backpack, HP laptop inside, call 024 555 1201 if found.", campus: "UG - Legon", location: "Night Market bus stop", date: "2026-09-30", reporterId: "u_buyer2", reporterName: "Kwame Mensah", status: "open", createdAt: SEED_EPOCH - 3 * 86_400_000 }),
  ];
})();

/** Store owners (seller user ids) of the given products. */
function sellersOf(s: Pick<State, "products" | "stores">, productIds: string[]): string[] {
  return Array.from(
    new Set(
      productIds
        .map((pid) => s.products.find((p) => p.id === pid)?.storeId)
        .map((sid) => s.stores.find((st) => st.id === sid)?.ownerId)
        .filter((x): x is string => !!x),
    ),
  );
}

/** An order may ship once every plan's delivery rule is met and no reservation is unpaid. */
export function orderDeliveryUnlocked(order: Order, plans: InstallmentPlan[], reservations: Reservation[]): boolean {
  const planOk = plans
    .filter((p) => p.orderId === order.id)
    .every((p) =>
      deliveryUnlocked(
        {
          deliveryRule: p.deliveryRule,
          deliverAfterInstallments: p.deliverAfterInstallments,
          entries: p.schedule.map((e) => ({ seq: e.seq, kind: e.kind, dueAt: e.due, graceUntil: e.graceUntil, amountMinor: 0 })),
        },
        p.schedule.filter((e) => e.paid).map((e) => e.seq),
      ),
    );
  const reservationOk = !reservations.some((r) => r.orderId === order.id && r.status === "active");
  return planOk && reservationOk;
}

export const useNaflis = create<State>()(
  persist(
    (set, get) => {
      /** Releases a demo-mode reservation: stock back, order cancelled, fee refunded or forfeited per terms. */
      const expireReservation = (reservationId: string, outcome: "expired" | "cancelled", now: number) => {
        const s = get();
        const r = s.reservations.find((x) => x.id === reservationId);
        if (!r || r.status !== "active") return;
        const refundFee = r.refundOnExpiry;
        const w = { ...(s.wallets[r.buyerId] ?? seedWallet(r.buyerId, 0)) };
        w.escrow = Math.max(0, w.escrow - r.fee);
        if (refundFee) {
          w.balance += r.fee;
          w.transactions = [
            { id: uid(), type: "refund", amount: r.fee, balanceAfter: w.balance, description: `Reservation fee refunded (${r.orderId.slice(0, 8)})`, createdAt: now, orderId: r.orderId },
            ...w.transactions,
          ];
        }
        set({
          reservations: s.reservations.map((x) => (x.id === r.id ? { ...x, status: outcome } : x)),
          products: s.products.map((p) => (p.id === r.productId ? { ...p, stock: p.stock + r.qty } : p)),
          wallets: { ...s.wallets, [r.buyerId]: w },
          notifications: [
            {
              id: uid(), userId: r.buyerId, type: "reservation", createdAt: now, read: false, link: "/buyer/reserve",
              title: outcome === "expired" ? "Reservation expired" : "Reservation cancelled",
              body: refundFee
                ? `Your hold ended and the GHS ${r.fee.toLocaleString()} fee was refunded to your wallet.`
                : `Your hold ended. The GHS ${r.fee.toLocaleString()} reservation fee is non-refundable.`,
            },
            ...s.notifications,
          ],
        });
        get().advanceOrder(r.orderId, "cancelled", outcome === "expired" ? "Reservation expired — stock released" : "Reservation cancelled by buyer", "system");
      };

      /** Super admin by the account actually signed in — never true while viewing as someone else. */
      const isRealSuperAdmin = () => {
        const s = get();
        if (s.impersonation) return false;
        return resolveRoles(s.users.find((u) => u.id === s.currentUserId), s.stores).includes("super_admin");
      };
      const canEditEvent = (e: CampusEvent) =>
        get().hasPermission(e.kind === "announcement" ? "student.announcements.create" : "student.events.create", e.campus);

      /** The current user's role relative to a found item. */
      const lfActorFor = (item: LostFoundItem): LfActor => {
        const s = get();
        if (item.reporterId === s.currentUserId) return "finder";
        if (["src_head", "admin", "super_admin"].includes(s.role)) return "desk";
        return "claimant";
      };

      /** Applies one claim-lifecycle step if the state machine allows it for this actor. */
      const lfMove = (
        itemId: string,
        to: FoundStatus,
        actor: LfActor,
        note: string,
        patchItem?: (item: LostFoundItem) => Partial<LostFoundItem>,
        notify?: { userId: string; title: string; body: string },
      ): { ok: boolean; message: string } => {
        const s = get();
        const item = s.lostFound.find((x) => x.id === itemId);
        if (!item || item.kind !== "found") return { ok: false, message: "Item not found." };
        const from = item.status as FoundStatus;
        if (!canClaimTransition(from, to, actor)) {
          return { ok: false, message: `Can't go from "${FOUND_STATUS_LABEL[from]}" to "${FOUND_STATUS_LABEL[to]}" as ${actor}.` };
        }
        const now = Date.now();
        set({
          lostFound: s.lostFound.map((x) =>
            x.id === itemId ? { ...x, ...(patchItem?.(x) ?? {}), status: to, timeline: [...x.timeline, { at: now, status: to, note, actor }] } : x,
          ),
          notifications: notify
            ? [{ id: uid(), userId: notify.userId, type: "lost-found", createdAt: now, read: false, link: "/student-os/lost-found", title: notify.title, body: notify.body }, ...s.notifications]
            : s.notifications,
        });
        return { ok: true, message: FOUND_STATUS_LABEL[to] };
      };

      return {
      ...initialState(),

      setRole: (r) => {
        const map: Record<Role, string | null> = {
          guest: null, buyer: "u_buyer1", seller: "u_seller1", student: "u_buyer1", src_head: "u_src1", dean: "u_dean1",
          delivery: "u_delivery1", finance: "u_finance1", dispute: "u_dispute1",
          admin: "u_admin1", super_admin: "u_super1",
        };
        set({ role: r, currentUserId: map[r] ?? get().currentUserId });
      },
      switchRole: (r) => {
        const s = get();
        const user = s.users.find((u) => u.id === s.currentUserId);
        if (!resolveRoles(user, s.stores).includes(r)) return false;
        if (s.role !== r) set({ role: r });
        return true;
      },
      enterContext: (allowed) => {
        const s = get();
        if (allowed.includes(s.role)) return true;
        const user = s.users.find((u) => u.id === s.currentUserId);
        const match = resolveRoles(user, s.stores).find((r) => allowed.includes(r));
        if (!match) return false;
        set({ role: match });
        return true;
      },
      grantRole: (r, userId) =>
        set((s) => {
          const id = userId ?? s.currentUserId;
          if (!id) return {};
          return {
            users: s.users.map((u) =>
              u.id === id && !(u.roles ?? []).includes(r) ? { ...u, roles: [...(u.roles ?? []), r] } : u,
            ),
            auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId ?? "system", action: "role.grant", target: `${id}:${r}` }, ...s.auditLog],
          };
        }),
      revokeRole: (r, userId) =>
        set((s) => {
          const id = userId ?? s.currentUserId;
          if (!id || r === "buyer") return {};
          const users = s.users.map((u) => (u.id === id ? { ...u, roles: (u.roles ?? []).filter((x) => x !== r) } : u));
          const stillHeld = resolveRoles(users.find((u) => u.id === id), s.stores).includes(r);
          return {
            users,
            // Never leave the user in a context they no longer hold.
            role: id === s.currentUserId && s.role === r && !stillHeld ? "buyer" : s.role,
            auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId ?? "system", action: "role.revoke", target: `${id}:${r}` }, ...s.auditLog],
          };
        }),
      openShop: () => {
        const s = get();
        const user = s.users.find((u) => u.id === s.currentUserId);
        if (!user) return;
        // With Supabase the shop itself is created by the vendor onboarding form in /seller.
        if (!supabase && !s.stores.some((st) => st.ownerId === user.id)) {
          set({
            stores: [
              ...s.stores,
              {
                id: "s_" + uid(), name: `${user.name.split(" ")[0]}'s Shop`, ownerId: user.id, logo: user.avatar,
                tagline: "Just getting started.", rating: 0, reviews: 0, verified: false, followers: 0,
                location: user.region, categories: [], subscription: "starter",
              },
            ],
          });
        }
        get().grantRole("seller");
        set({ role: "seller" });
      },
      refreshRoles: async () => {
        const id = get().currentUserId;
        if (!supabase || !id) return;
        try {
          const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
          if (error || !data || get().currentUserId !== id) return;
          const fetched: Role[] = [data.role, ...(Array.isArray(data.roles) ? data.roles : [])]
            .filter(Boolean)
            .map(normalizeRole);
          set((s) => ({
            users: s.users.map((u) =>
              u.id === id
                ? { ...u, roles: Array.from(new Set([...(u.roles ?? []), ...fetched])), institutionId: data.institution_id ?? u.institutionId }
                : u,
            ),
          }));
        } catch {
          // offline / column not migrated yet — keep local roles
        }
      },
      setUser: (id) => set({ currentUserId: id }),
      signIn: (userId) => {
        const user = get().users.find((u) => u.id === userId);
        if (user) {
          set({ currentUserId: userId, role: user.role });
        }
      },
      signOut: () => {
        const s = get();
        if (s.impersonation) get().endImpersonation("exit");
        set({ currentUserId: null, role: "guest", impersonation: null, adminReturn: null });
      },
      syncUser: (sessionUser) => {
        if (!sessionUser) {
          set({ currentUserId: null, role: "guest" });
          return;
        }

        const id = sessionUser.id;
        const email = sessionUser.email || "";
        const role = normalizeRole(sessionUser.user_metadata?.role);
        const metaRoles: Role[] = Array.isArray(sessionUser.user_metadata?.roles)
          ? sessionUser.user_metadata.roles.map(normalizeRole)
          : [];
        const name = sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || email.split("@")[0];
        const phone = sessionUser.user_metadata?.phone || sessionUser.phone || "";

        set((state) => {
          const exists = state.users.find((u) => u.id === id);
          const updatedUsers = exists
            ? state.users.map((u) =>
                u.id === id
                  ? { ...u, name, email, phone, role, roles: Array.from(new Set([...(u.roles ?? []), role, ...metaRoles])) }
                  : u,
              )
            : [
                ...state.users,
                {
                  id,
                  name,
                  email,
                  phone,
                  region: "Greater Accra",
                  role,
                  roles: Array.from(new Set([role, ...metaRoles])),
                  avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${id}`,
                  verified: true,
                  creditScore: 700,
                  creditLimit: role === "buyer" ? 5000 : 0,
                  tags: ["verified"],
                },
              ];

          // Initialize wallet for new users if they don't have one
          const wallets = { ...state.wallets };
          if (!wallets[id]) {
            wallets[id] = seedWallet(id, 1000); // Pre-fund real user with GHS 1,000 for demo shopping
          }

          // Auth events (token refresh, tab focus) re-run this for the same user:
          // keep whichever context they switched to as long as they still hold it.
          const held = resolveRoles(updatedUsers.find((u) => u.id === id), state.stores);
          const keepContext = state.currentUserId === id && held.includes(state.role);

          return {
            currentUserId: id,
            role: keepContext ? state.role : role,
            users: updatedUsers,
            wallets,
          };
        });
        void get().refreshRoles();
      },
      addToCart: (productId, qty = 1, opt, method) =>
        set((s) => {
          const ex = s.cart.find((c) => c.productId === productId);
          if (ex) {
            return {
              cart: s.cart.map((c) =>
                c.productId === productId ? { ...c, qty: method && method !== "full" ? 1 : c.qty + qty, method: method ?? c.method } : c,
              ),
            };
          }
          return { cart: [...s.cart, { productId, qty: method && method !== "full" ? 1 : qty, paymentOption: opt, method }] };
        }),
      setCartMethod: (productId, method) =>
        set((s) => ({ cart: s.cart.map((c) => (c.productId === productId ? { ...c, method, qty: method === "full" ? c.qty : 1 } : c)) })),
      removeFromCart: (productId) => set((s) => ({ cart: s.cart.filter((c) => c.productId !== productId) })),
      updateCartQty: (productId, qty) =>
        set((s) => ({ cart: s.cart.map((c) => (c.productId === productId ? { ...c, qty: Math.max(1, qty) } : c)) })),
      clearCart: () => set({ cart: [] }),
      toggleWishlist: (productId) =>
        set((s) => ({
          wishlist: s.wishlist.includes(productId)
            ? s.wishlist.filter((x) => x !== productId)
            : [...s.wishlist, productId],
        })),
      setPriceAlert: (productId, target) =>
        set((s) => ({
          priceAlerts: [
            ...s.priceAlerts,
            { id: uid(), buyerId: s.currentUserId, productId, target, createdAt: Date.now(), triggered: false },
          ],
        })),
      recordSearch: (query, matches) =>
        set((s) => ({
          searchEvents: [
            { id: uid(), buyerId: s.currentUserId, query, region: "Greater Accra", matches, createdAt: Date.now() },
            ...s.searchEvents,
          ].slice(0, 200),
        })),
      createProductRequest: (data) =>
        set((s) => ({
          productRequests: [
            {
              ...data,
              id: "pr_" + uid(),
              buyerId: s.currentUserId,
              buyerName: s.users.find((u) => u.id === s.currentUserId)?.name ?? "Buyer",
              interestedBuyers: 1 + Math.floor(Math.random() * 40),
              createdAt: Date.now(),
            },
            ...s.productRequests,
          ],
        })),
      applyPromo: (code, subtotal) => {
        const promo = get().promos.find((p) => p.code.toUpperCase() === code.toUpperCase() && p.active);
        if (!promo) return { ok: false, discount: 0, message: "Promo code not found or expired." };
        if (promo.minSpend && subtotal < promo.minSpend)
          return { ok: false, discount: 0, message: `Minimum spend of GHS ${promo.minSpend} required.` };
        let discount = 0;
        if (promo.type === "percent") discount = Math.min((subtotal * promo.value) / 100, promo.maxDiscount ?? Infinity);
        else if (promo.type === "fixed") discount = promo.value;
        else if (promo.type === "free-shipping") discount = promo.value;
        return { ok: true, discount, message: `Applied: ${promo.description}`, promo };
      },
      recordPaymentIntent: (intent) =>
        set((s) => ({ paymentIntents: { ...s.paymentIntents, [`${intent.userId}:${intent.idempotencyKey}`]: intent } })),

      applySettlement: (st) => {
        const s = get();
        const now = Date.now();
        const order = st.order;
        const sellerIds = sellersOf(s, order.items.map((i) => i.productId));
        const wallets = { ...s.wallets };
        if (st.wallet) {
          const w = { ...(wallets[order.buyerId] ?? seedWallet(order.buyerId, 0)) };
          w.balance = st.wallet.balance;
          w.escrow = st.wallet.escrow;
          if (st.walletTx?.length) w.transactions = [...st.walletTx, ...w.transactions];
          wallets[order.buyerId] = w;
        }
        const isCheckout = st.kind !== "update";
        const purchased = new Set(isCheckout ? order.items.map((i) => i.productId) : []);
        const deltas = new Map((st.stockDeltas ?? []).map((d) => [d.productId, d.delta]));
        const upsert = <T extends { id: string }>(list: T[], incoming: T[]) => [
          ...incoming.filter((x) => !list.some((y) => y.id === x.id)),
          ...list.map((y) => incoming.find((x) => x.id === y.id) ?? y),
        ];
        const paid = order.status === "paid";
        const short = order.id.slice(0, 8);
        const notifs: Notification[] = !isCheckout ? [] : [
          {
            id: uid(), userId: order.buyerId, type: "order", createdAt: now, read: false, link: `/buyer/orders/${order.id}`,
            title: paid ? "Payment confirmed — funds in escrow" : "Reservation confirmed",
            body: paid
              ? `Order ${short} is paid (GHS ${(order.amountPaid ?? order.total).toLocaleString()} collected).`
              : `Order ${short} is held for you. Complete payment before the reservation expires.`,
          },
          ...sellerIds.map((sid) => ({
            id: uid(), userId: sid, type: "new-order", createdAt: now, read: false, link: "/seller",
            title: paid ? "New paid order" : "Item reserved",
            body: paid ? `Order ${short} is paid and awaiting acceptance.` : `A buyer reserved stock on order ${short}.`,
          })),
          { id: uid(), userId: "u_admin1", type: "order", createdAt: now, read: false, link: "/admin", title: "New GMV recorded", body: `Order ${short} · GHS ${order.total.toLocaleString()}.` },
        ];
        set({
          orders: s.orders.some((o) => o.id === order.id) ? s.orders.map((o) => (o.id === order.id ? order : o)) : [order, ...s.orders],
          installments: upsert(s.installments, st.plans),
          reservations: upsert(s.reservations, st.reservations),
          escrowLedger: [...(st.escrowRecords ?? []), ...s.escrowLedger],
          wallets,
          products: deltas.size ? s.products.map((p) => (deltas.has(p.id) ? { ...p, stock: Math.max(0, p.stock + deltas.get(p.id)!) } : p)) : s.products,
          cart: s.cart.filter((c) => !purchased.has(c.productId)),
          notifications: [...notifs, ...s.notifications],
          auditLog: isCheckout ? [{ id: uid(), at: now, actor: order.buyerId, action: "order.paid", target: order.id }, ...s.auditLog] : s.auditLog,
        });
      },

      applyPlanPayment: (st) =>
        set((s) => {
          const plan = s.installments.find((p) => p.id === st.planId);
          if (!plan) return {};
          const schedule = plan.schedule.map((e) =>
            st.seqs.includes(e.seq) && !e.paid ? { ...e, paid: true, paidAt: st.at, late: st.at > e.graceUntil } : e,
          );
          const paidTotal = schedule.filter((e) => e.paid).reduce((a, e) => a + e.amount, 0);
          const overdue = schedule.some((e) => !e.paid && e.graceUntil < st.at);
          const updated: InstallmentPlan = {
            ...plan,
            schedule,
            paid: paidTotal,
            status: schedule.every((e) => e.paid) ? "completed" : overdue ? "late" : "active",
          };
          const installments = s.installments.map((p) => (p.id === plan.id ? updated : p));
          const wallets = { ...s.wallets };
          if (st.wallet) {
            const w = { ...(wallets[plan.buyerId] ?? seedWallet(plan.buyerId, 0)) };
            w.balance = st.wallet.balance;
            w.escrow = st.wallet.escrow;
            if (st.walletTx?.length) w.transactions = [...st.walletTx, ...w.transactions];
            wallets[plan.buyerId] = w;
          }
          const escrowAdd = plan.kind === "installment" ? st.amount : 0;
          const orders = s.orders.map((o) =>
            o.id === plan.orderId
              ? {
                  ...o,
                  amountPaid: (o.amountPaid ?? 0) + st.amount,
                  escrowHeld: (o.escrowHeld ?? 0) + escrowAdd,
                  amountOutstanding: Math.max(0, (o.amountOutstanding ?? 0) - st.amount),
                  deliveryUnlocked: orderDeliveryUnlocked(o, installments, s.reservations),
                  timeline: [...o.timeline, { at: st.at, status: o.status, note: `${plan.kind === "credit" ? "Credit repayment" : "Installment"} of GHS ${st.amount.toLocaleString()} received` }],
                }
              : o,
          );
          return {
            installments,
            wallets,
            orders,
            notifications: [
              {
                id: uid(), userId: plan.buyerId, type: "installment", createdAt: st.at, read: false, link: "/buyer/installments",
                title: updated.status === "completed" ? "Plan fully paid" : "Payment received",
                body: updated.status === "completed"
                  ? `Your plan for order ${plan.orderId.slice(0, 8)} is complete.`
                  : `GHS ${st.amount.toLocaleString()} applied to your plan.`,
              },
              ...s.notifications,
            ],
          };
        }),

      applyReservationPayment: (st) => {
        const s = get();
        const r = s.reservations.find((x) => x.id === st.reservationId);
        if (!r) return;
        const reservations = s.reservations.map((x) => (x.id === r.id ? { ...x, status: "converted" as const, balance: 0 } : x));
        const wallets = { ...s.wallets };
        if (st.wallet) {
          const w = { ...(wallets[r.buyerId] ?? seedWallet(r.buyerId, 0)) };
          w.balance = st.wallet.balance;
          w.escrow = st.wallet.escrow;
          if (st.walletTx?.length) w.transactions = [...st.walletTx, ...w.transactions];
          wallets[r.buyerId] = w;
        }
        set({
          reservations,
          wallets,
          orders: s.orders.map((o) =>
            o.id === r.orderId
              ? {
                  ...o,
                  amountPaid: (o.amountPaid ?? 0) + st.amount,
                  escrowHeld: (o.escrowHeld ?? 0) + st.amount,
                  amountOutstanding: Math.max(0, (o.amountOutstanding ?? 0) - st.amount),
                  deliveryUnlocked: orderDeliveryUnlocked(o, s.installments, reservations),
                }
              : o,
          ),
        });
        get().advanceOrder(r.orderId, "paid", `Reservation balance of GHS ${st.amount.toLocaleString()} paid — funds in escrow`, "system");
      },

      runSchedulers: (now = Date.now()) => {
        const s = get();
        const localOrder = (id: string) => !s.orders.find((o) => o.id === id)?.serverBacked;
        const due = s.reservations.filter((r) => r.status === "active" && r.autoExpire && r.expiresAt <= now && localOrder(r.orderId));
        const lateIds = s.installments
          .filter((p) => (p.status === "active" || p.status === "late") && localOrder(p.orderId))
          .filter((p) => p.schedule.some((e) => !e.paid && !e.late && e.graceUntil < now))
          .map((p) => p.id);
        if (!due.length && !lateIds.length) return;

        for (const r of due) expireReservation(r.id, "expired", now);
        if (lateIds.length) {
          set((st) => ({
            installments: st.installments.map((p) =>
              lateIds.includes(p.id)
                ? { ...p, status: "late" as const, schedule: p.schedule.map((e) => (!e.paid && e.graceUntil < now ? { ...e, late: true } : e)) }
                : p,
            ),
            notifications: [
              ...lateIds.map((id) => {
                const p = st.installments.find((x) => x.id === id)!;
                return {
                  id: uid(), userId: p.buyerId, type: "installment", createdAt: now, read: false, link: "/buyer/installments",
                  title: "Installment overdue",
                  body: `A payment on order ${p.orderId.slice(0, 8)} is past its grace period. A ${p.lateFeePct}% late fee may apply.`,
                };
              }),
              ...st.notifications,
            ],
          }));
        }
      },

      cancelReservation: (reservationId) => expireReservation(reservationId, "cancelled", Date.now()),

      advanceOrder: (orderId, status, note, actor) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order) return false;
        const machineActor = (["system", "buyer", "seller", "delivery", "dispute", "admin"] as const).find((a) => a === actor) as
          | OrderActor
          | undefined;
        if (!canTransition(order.status, status, machineActor)) {
          console.warn(`Rejected order transition ${order.status} → ${status}`, { orderId, actor });
          return false;
        }
        if (status === "dispatched" && order.deliveryUnlocked === false) return false;
        const now = Date.now();

        // Resolve unique sellers for this order
        const sellerIds = Array.from(
          new Set(
            order.items
              .map((it) => s.products.find((p) => p.id === it.productId)?.storeId)
              .map((sid) => s.stores.find((st) => st.id === sid)?.ownerId)
              .filter((x): x is string => !!x),
          ),
        );

        const notifications: Notification[] = [];
        const pushN = (userId: string, title: string, body: string, link?: string, type = "order") => {
          notifications.push({ id: uid(), userId, type, title, body, createdAt: now, read: false, link });
        };

        // State-driven fanout
        switch (status) {
          case "accepted":
            pushN(order.buyerId, "Order accepted", `Seller accepted your order ${orderId.slice(0, 8)}.`, `/buyer/orders/${orderId}`);
            break;
          case "processing":
            pushN(order.buyerId, "Order is being prepared", `Your order ${orderId.slice(0, 8)} is being packed.`, `/buyer/orders/${orderId}`);
            break;
          case "ready":
            pushN(order.buyerId, "Ready for pickup", `A delivery partner is being assigned to ${orderId.slice(0, 8)}.`, `/buyer/orders/${orderId}`);
            pushN("u_delivery1", "New delivery job available", `Order ${orderId.slice(0, 8)} · fee GHS ${order.delivery}.`, "/delivery", "delivery");
            break;
          case "dispatched":
            pushN(order.buyerId, "On the way", `Your order is out for delivery.`, `/buyer/orders/${orderId}`, "delivery");
            for (const sid of sellerIds) pushN(sid, "Order picked up", `Partner picked up order ${orderId.slice(0, 8)}.`, "/seller");
            break;
          case "delivered":
            pushN(order.buyerId, "Delivered", `Order ${orderId.slice(0, 8)} was delivered.`, `/buyer/orders/${orderId}`, "delivery");
            break;
          case "completed":
            pushN(order.buyerId, "Order completed", `Escrow released for ${orderId.slice(0, 8)}. Thank you!`, `/buyer/orders/${orderId}`);
            for (const sid of sellerIds) pushN(sid, "Settlement credited", `Escrow released for ${orderId.slice(0, 8)}.`, "/seller", "settlement");
            pushN("u_finance1", "Escrow released", `Order ${orderId.slice(0, 8)} released to seller(s).`, "/finance", "settlement");
            break;
          case "refunded":
            pushN(order.buyerId, "Refund issued", `Order ${orderId.slice(0, 8)} was refunded to your wallet.`, `/buyer/orders/${orderId}`, "refund");
            for (const sid of sellerIds) pushN(sid, "Order refunded", `${orderId.slice(0, 8)} was refunded.`, "/seller", "refund");
            break;
          case "cancelled":
            pushN(order.buyerId, "Order cancelled", `Order ${orderId.slice(0, 8)} was cancelled.`, `/buyer/orders/${orderId}`);
            for (const sid of sellerIds) pushN(sid, "Order cancelled", `Order ${orderId.slice(0, 8)} was cancelled.`, "/seller");
            break;
        }

        set({
          orders: s.orders.map((o) =>
            o.id === orderId
              ? { ...o, status, timeline: [...o.timeline, { at: now, status, note, actor }] }
              : o,
          ),
          notifications: [...notifications, ...s.notifications],
          auditLog: [
            { id: uid(), at: now, actor: actor ?? s.currentUserId ?? "system", action: `order.${status}`, target: orderId },
            ...s.auditLog,
          ],
        });
        return true;
      },

      sellerAcceptOrder: (orderId) => {
        get().advanceOrder(orderId, "accepted", "Seller accepted the order", "seller");
      },
      sellerStartPreparing: (orderId) => {
        get().advanceOrder(orderId, "processing", "Seller preparing the shipment", "seller");
      },
      sellerMarkReady: (orderId) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order) return;
        const buyer = s.users.find((u) => u.id === order.buyerId);
        const first = s.products.find((p) => p.id === order.items[0]?.productId);
        const delivery: Delivery = {
          id: "dv_" + uid(),
          orderId,
          pickup: first?.location ?? "Accra",
          dropoff: buyer?.region ?? "Greater Accra",
          fee: order.delivery,
          status: "unassigned",
          code: "",
          createdAt: Date.now(),
        };
        if (!get().advanceOrder(orderId, "ready", "Packed and ready for pickup", "seller")) return;
        set((st) => ({ deliveries: [delivery, ...st.deliveries] }));
      },

      deliveryAcceptJob: (orderId, partnerId) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order || order.deliveryPartnerId) return;
        // Deterministic 6-digit code
        let h = 0;
        for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
        const code = String((h % 900000) + 100000);
        set({
          orders: s.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  deliveryPartnerId: partnerId,
                  deliveryCode: code,
                  timeline: [...o.timeline, { at: Date.now(), status: o.status, note: "Delivery job accepted", actor: partnerId }],
                }
              : o,
          ),
          deliveries: s.deliveries.map((d) => (d.orderId === orderId ? { ...d, partnerId, code, status: "assigned" as const } : d)),
          auditLog: [{ id: uid(), at: Date.now(), actor: partnerId, action: "delivery.accept", target: orderId }, ...s.auditLog],
        });
      },
      deliveryConfirmPickup: (orderId, partnerId) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (order?.deliveryUnlocked === false) {
          return { ok: false, message: "Dispatch is locked until the buyer's payment plan allows delivery." };
        }
        if (!get().advanceOrder(orderId, "dispatched", "Package picked up from seller", "delivery")) {
          return { ok: false, message: "This order isn't ready for pickup." };
        }
        set((s) => ({
          deliveries: s.deliveries.map((d) => (d.orderId === orderId ? { ...d, status: "picked-up" as const } : d)),
        }));
        return { ok: true, message: "Pickup confirmed" };
      },
      deliveryComplete: (orderId, partnerId, code) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order) return { ok: false, message: "Order not found" };
        if (order.status !== "dispatched") return { ok: false, message: "Only dispatched orders can be delivered." };
        if (order.deliveryCode && code.trim() !== order.deliveryCode) {
          return { ok: false, message: "Delivery code does not match. Ask the buyer to check their app." };
        }
        // Guard against double release
        const alreadyReleased = s.escrowLedger.some(
          (e) => e.orderId === orderId && (e.status === "released" || e.status === "refunded" || e.status === "split"),
        );

        const now = Date.now();
        // Buyer wallet: release escrow hold
        const buyerWallet = { ...s.wallets[order.buyerId] };
        if (!alreadyReleased) {
          buyerWallet.escrow = Math.max(0, buyerWallet.escrow - (order.escrowHeld ?? order.total));
          buyerWallet.transactions = [
            { id: uid(), type: "escrow-out", amount: order.total, balanceAfter: buyerWallet.balance, description: `Escrow released for order ${orderId}`, createdAt: now, orderId },
            ...buyerWallet.transactions,
          ];
        }

        // Credit sellers from their escrow records
        const newWallets: Record<string, Wallet> = { ...s.wallets, [order.buyerId]: buyerWallet };
        const newLedger = s.escrowLedger.map((rec) => {
          if (rec.orderId !== orderId || rec.status !== "held") return rec;
          const sw = { ...(newWallets[rec.sellerId] ?? seedWallet(rec.sellerId, 0)) };
          sw.balance += rec.sellerNet;
          sw.transactions = [
            { id: uid(), type: "credit", amount: rec.sellerNet, balanceAfter: sw.balance, description: `Settlement for order ${orderId}`, createdAt: now, orderId },
            ...sw.transactions,
          ];
          newWallets[rec.sellerId] = sw;
          // Delivery partner fee
          if (partnerId) {
            const dw = { ...(newWallets[partnerId] ?? seedWallet(partnerId, 0)) };
            dw.balance += rec.deliveryFee;
            dw.transactions = [
              { id: uid(), type: "credit", amount: rec.deliveryFee, balanceAfter: dw.balance, description: `Delivery fee for ${orderId}`, createdAt: now, orderId },
              ...dw.transactions,
            ];
            newWallets[partnerId] = dw;
          }
          return { ...rec, status: "released" as const, releasedAt: now };
        });

        set({
          wallets: newWallets,
          escrowLedger: newLedger,
          deliveries: s.deliveries.map((d) => (d.orderId === orderId ? { ...d, status: "delivered" as const } : d)),
        });
        // Advance status: delivered → funds-released (both propagate notifications)
        get().advanceOrder(orderId, "delivered", "Package delivered — buyer confirmed with code", "delivery");
        get().advanceOrder(orderId, "completed", "Escrow released to seller(s)", "system");
        return { ok: true, message: "Delivery confirmed and escrow released" };
      },

      openDispute: (input) => {
        const s = get();
        const order = s.orders.find((o) => o.id === input.orderId);
        if (!order || !canTransition(order.status, "disputed")) return null;
        if (s.disputes.some((d) => d.orderId === input.orderId && d.status !== "resolved")) return null;
        const sellerIds = Array.from(
          new Set(
            order.items
              .map((it) => s.products.find((p) => p.id === it.productId)?.storeId)
              .map((sid) => s.stores.find((st) => st.id === sid)?.ownerId)
              .filter((x): x is string => !!x),
          ),
        );
        const now = Date.now();
        const dispute: Dispute = {
          id: "d_" + uid(),
          orderId: input.orderId,
          buyerId: order.buyerId,
          sellerId: sellerIds[0] ?? "u_seller1",
          reason: input.reason,
          description: input.description,
          evidence: input.evidence ?? [],
          status: "under-review",
          createdAt: now,
        };
        // Freeze escrow
        const newLedger = s.escrowLedger.map((e) =>
          e.orderId === input.orderId && e.status === "held" ? { ...e, status: "frozen" as const, note: "Frozen — dispute opened" } : e,
        );
        const notifs: Notification[] = [
          { id: uid(), userId: order.buyerId, type: "dispute", title: "Dispute opened", body: `We're reviewing your case for ${input.orderId.slice(0, 8)}.`, createdAt: now, read: false, link: `/buyer/orders/${input.orderId}` },
          ...sellerIds.map((sid) => ({ id: uid(), userId: sid, type: "dispute", title: "Dispute filed on your order", body: `Buyer opened a dispute on ${input.orderId.slice(0, 8)}. Please respond.`, createdAt: now, read: false, link: "/seller" })),
          { id: uid(), userId: "u_dispute1", type: "dispute", title: "New dispute case", body: `Order ${input.orderId.slice(0, 8)} needs review.`, createdAt: now, read: false, link: "/dispute" },
          { id: uid(), userId: "u_admin1", type: "dispute", title: "Dispute opened", body: `Order ${input.orderId.slice(0, 8)} · reason: ${input.reason}.`, createdAt: now, read: false, link: "/admin" },
        ];
        set({
          disputes: [dispute, ...s.disputes],
          escrowLedger: newLedger,
          notifications: [...notifs, ...s.notifications],
          orders: s.orders.map((o) =>
            o.id === input.orderId
              ? { ...o, status: "disputed" as const, timeline: [...o.timeline, { at: now, status: "disputed", note: `Dispute opened: ${input.reason}` }] }
              : o,
          ),
          auditLog: [{ id: uid(), at: now, actor: order.buyerId, action: "dispute.open", target: dispute.id }, ...s.auditLog],
        });
        return dispute;
      },

      resolveDispute: (disputeId, kind, opts) => {
        const s = get();
        const dispute = s.disputes.find((d) => d.id === disputeId);
        if (!dispute || dispute.status === "resolved") return;
        const order = s.orders.find((o) => o.id === dispute.orderId);
        if (!order) return;
        const now = Date.now();

        if (kind === "escalate") {
          set({
            disputes: s.disputes.map((d) => (d.id === disputeId ? { ...d, status: "escalated" as const, resolution: opts?.note ?? "Escalated to administrator" } : d)),
            notifications: [
              { id: uid(), userId: "u_admin1", type: "dispute", title: "Dispute escalated", body: `Case ${disputeId.slice(0, 8)} needs admin attention.`, createdAt: now, read: false, link: "/admin" },
              ...s.notifications,
            ],
            auditLog: [{ id: uid(), at: now, actor: s.currentUserId, action: "dispute.escalate", target: disputeId }, ...s.auditLog],
          });
          return;
        }

        const total = order.escrowHeld ?? order.total;
        const splitPct = Math.max(0, Math.min(100, opts?.splitPct ?? 50));
        const buyerShare = kind === "full-refund" ? total : kind === "release" ? 0 : Math.round((total * splitPct) / 100);
        const sellerShareTotal = Math.max(0, total - buyerShare);

        // Update wallets
        const newWallets = { ...s.wallets };
        // Buyer: reduce escrow, add refund
        const buyerWallet = { ...newWallets[order.buyerId] };
        buyerWallet.escrow = Math.max(0, buyerWallet.escrow - total);
        buyerWallet.balance += buyerShare;
        if (buyerShare > 0) {
          buyerWallet.transactions = [
            { id: uid(), type: "refund", amount: buyerShare, balanceAfter: buyerWallet.balance, description: `Dispute resolution refund for ${order.id}`, createdAt: now, orderId: order.id },
            ...buyerWallet.transactions,
          ];
        }
        newWallets[order.buyerId] = buyerWallet;

        // Distribute seller share across escrow records proportionally
        const heldOrFrozen = s.escrowLedger.filter((e) => e.orderId === order.id && (e.status === "held" || e.status === "frozen"));
        const totalNet = heldOrFrozen.reduce((a, e) => a + e.sellerNet, 0) || 1;
        const newLedger = s.escrowLedger.map((rec) => {
          if (rec.orderId !== order.id || (rec.status !== "held" && rec.status !== "frozen")) return rec;
          const proportion = rec.sellerNet / totalNet;
          const payout = Math.round(sellerShareTotal * proportion);
          if (payout > 0) {
            const sw = { ...(newWallets[rec.sellerId] ?? seedWallet(rec.sellerId, 0)) };
            sw.balance += payout;
            sw.transactions = [
              { id: uid(), type: "credit", amount: payout, balanceAfter: sw.balance, description: `Dispute settlement for ${order.id}`, createdAt: now, orderId: order.id },
              ...sw.transactions,
            ];
            newWallets[rec.sellerId] = sw;
          }
          return {
            ...rec,
            status: kind === "full-refund" ? ("refunded" as const) : kind === "release" ? ("released" as const) : ("split" as const),
            releasedAt: now,
            note: opts?.note,
          };
        });

        const resolution =
          kind === "full-refund"
            ? `Full refund of ${total.toLocaleString()} GHS to buyer.`
            : kind === "release"
              ? `Escrow released in full to seller.`
              : `Split: buyer ${buyerShare.toLocaleString()} / seller ${sellerShareTotal.toLocaleString()} GHS.`;

        set({
          wallets: newWallets,
          escrowLedger: newLedger,
          disputes: s.disputes.map((d) => (d.id === disputeId ? { ...d, status: "resolved" as const, resolution } : d)),
          orders: s.orders.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  status: kind === "full-refund" ? ("refunded" as const) : ("completed" as const),
                  timeline: [...o.timeline, { at: now, status: "dispute-resolved", note: opts?.note || resolution }],
                }
              : o,
          ),
          notifications: [
            { id: uid(), userId: order.buyerId, type: "dispute", title: "Dispute resolved", body: resolution, createdAt: now, read: false, link: `/buyer/orders/${order.id}` },
            { id: uid(), userId: dispute.sellerId, type: "dispute", title: "Dispute resolved", body: resolution, createdAt: now, read: false, link: "/seller" },
            { id: uid(), userId: "u_finance1", type: "settlement", title: "Dispute settlement processed", body: `Order ${order.id.slice(0, 8)} · ${resolution}`, createdAt: now, read: false, link: "/finance" },
            ...s.notifications,
          ],
          auditLog: [{ id: uid(), at: now, actor: s.currentUserId, action: `dispute.resolve.${kind}`, target: disputeId }, ...s.auditLog],
        });
      },

      processRefund: (orderId) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order) return;
        set({
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, timeline: [...o.timeline, { at: Date.now(), status: o.status, note: "Refund payout confirmed by finance" }] } : o)),
          notifications: [
            { id: uid(), userId: order.buyerId, type: "refund", title: "Refund processed", body: `Refund for ${orderId.slice(0, 8)} settled to your wallet.`, createdAt: Date.now(), read: false, link: `/buyer/orders/${orderId}` },
            ...s.notifications,
          ],
          auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId, action: "finance.refund.process", target: orderId }, ...s.auditLog],
        });
      },

      approveCredit: (userId, limit) => {
        const s = get();
        set({
          users: s.users.map((u) => (u.id === userId ? { ...u, creditLimit: limit, creditScore: Math.max(u.creditScore ?? 500, 700) } : u)),
          notifications: [
            { id: uid(), userId, type: "credit", title: "Credit approved", body: `Your NAFLIS credit limit is now GHS ${limit.toLocaleString()}.`, createdAt: Date.now(), read: false, link: "/buyer/installments" },
            { id: uid(), userId: "u_admin1", type: "credit", title: "Credit approved", body: `${s.users.find((u) => u.id === userId)?.name ?? userId} approved for GHS ${limit.toLocaleString()}.`, createdAt: Date.now(), read: false, link: "/admin" },
            ...s.notifications,
          ],
          auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId, action: "credit.approve", target: userId }, ...s.auditLog],
        });
      },

      declineCredit: (userId, reason) => {
        const s = get();
        set({
          notifications: [
            { id: uid(), userId, type: "credit", title: "Credit application declined", body: reason ?? "Please try again in 30 days.", createdAt: Date.now(), read: false, link: "/buyer/installments" },
            ...s.notifications,
          ],
          auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId, action: "credit.decline", target: userId }, ...s.auditLog],
        });
      },

      setFeatureFlag: (key, enabled) =>
        set((s) => ({
          featureFlags: { ...s.featureFlags, [key]: enabled },
          auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId, action: `flag.${enabled ? "on" : "off"}`, target: key }, ...s.auditLog],
        })),

      fundWallet: (amount, source) =>
        set((s) => {
          const w = { ...s.wallets[s.currentUserId] };
          w.balance += amount;
          w.transactions = [
            { id: uid(), type: "credit", amount, balanceAfter: w.balance, description: `Top-up via ${source}`, createdAt: Date.now() },
            ...w.transactions,
          ];
          return { wallets: { ...s.wallets, [s.currentUserId]: w } };
        }),
      toggleAutoFund: (enabled) =>
        set((s) => {
          const w = { ...s.wallets[s.currentUserId] };
          w.autoFund = { ...w.autoFund, enabled };
          return { wallets: { ...s.wallets, [s.currentUserId]: w } };
        }),
      markNotifRead: (id) =>
        set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      clearNotifs: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      pushNotif: (n) =>
        set((s) => ({
          notifications: [{ ...n, id: uid(), createdAt: Date.now(), read: false }, ...s.notifications],
        })),
      notifyUsers: (userIds, n) =>
        set((s) => ({
          notifications: [
            ...userIds.map((uid2) => ({ ...n, userId: uid2, id: uid(), createdAt: Date.now(), read: false })),
            ...s.notifications,
          ],
        })),
      audit: (action, target) =>
        set((s) => ({
          auditLog: [{ id: uid(), at: Date.now(), actor: s.currentUserId, action, target }, ...s.auditLog],
        })),
      resetDemo: () => set({ ...initialState() }),
      setDemoStep: (n) => set({ demoStep: n }),

      // Student OS actions
      setSelectedCampus: (campus) => set({ selectedCampus: campus }),
      requestCampusSwitch: (campus, reason) => {
        const s = get();
        if (campus === s.selectedCampus) return;
        if (reason !== "manual" && (s.campusPromptSnooze[campus] ?? 0) > Date.now()) return;
        set({ campusPrompt: { campus, reason } });
      },
      resolveCampusPrompt: (accept) => {
        const p = get().campusPrompt;
        if (!p) return;
        if (accept) set({ selectedCampus: p.campus, campusPrompt: null });
        // "Not now": keep the current campus and stop suggesting this one for a day.
        else set((s) => ({ campusPrompt: null, campusPromptSnooze: { ...s.campusPromptSnooze, [p.campus]: Date.now() + 86_400_000 } }));
      },
      toggleSavedOpportunity: (id) =>
        set((s) => ({
          savedOpportunities: s.savedOpportunities.includes(id) ? s.savedOpportunities.filter((x) => x !== id) : [...s.savedOpportunities, id],
        })),

      reportLostFound: (input) => {
        const s = get();
        const me = s.users.find((u) => u.id === s.currentUserId);
        if (!me) return null;
        const shield = maskSensitive(input.description);
        const title = maskSensitive(input.title).text;
        const now = Date.now();
        const item: LostFoundItem = {
          ...input,
          title,
          id: "lf_" + uid(),
          publicDescription: shield.text,
          maskedFindings: shield.findings.map((f) => `${f.count} ${SENSITIVE_LABEL[f.kind]}${f.count > 1 ? "s" : ""}`),
          status: input.kind === "found" ? "found" : "open",
          claims: [],
          reporterId: me.id,
          reporterName: me.name,
          timeline: [{ at: now, status: input.kind === "found" ? "found" : "open", note: input.kind === "found" ? "Found item reported" : "Lost item reported", actor: input.kind === "found" ? "finder" : "claimant" }],
          createdAt: now,
        };
        // Tell people on the other side of a likely match.
        const others = s.lostFound.filter((x) => x.kind !== item.kind && x.status !== "closed");
        const matches = others.filter((x) => (item.kind === "lost" ? matchScore(item, x) : matchScore(x, item)) >= 5);
        set({
          lostFound: [item, ...s.lostFound],
          notifications: [
            ...matches.map((m) => ({
              id: uid(), userId: item.kind === "found" ? m.reporterId : me.id, type: "lost-found", createdAt: now, read: false, link: "/student-os/lost-found",
              title: "Possible match for a lost item",
              body: item.kind === "found" ? `Someone found "${item.title}" near ${item.location}.` : `"${m.title}" was handed in near ${m.location}.`,
            })),
            ...s.notifications,
          ],
        });
        return item;
      },

      requestClaim: (itemId, message) => {
        const s = get();
        const item = s.lostFound.find((x) => x.id === itemId);
        const me = s.users.find((u) => u.id === s.currentUserId);
        if (!item || !me) return { ok: false, message: "Sign in to claim an item." };
        if (item.reporterId === me.id) return { ok: false, message: "You reported this item." };
        if (item.claims.some((c) => c.claimantId === me.id && c.status !== "rejected")) return { ok: false, message: "You already have a claim on this item." };
        return lfMove(itemId, "claim_requested", "claimant", `Claim requested by ${me.name}`, (it) => ({
          claims: [...it.claims, { id: "cl_" + uid(), claimantId: me.id, claimantName: me.name, message: message.trim(), status: "pending", createdAt: Date.now() }],
        }), { userId: item.reporterId, title: "Someone claimed an item you found", body: `${me.name} says "${item.title}" is theirs. Ask them for proof.` });
      },

      requireVerification: (itemId, claimId) => {
        const item = get().lostFound.find((x) => x.id === itemId);
        const claim = item?.claims.find((c) => c.id === claimId);
        if (!item || !claim) return { ok: false, message: "Claim not found." };
        return lfMove(itemId, "verification_required", lfActorFor(item), "Proof of ownership requested", (it) => ({
          claims: it.claims.map((c) => (c.id === claimId ? { ...c, status: "verification_required" as const } : c)),
        }), { userId: claim.claimantId, title: "Verify your claim", body: item.verificationQuestion ? `Answer: "${item.verificationQuestion}"` : "Describe something only the owner would know about the item." });
      },

      submitClaimProof: (itemId, claimId, answer) => {
        const s = get();
        const item = s.lostFound.find((x) => x.id === itemId);
        const claim = item?.claims.find((c) => c.id === claimId);
        if (!item || !claim || claim.claimantId !== s.currentUserId) return { ok: false, message: "Claim not found." };
        if (item.status !== "verification_required") return { ok: false, message: "No proof is being requested right now." };
        set({
          lostFound: s.lostFound.map((x) =>
            x.id === itemId
              ? { ...x, claims: x.claims.map((c) => (c.id === claimId ? { ...c, proofAnswer: answer.trim() } : c)), timeline: [...x.timeline, { at: Date.now(), status: x.status, note: "Claimant submitted proof", actor: "claimant" as const }] }
              : x,
          ),
          notifications: [
            { id: uid(), userId: item.reporterId, type: "lost-found", createdAt: Date.now(), read: false, link: "/student-os/lost-found", title: "Proof submitted", body: `Review ${claim.claimantName}'s answer for "${item.title}".` },
            ...s.notifications,
          ],
        });
        return { ok: true, message: "Proof sent to the finder." };
      },

      approveClaim: (itemId, claimId) => {
        const item = get().lostFound.find((x) => x.id === itemId);
        const claim = item?.claims.find((c) => c.id === claimId);
        if (!item || !claim) return { ok: false, message: "Claim not found." };
        if (!claim.proofAnswer) return { ok: false, message: "Wait for the claimant to submit proof first." };
        const code = collectionCode();
        return lfMove(itemId, "claim_approved", lfActorFor(item), `Claim approved for ${claim.claimantName}`, (it) => ({
          claims: it.claims.map((c) =>
            c.id === claimId ? { ...c, status: "approved" as const, collectionCode: code } : c.status === "rejected" ? c : { ...c, status: "rejected" as const },
          ),
        }), { userId: claim.claimantId, title: "Claim approved", body: `Collect "${item.title}" at ${item.handoverPoint ?? "the handover point"} with code ${code}.` });
      },

      rejectClaim: (itemId, claimId, reason) => {
        const item = get().lostFound.find((x) => x.id === itemId);
        const claim = item?.claims.find((c) => c.id === claimId);
        if (!item || !claim) return { ok: false, message: "Claim not found." };
        return lfMove(itemId, "found", lfActorFor(item), `Claim declined: ${reason || "proof didn't match"}`, (it) => ({
          claims: it.claims.map((c) => (c.id === claimId ? { ...c, status: "rejected" as const } : c)),
        }), { userId: claim.claimantId, title: "Claim not approved", body: `Your claim on "${item.title}" wasn't approved. ${reason}` });
      },

      confirmCollection: (itemId, code) => {
        const item = get().lostFound.find((x) => x.id === itemId);
        const claim = item?.claims.find((c) => c.status === "approved");
        if (!item || !claim) return { ok: false, message: "No approved claim on this item." };
        if (claim.collectionCode !== code.trim().toUpperCase()) return { ok: false, message: "That collection code doesn't match." };
        const res = lfMove(itemId, "collected", lfActorFor(item), `Collected by ${claim.claimantName}`, (it) => ({
          claims: it.claims.map((c) => (c.id === claim.id ? { ...c, status: "collected" as const } : c)),
        }), { userId: claim.claimantId, title: "Item collected", body: `Glad "${item.title}" is back with you.` });
        if (res.ok) {
          // Close the owner's matching lost report, if they filed one.
          set((s) => ({
            lostFound: s.lostFound.map((x) =>
              x.kind === "lost" && x.reporterId === claim.claimantId && x.status !== "closed" && matchScore(x, item) >= 3
                ? { ...x, status: "closed", matchedWith: item.id, timeline: [...x.timeline, { at: Date.now(), status: "closed", note: "Recovered through a found report", actor: "system" as const }] }
                : x,
            ),
          }));
        }
        return res;
      },

      closeLostFound: (itemId) => {
        const s = get();
        const item = s.lostFound.find((x) => x.id === itemId);
        if (!item) return { ok: false, message: "Not found." };
        if (item.kind === "lost") {
          if (item.reporterId !== s.currentUserId && lfActorFor(item) !== "desk") return { ok: false, message: "Only the reporter can close this." };
          set({ lostFound: s.lostFound.map((x) => (x.id === itemId ? { ...x, status: "closed", timeline: [...x.timeline, { at: Date.now(), status: "closed", note: "Report closed", actor: "claimant" as const }] } : x)) });
          return { ok: true, message: "Report closed." };
        }
        return lfMove(itemId, "closed", lfActorFor(item), "Case closed");
      },
      verifyStudent: (data) =>
        set((s) => ({
          studentProfile: {
            isVerified: true,
            studentId: data.studentId,
            institution: data.institution,
            course: data.course || "General Studies",
            level: data.level || "Level 200",
            verifiedAt: Date.now(),
          },
          users: s.users.map((u) =>
            u.id === s.currentUserId
              ? { ...u, institutionId: data.institution, roles: Array.from(new Set<Role>([...(u.roles ?? []), "student"])) }
              : u,
          ),
          registeredInstitution: data.institution,
          auditLog: [
            { id: uid(), at: Date.now(), actor: s.currentUserId || "student", action: "student.verify", target: data.studentId },
            ...s.auditLog,
          ],
        })),
      addStudentListing: (listing) => {
        const s = get();
        const id = "sl_" + uid();
        const newListing: StudentListing = {
          ...listing,
          id,
          createdAt: Date.now(),
        };
        set({
          studentListings: [newListing, ...s.studentListings],
          auditLog: [
            { id: uid(), at: Date.now(), actor: s.currentUserId || "student", action: "student_listing.create", target: id },
            ...s.auditLog,
          ],
        });
        return newListing;
      },
      joinGroupDeal: (dealId) => {
        const s = get();
        const deal = s.studentListings.find((l) => l.id === dealId);
        if (!deal) return { ok: false, message: "Deal not found" };
        const currentJoined = deal.groupDealJoined || 0;
        const target = deal.groupDealTarget || 10;
        const updatedJoined = Math.min(target, currentJoined + 1);

        set({
          studentListings: s.studentListings.map((l) =>
            l.id === dealId ? { ...l, groupDealJoined: updatedJoined } : l,
          ),
        });
        return { ok: true, message: `Joined group deal! (${updatedJoined}/${target} spots filled)` };
      },
      setStudentModalOpen: (open) => set({ studentModalOpen: open }),
      setVerifyModalOpen: (open) => set({ verifyModalOpen: open }),
      incrementResourceDownload: (resourceId) =>
        set((s) => ({
          studentListings: s.studentListings.map((l) =>
            l.id === resourceId ? { ...l, downloads: (l.downloads || 0) + 1 } : l,
          ),
          campusResources: s.campusResources.map((r) =>
            r.id === resourceId ? { ...r, downloads: (r.downloads || 0) + 1 } : r,
          ),
          resourceDownloads: {
            ...s.resourceDownloads,
            [resourceId]: (s.resourceDownloads[resourceId] || 0) + 1,
          },
        })),

      // Institutional / SRC & Demand actions
      addCampusEvent: (event) => {
        const s0 = get();
        const perm: Permission = event.kind === "announcement" ? "student.announcements.create" : "student.events.create";
        if (!s0.hasPermission(perm, event.campus)) return null;
        if (event.ticketing?.tiers.length && !s0.hasPermission("student.tickets.sell", event.campus)) return null;
        const id = event.id ?? "ce_" + uid();
        const newEvent: CampusEvent = {
          ...event,
          id,
          createdAt: Date.now(),
        };
        set((s) => ({
          campusEvents: [newEvent, ...s.campusEvents],
          auditLog: [
            { id: uid(), at: Date.now(), actor: s.currentUserId || "src-admin", action: "campus_event.create", target: id },
            ...s.auditLog,
          ],
        }));
        return newEvent;
      },
      togglePinEvent: (id) => {
        const e = get().campusEvents.find((x) => x.id === id);
        if (!e || !canEditEvent(e)) return false;
        set((s) => ({ campusEvents: s.campusEvents.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)) }));
        get().audit("campus_event.pin", id);
        return true;
      },
      deleteCampusEvent: (id) => {
        const e = get().campusEvents.find((x) => x.id === id);
        if (!e || !canEditEvent(e)) return false;
        set((s) => ({ campusEvents: s.campusEvents.filter((x) => x.id !== id) }));
        get().audit("campus_event.delete", id);
        return true;
      },
      addCampusResource: (res) => {
        if (!get().hasPermission("student.resources.manage", res.campus)) return null;
        const id = "cr_" + uid();
        const newRes: CampusResource = {
          ...res,
          id,
          downloads: 0,
          createdAt: Date.now(),
        };
        set((s) => ({
          campusResources: [newRes, ...s.campusResources],
          auditLog: [
            { id: uid(), at: Date.now(), actor: s.currentUserId || "academic-head", action: "campus_resource.upload", target: id },
            ...s.auditLog,
          ],
        }));
        return newRes;
      },
      deleteCampusResource: (id) => {
        const r = get().campusResources.find((x) => x.id === id);
        if (!r || !get().hasPermission("student.resources.manage", r.campus)) return false;
        set((s) => ({ campusResources: s.campusResources.filter((x) => x.id !== id) }));
        get().audit("campus_resource.delete", id);
        return true;
      },

      // ---------------- staff grants
      hasPermission: (permission, campus) => {
        const s = get();
        return can({ userId: s.currentUserId, isSuperAdmin: isRealSuperAdmin() }, s.staffGrants, permission, campus);
      },
      addStaffGrant: (grant) => {
        if (!isRealSuperAdmin()) return { ok: false, message: "Only a Super Admin can invite staff." };
        set((s) => ({ staffGrants: [grant, ...s.staffGrants.filter((g) => g.id !== grant.id)] }));
        get().audit("staff.invite", `${grant.email} → ${grant.institutionId}/${grant.campusId}`);
        return { ok: true, message: `Invitation created for ${grant.email}` };
      },
      activateStaffGrant: (grantId, userId) => {
        const s = get();
        const g = s.staffGrants.find((x) => x.id === grantId);
        const user = s.users.find((u) => u.id === userId);
        if (!g || !user) return { ok: false, message: "Invitation not found." };
        if (g.status !== "invited") return { ok: false, message: `This invitation is ${g.status}.` };
        if (g.expiresAt && g.expiresAt < Date.now()) return { ok: false, message: "This invitation has expired. Ask for a new one." };
        if (user.email.toLowerCase() !== g.email.toLowerCase()) return { ok: false, message: `This invitation was sent to ${g.email}. Sign in with that account.` };
        set({
          staffGrants: s.staffGrants.map((x) => (x.id === grantId ? { ...x, status: "active", userId, acceptedAt: Date.now(), tokenHash: undefined } : x)),
          users: s.users.map((u) => (u.id === userId ? { ...u, roles: Array.from(new Set<Role>([...(u.roles ?? []), g.role])) } : u)),
        });
        get().audit("staff.accept", grantId);
        return { ok: true, message: `Welcome aboard — you're now ${g.title}.` };
      },
      updateStaffGrant: (grantId, patch) => {
        if (!isRealSuperAdmin()) return { ok: false, message: "Only a Super Admin can change staff permissions." };
        set((s) => ({ staffGrants: s.staffGrants.map((g) => (g.id === grantId ? { ...g, ...patch } : g)) }));
        get().audit("staff.update", grantId);
        return { ok: true, message: "Permissions updated." };
      },
      revokeStaffGrant: (grantId) => {
        if (!isRealSuperAdmin()) return { ok: false, message: "Only a Super Admin can revoke staff access." };
        set((s) => ({ staffGrants: s.staffGrants.map((g) => (g.id === grantId ? { ...g, status: "revoked", revokedAt: Date.now(), tokenHash: undefined } : g)) }));
        get().audit("staff.revoke", grantId);
        return { ok: true, message: "Access revoked." };
      },

      // ---------------- seller intelligence
      setIntelligencePref: (patch) => set((s) => ({ intelligence: { ...s.intelligence, ...patch } })),
      dismissInsight: (id) =>
        set((s) => ({ intelligence: { ...s.intelligence, dismissed: { ...s.intelligence.dismissed, [id]: Date.now() } } })),
      restoreInsights: () => set((s) => ({ intelligence: { ...s.intelligence, dismissed: {} } })),
      saveBundleDraft: (draft) =>
        set((s) => ({
          intelligence: {
            ...s.intelligence,
            bundles: [draft, ...s.intelligence.bundles.filter((b) => b.id !== draft.id)],
            applied: [{ id: draft.id, kind: "bundle", detail: `${draft.names.join(" + ")} at ${draft.discountPct}% off`, at: Date.now() }, ...s.intelligence.applied],
          },
        })),
      sellerUpdateProduct: (productId, patch) => {
        const s = get();
        const product = s.products.find((p) => p.id === productId);
        if (!product) return { ok: false, status: 404, message: "Product not found." };
        const owner = s.stores.find((st) => st.id === product.storeId)?.ownerId;
        if (!owner || owner !== s.currentUserId || s.impersonation) {
          return { ok: false, status: 403, message: "Access denied: this product belongs to another store." };
        }
        const now = Date.now();
        const next = { ...product };
        const notes: string[] = [];
        if (patch.price !== undefined) {
          if (!(patch.price > 0)) return { ok: false, status: 404, message: "Price must be above zero." };
          notes.push(`price ${product.price} → ${patch.price}`);
          next.price = patch.price;
          next.originalPrice = Math.max(product.originalPrice, patch.price);
          next.priceHistory = [...product.priceHistory, { date: new Date(now).toISOString().slice(0, 10), price: patch.price }];
        }
        if (patch.stockDelta) {
          next.stock = Math.max(0, product.stock + patch.stockDelta);
          notes.push(`stock ${product.stock} → ${next.stock}`);
        }
        set({
          products: s.products.map((p) => (p.id === productId ? next : p)),
          intelligence: {
            ...s.intelligence,
            applied: [
              { id: `${patch.price !== undefined ? "price" : "restock"}:${productId}`, kind: (patch.price !== undefined ? "price" : "restock") as "price" | "restock", detail: `${product.name}: ${notes.join(", ")}`, at: now },
              ...s.intelligence.applied,
            ].slice(0, 50),
          },
        });
        get().audit(patch.price !== undefined ? "product.price" : "product.restock", productId);
        return { ok: true, status: 200, message: notes.join(", ") };
      },
      setStoreSubscription: (storeId, tier) => {
        const s = get();
        const store = s.stores.find((st) => st.id === storeId);
        if (!store) return { ok: false, status: 404, message: "Store not found." };
        if (store.ownerId !== s.currentUserId && !isRealSuperAdmin()) return { ok: false, status: 403, message: "Access denied." };
        set({ stores: s.stores.map((st) => (st.id === storeId ? { ...st, subscription: tier } : st)) });
        get().audit("store.subscription", `${storeId}:${tier}`);
        return { ok: true, status: 200, message: `Plan changed to ${tier}.` };
      },
      requestSubscriptionUpgrade: (storeId, tier) =>
        set((s) => ({
          intelligence: { ...s.intelligence, upgradeRequests: [{ storeId, tier, at: Date.now() }, ...s.intelligence.upgradeRequests] },
          notifications: [
            { id: uid(), userId: "u_admin1", type: "subscription", createdAt: Date.now(), read: false, link: "/admin", title: "Plan upgrade requested", body: `Store ${storeId} asked for the ${tier} plan.` },
            ...s.notifications,
          ],
        })),

      // ---------------- tickets
      issueTicket: (ticket) =>
        set((s) => ({
          tickets: [ticket, ...s.tickets.filter((t) => t.id !== ticket.id)],
          campusEvents: s.campusEvents.map((e) =>
            e.id === ticket.eventId && e.ticketing
              ? { ...e, ticketing: { ...e.ticketing, tiers: e.ticketing.tiers.map((t) => (t.id === ticket.tierId ? { ...t, sold: t.sold + 1 } : t)) } }
              : e,
          ),
          notifications: [
            { id: uid(), userId: ticket.holderId, type: "ticket", createdAt: Date.now(), read: false, link: "/student-os/events", title: "Ticket confirmed", body: "Your QR ticket is in My Tickets. Show it at the gate." },
            ...s.notifications,
          ],
        })),
      checkInTicket: (raw) => {
        const s = get();
        const token = raw.trim().replace(/^naflis:ticket:/i, "");
        const ticket = s.tickets.find((t) => t.token === token);
        if (!ticket) return { ok: false, message: "Not a valid NAFLIS ticket." };
        const event = s.campusEvents.find((e) => e.id === ticket.eventId);
        if (!event || !s.hasPermission("student.tickets.validate", event.campus)) {
          return { ok: false, message: "You're not authorised to validate tickets for this event." };
        }
        if (ticket.status === "void") return { ok: false, message: "This ticket was voided.", ticket };
        if (ticket.status === "checked_in") {
          return { ok: false, message: `Already used at ${new Date(ticket.checkedInAt!).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}.`, ticket };
        }
        const updated: Ticket = { ...ticket, status: "checked_in", checkedInAt: Date.now(), checkedInBy: s.currentUserId ?? undefined };
        set({ tickets: s.tickets.map((t) => (t.id === ticket.id ? updated : t)) });
        get().audit("ticket.check_in", ticket.id);
        const tier = event.ticketing?.tiers.find((t) => t.id === ticket.tierId);
        return { ok: true, message: `Admit ${ticket.holderName} · ${tier?.name ?? "Ticket"}`, ticket: updated };
      },

      // ---------------- view-as
      startImpersonation: ({ targetUserId, role, reason, sessionId, minutes = 30 }) => {
        const s = get();
        if (s.impersonation) return { ok: false, message: "Exit the current view first." };
        if (!isRealSuperAdmin()) return { ok: false, message: "Only a Super Admin can view as another user." };
        const admin = s.users.find((u) => u.id === s.currentUserId)!;
        const target = s.users.find((u) => u.id === targetUserId);
        if (!target) return { ok: false, message: "User not found." };
        const targetRoles = resolveRoles(target, s.stores);
        if (targetRoles.includes("super_admin")) return { ok: false, message: "You can't view as another Super Admin." };
        if (!targetRoles.includes(role)) return { ok: false, message: `${target.name} doesn't hold the ${ROLE_META[role].label} role.` };
        if (reason.trim().length < 5) return { ok: false, message: "Give a reason (it's recorded in the audit log)." };
        const now = Date.now();
        const store = s.stores.find((st) => st.ownerId === target.id);
        const session: ImpersonationSession = {
          id: sessionId ?? "imp_" + uid() + uid(),
          adminUserId: admin.id,
          adminName: admin.name,
          targetUserId: target.id,
          targetName: target.name,
          role,
          context: role === "seller" && store ? store.name : target.institutionId ?? target.region,
          reason: reason.trim(),
          startedAt: now,
          expiresAt: now + minutes * 60_000,
        };
        set({
          impersonation: session,
          impersonationSessions: [session, ...s.impersonationSessions],
          // Remember the admin's own context so Exit View restores it exactly.
          adminReturn: { userId: admin.id, role: s.role },
          currentUserId: target.id,
          role,
          auditLog: [{ id: uid(), at: now, actor: admin.id, action: "impersonation.start", target: `${target.id} as ${role} · ${session.reason}` }, ...s.auditLog],
        });
        return { ok: true, message: `Viewing as ${target.name}` };
      },
      endImpersonation: (reason = "exit") => {
        const s = get();
        const session = s.impersonation;
        if (!session) return null;
        const ended = { ...session, endedAt: Date.now(), endReason: reason };
        set({
          impersonation: null,
          impersonationSessions: s.impersonationSessions.map((x) => (x.id === session.id ? ended : x)),
          currentUserId: s.adminReturn?.userId ?? session.adminUserId,
          role: s.adminReturn?.role ?? "super_admin",
          adminReturn: null,
          auditLog: [{ id: uid(), at: Date.now(), actor: session.adminUserId, action: `impersonation.${reason === "expired" ? "expire" : "end"}`, target: session.targetUserId }, ...s.auditLog],
        });
        return ended;
      },
      logDemandSearch: (query, campus = "General", resultsCount = 0) => {
        const q = query.trim();
        if (!q) return;
        const currentUserId = get().currentUserId;
        const newLog: DemandLog = {
          id: "dl_" + uid(),
          searchQuery: q,
          campus: campus || "General",
          resultsCount,
          userId: currentUserId || null,
          createdAt: Date.now(),
        };
        set((s) => ({
          demandLogs: [newLog, ...s.demandLogs].slice(0, 500),
          searchEvents: [
            { id: uid(), buyerId: currentUserId || undefined, query: q, region: campus, matches: resultsCount, createdAt: Date.now() },
            ...s.searchEvents,
          ].slice(0, 200),
        }));

        // Non-blocking passive insert to Supabase demand_logs
        if (supabase) {
          try {
            supabase.from("demand_logs").insert({
              search_query: q,
              campus: campus || "General",
              results_count: resultsCount,
              user_id: currentUserId || null,
            }).then(() => {}).catch((err: any) => {
              console.warn("Supabase passive demand log note:", err);
            });
          } catch (e) {
            // ignore non-blocking
          }
        }
      },
    };
    },
    {
      name: "naflis-store-v2",
      version: 3,
      // v0 -> v1: single `role` per user becomes a role set; "super" is renamed "super_admin".
      // v1 -> v2: order statuses move to the P1 state machine; ledgers get their new shapes.
      migrate: (persisted: any, version: number) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        if (version < 2) {
          if (Array.isArray(persisted.orders)) {
            persisted.orders = persisted.orders.map((o: any) => ({ ...o, status: toOrderState(String(o.status)) }));
          }
          // Pre-P1 reservation / installment arrays were never populated by the app.
          persisted.reservations = [];
          persisted.installments = [];
          persisted.paymentIntents = persisted.paymentIntents ?? {};
        }
        if (version < 3 && Array.isArray(persisted.users)) {
          for (const seed of seedUsers) if (!persisted.users.some((u: any) => u.id === seed.id)) persisted.users.push(seed);
          if (Array.isArray(persisted.campusEvents) && !persisted.campusEvents.some((e: any) => e.id === "ce_srcweek")) {
            persisted.campusEvents = [SEED_CAMPUS_EVENTS[0], ...persisted.campusEvents];
          }
        }
        if (version >= 1) return persisted;
        if (persisted.role && persisted.role !== "guest") persisted.role = normalizeRole(persisted.role);
        if (Array.isArray(persisted.users)) {
          persisted.users = persisted.users.map((u: any) => {
            const seed = seedUsers.find((x) => x.id === u.id);
            const role = normalizeRole(u.role);
            return { ...u, role, roles: u.roles ?? seed?.roles ?? [role], institutionId: u.institutionId ?? seed?.institutionId };
          });
          for (const seed of seedUsers) {
            if (!persisted.users.some((u: any) => u.id === seed.id)) persisted.users.push(seed);
          }
        }
        return persisted;
      },
    },
  ),
);

// Selectors / helpers
export const useCurrentUser = () => {
  const { currentUserId, users } = useNaflis();
  return users.find((u) => u.id === currentUserId) ?? users[0];
};

/** Roles held by the signed-in user, in switcher order. */
export const useUserRoles = (): Role[] => {
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const stores = useNaflis((s) => s.stores);
  return resolveRoles(user, stores);
};

export const useWallet = () => {
  const { currentUserId, wallets } = useNaflis();
  return wallets[currentUserId];
};

export { orderStateLabel };

export const useProduct = (id: string) => useNaflis((s) => s.products.find((p) => p.id === id));
