import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "./format";

// ============================================================================
// TYPES
// ============================================================================

export type Role =
  | "guest"
  | "buyer"
  | "seller"
  | "delivery"
  | "finance"
  | "dispute"
  | "admin"
  | "super";

export type PaymentOption = "wallet" | "card" | "momo" | "reserve" | "installment";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  role: Role;
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
}

export interface CartItem {
  productId: string;
  qty: number;
  paymentOption?: PaymentOption;
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

export type OrderStatus =
  | "payment-initiated"
  | "escrow-secured"
  | "seller-accepted"
  | "preparing"
  | "delivery-assigned"
  | "out-for-delivery"
  | "delivered"
  | "confirmation-pending"
  | "funds-released"
  | "dispute-opened"
  | "refund-approved"
  | "cancelled";

export interface OrderEvent {
  at: number;
  status: OrderStatus | string;
  note: string;
  actor?: string;
}

export interface Order {
  id: string;
  buyerId: string;
  items: { productId: string; qty: number; price: number }[];
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

export interface Reservation {
  id: string;
  buyerId: string;
  productId: string;
  total: number;
  paid: number;
  frequency: "weekly" | "biweekly" | "monthly";
  installment: number;
  nextDue: number;
  schedule: { due: number; amount: number; paid: boolean }[];
  status: "active" | "completed" | "cancelled";
  createdAt: number;
}

export interface InstallmentPlan {
  id: string;
  buyerId: string;
  productId: string;
  orderId: string;
  total: number;
  downPayment: number;
  financeCharge: number;
  paid: number;
  frequency: "weekly" | "biweekly" | "monthly";
  installment: number;
  nextDue: number;
  schedule: { due: number; amount: number; paid: boolean }[];
  status: "approved" | "declined" | "active" | "completed" | "late";
  createdAt: number;
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
  { id: "u_buyer1", name: "Ama Owusu", email: "ama@demo.gh", phone: "+233 24 000 0001", region: "Greater Accra", role: "buyer", avatar: AVATARS[0], verified: true, creditScore: 780, creditLimit: 8000, tags: ["verified", "returning"] },
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
  { id: "u_super1", name: "Kobby Super", email: "kobby@naflis.gh", phone: "+233 30 200 0014", region: "Greater Accra", role: "super", avatar: AVATARS[11], verified: true },
];

const seedStores: Store[] = [
  { id: "s_trendtech", name: "TrendTech Ghana", ownerId: "u_seller1", logo: AVATARS[4], tagline: "Certified electronics, unbeatable prices.", rating: 4.8, reviews: 1204, verified: true, followers: 12500, location: "Osu, Accra", categories: ["Electronics", "Phones", "Laptops"], subscription: "professional" },
  { id: "s_kente", name: "Kente & Co", ownerId: "u_seller2", logo: AVATARS[5], tagline: "Modern African fashion, delivered.", rating: 4.6, reviews: 812, verified: true, followers: 8700, location: "Kumasi", categories: ["Fashion", "Shoes"], subscription: "growth" },
  { id: "s_new", name: "New Seller Corp", ownerId: "u_seller3", logo: AVATARS[6], tagline: "Just getting started.", rating: 0, reviews: 0, verified: false, followers: 12, location: "Takoradi", categories: ["Home"], subscription: "starter" },
];

const CATEGORIES = [
  "Phones", "Laptops", "Home Appliances", "Fashion", "Shoes", "Beauty",
  "Furniture", "Groceries", "Electronics", "School Supplies", "Office Equipment",
  "Automotive", "Baby Products", "Health & Wellness", "Gaming", "Travel", "Home Improvement",
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
  mkProduct({ name: "20000mAh Power Bank", brand: "Anker", storeId: "s_trendtech", category: "Electronics", image: IMG.powerbank, price: 320, originalPrice: 460 }),
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
  featureFlags: Record<string, boolean>;
  demoStep: number;

  // actions
  setRole: (r: Role) => void;
  setUser: (id: string | null) => void;
  signIn: (userId: string) => void;
  signOut: () => void;
  addToCart: (productId: string, qty?: number, opt?: PaymentOption) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  setPriceAlert: (productId: string, target: number) => void;
  recordSearch: (query: string, matches: number) => void;
  createProductRequest: (data: Omit<ProductRequest, "id" | "createdAt" | "interestedBuyers" | "buyerId" | "buyerName">) => void;
  applyPromo: (code: string, subtotal: number) => { ok: boolean; discount: number; message: string; promo?: PromoCode };
  createOrder: (input: {
    items: { productId: string; qty: number; price: number }[];
    promoCode?: string;
    discount: number;
    delivery: number;
    escrowFee: number;
    paymentOption: PaymentOption;
    address: string;
  }) => Order;
  advanceOrder: (orderId: string, status: OrderStatus, note: string, actor?: string) => void;
  // Connected role actions (Phase 2)
  sellerAcceptOrder: (orderId: string) => void;
  sellerStartPreparing: (orderId: string) => void;
  sellerMarkReady: (orderId: string) => void;
  deliveryAcceptJob: (orderId: string, partnerId: string) => void;
  deliveryConfirmPickup: (orderId: string, partnerId: string) => void;
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
    featureFlags: {
      brandStudio: true,
      priceIntelligence: true,
      takeNowPayLater: true,
      reservePay: true,
      fraudHardBlock: false,
    } as Record<string, boolean>,
    demoStep: 0,
  };
}

export const useNaflis = create<State>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setRole: (r) => {
        const map: Record<Role, string | null> = {
          guest: null, buyer: "u_buyer1", seller: "u_seller1",
          delivery: "u_delivery1", finance: "u_finance1", dispute: "u_dispute1",
          admin: "u_admin1", super: "u_super1",
        };
        set({ role: r, currentUserId: map[r] ?? get().currentUserId });
      },
      setUser: (id) => set({ currentUserId: id }),
      signIn: (userId) => {
        const user = get().users.find((u) => u.id === userId);
        if (user) {
          set({ currentUserId: userId, role: user.role });
        }
      },
      signOut: () => {
        set({ currentUserId: null, role: "guest" });
      },
      addToCart: (productId, qty = 1, opt) =>
        set((s) => {
          const ex = s.cart.find((c) => c.productId === productId);
          if (ex) return { cart: s.cart.map((c) => (c.productId === productId ? { ...c, qty: c.qty + qty } : c)) };
          return { cart: [...s.cart, { productId, qty, paymentOption: opt }] };
        }),
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
      createOrder: (input) => {
        const s = get();
        const now = Date.now();
        const subtotal = input.items.reduce((a, b) => a + b.price * b.qty, 0);
        const total = subtotal - input.discount + input.delivery + input.escrowFee;

        // Group items by seller (via product.storeId → store.ownerId)
        const sellerGroups = new Map<string, { gross: number; items: typeof input.items }>();
        for (const it of input.items) {
          const p = s.products.find((pp) => pp.id === it.productId);
          const store = p ? s.stores.find((st) => st.id === p.storeId) : undefined;
          const sellerId = store?.ownerId ?? "u_seller1";
          const g = sellerGroups.get(sellerId) ?? { gross: 0, items: [] };
          g.gross += it.price * it.qty;
          g.items.push(it);
          sellerGroups.set(sellerId, g);
        }

        const orderId = "o_" + uid();
        const escrowRecords: EscrowRecord[] = [];
        const sellerNotifs: Notification[] = [];
        for (const [sellerId, group] of sellerGroups) {
          const shareRatio = subtotal > 0 ? group.gross / subtotal : 0;
          const deliveryShare = Math.round(input.delivery * shareRatio);
          const platformFeeShare = Math.round(input.escrowFee * shareRatio);
          const sellerNet = Math.max(0, group.gross - platformFeeShare);
          escrowRecords.push({
            id: "esc_" + uid(),
            orderId,
            buyerId: s.currentUserId,
            sellerId,
            gross: group.gross,
            platformFee: platformFeeShare,
            deliveryFee: deliveryShare,
            sellerNet,
            status: "held",
            createdAt: now,
          });
          sellerNotifs.push({
            id: uid(),
            userId: sellerId,
            type: "new-order",
            title: "New order received",
            body: `${group.items.length} item(s) worth GHS ${group.gross.toLocaleString()} awaiting acceptance.`,
            createdAt: now,
            read: false,
            link: "/seller",
          });
        }

        const order: Order = {
          id: orderId,
          buyerId: s.currentUserId,
          items: input.items,
          subtotal,
          discount: input.discount,
          promoCode: input.promoCode,
          delivery: input.delivery,
          escrowFee: input.escrowFee,
          total,
          paymentOption: input.paymentOption,
          status: "escrow-secured",
          address: input.address,
          createdAt: now,
          timeline: [
            { at: now, status: "payment-initiated", note: "Payment initiated by buyer" },
            { at: now + 500, status: "escrow-secured", note: `Funds secured in NAFLIS escrow (GHS ${total.toLocaleString()})` },
          ],
        };

        // Buyer wallet
        const w = { ...(s.wallets[s.currentUserId] ?? seedWallet(s.currentUserId, 0)) };
        if (input.paymentOption === "wallet") {
          w.balance -= total;
          w.escrow += total;
          w.transactions = [
            { id: uid(), type: "escrow-in", amount: total, balanceAfter: w.balance, description: `Escrow hold for order ${orderId}`, createdAt: now, orderId },
            ...w.transactions,
          ];
        }

        const buyerNotif: Notification = {
          id: uid(), userId: s.currentUserId, type: "order",
          title: "Order placed — funds in escrow",
          body: `Order ${orderId.slice(0, 8)} for GHS ${total.toLocaleString()} is safely held in escrow.`,
          createdAt: now, read: false, link: `/buyer/orders/${orderId}`,
        };
        const adminNotif: Notification = {
          id: uid(), userId: "u_admin1", type: "order",
          title: "New GMV recorded",
          body: `Order ${orderId.slice(0, 8)} · GHS ${total.toLocaleString()} across ${sellerGroups.size} seller(s).`,
          createdAt: now, read: false, link: "/admin",
        };

        set({
          orders: [order, ...s.orders],
          wallets: { ...s.wallets, [s.currentUserId]: w },
          notifications: [buyerNotif, adminNotif, ...sellerNotifs, ...s.notifications],
          escrowLedger: [...escrowRecords, ...s.escrowLedger],
          cart: [],
          auditLog: [
            { id: uid(), at: now, actor: s.currentUserId, action: "order.create", target: orderId },
            ...s.auditLog,
          ],
        });
        return order;
      },

      advanceOrder: (orderId, status, note, actor) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order) return;
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

        // Status-driven fanout
        switch (status) {
          case "seller-accepted":
            pushN(order.buyerId, "Order accepted", `Seller accepted your order ${orderId.slice(0, 8)}.`, `/buyer/orders/${orderId}`);
            break;
          case "preparing":
            pushN(order.buyerId, "Order is being prepared", `Your order ${orderId.slice(0, 8)} is being packed.`, `/buyer/orders/${orderId}`);
            break;
          case "delivery-assigned":
            pushN(order.buyerId, "Delivery scheduled", `A partner is being assigned to ${orderId.slice(0, 8)}.`, `/buyer/orders/${orderId}`);
            pushN("u_delivery1", "New delivery job available", `Order ${orderId.slice(0, 8)} · fee GHS ${order.delivery}.`, "/delivery", "delivery");
            break;
          case "out-for-delivery":
            pushN(order.buyerId, "On the way", `Your order is out for delivery.`, `/buyer/orders/${orderId}`, "delivery");
            for (const sid of sellerIds) pushN(sid, "Order picked up", `Partner picked up order ${orderId.slice(0, 8)}.`, "/seller");
            break;
          case "delivered":
            pushN(order.buyerId, "Delivered", `Confirm receipt of ${orderId.slice(0, 8)} to release funds.`, `/buyer/orders/${orderId}`, "delivery");
            break;
          case "funds-released":
            pushN(order.buyerId, "Funds released", `Escrow released for ${orderId.slice(0, 8)}. Thank you!`, `/buyer/orders/${orderId}`);
            for (const sid of sellerIds) pushN(sid, "Settlement credited", `Escrow released for ${orderId.slice(0, 8)}.`, "/seller", "settlement");
            pushN("u_finance1", "Escrow released", `Order ${orderId.slice(0, 8)} released to seller(s).`, "/finance", "settlement");
            break;
          case "refund-approved":
            pushN(order.buyerId, "Refund approved", `Refund is being processed for ${orderId.slice(0, 8)}.`, `/buyer/orders/${orderId}`, "refund");
            for (const sid of sellerIds) pushN(sid, "Refund approved on your order", `${orderId.slice(0, 8)} was refunded.`, "/seller", "refund");
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
            { id: uid(), at: now, actor: actor ?? s.currentUserId, action: `order.${status}`, target: orderId },
            ...s.auditLog,
          ],
        });
      },

      sellerAcceptOrder: (orderId) => {
        get().advanceOrder(orderId, "seller-accepted", "Seller accepted the order", "seller");
      },
      sellerStartPreparing: (orderId) => {
        get().advanceOrder(orderId, "preparing", "Seller preparing the shipment", "seller");
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
        set({ deliveries: [delivery, ...s.deliveries] });
        get().advanceOrder(orderId, "delivery-assigned", "Handed off to delivery partner", "seller");
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
                  timeline: [...o.timeline, { at: Date.now(), status: "delivery-assigned", note: "Delivery job accepted", actor: partnerId }],
                }
              : o,
          ),
          deliveries: s.deliveries.map((d) => (d.orderId === orderId ? { ...d, partnerId, code, status: "assigned" as const } : d)),
          auditLog: [{ id: uid(), at: Date.now(), actor: partnerId, action: "delivery.accept", target: orderId }, ...s.auditLog],
        });
      },
      deliveryConfirmPickup: (orderId, partnerId) => {
        set((s) => ({
          deliveries: s.deliveries.map((d) => (d.orderId === orderId ? { ...d, status: "picked-up" as const } : d)),
        }));
        get().advanceOrder(orderId, "out-for-delivery", "Package picked up from seller", partnerId);
      },
      deliveryComplete: (orderId, partnerId, code) => {
        const s = get();
        const order = s.orders.find((o) => o.id === orderId);
        if (!order) return { ok: false, message: "Order not found" };
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
          buyerWallet.escrow = Math.max(0, buyerWallet.escrow - order.total);
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
        get().advanceOrder(orderId, "delivered", "Package delivered — buyer confirmed with code", partnerId);
        get().advanceOrder(orderId, "funds-released", "Escrow released to seller(s)", partnerId);
        return { ok: true, message: "Delivery confirmed and escrow released" };
      },

      openDispute: (input) => {
        const s = get();
        const order = s.orders.find((o) => o.id === input.orderId);
        if (!order) return null;
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
              ? { ...o, status: "dispute-opened", timeline: [...o.timeline, { at: now, status: "dispute-opened", note: `Dispute opened: ${input.reason}` }] }
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

        const total = order.total;
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
                  status: kind === "full-refund" ? ("refund-approved" as const) : ("funds-released" as const),
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
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "cancelled" as const, timeline: [...o.timeline, { at: Date.now(), status: "refund-processed", note: "Refund transferred to buyer wallet" }] } : o)),
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
    }),
    { name: "naflis-store-v2" },
  ),
);

// Selectors / helpers
export const useCurrentUser = () => {
  const { currentUserId, users } = useNaflis();
  return users.find((u) => u.id === currentUserId) ?? users[0];
};

export const useWallet = () => {
  const { currentUserId, wallets } = useNaflis();
  return wallets[currentUserId];
};

export const useProduct = (id: string) => useNaflis((s) => s.products.find((p) => p.id === id));

export { CATEGORIES };
