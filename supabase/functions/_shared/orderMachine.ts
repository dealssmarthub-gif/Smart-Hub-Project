// ============================================================================
// ORDER STATE MACHINE — shared by the web app and the `payments` Edge Function.
// Keep this file free of runtime-specific imports (no Deno.*, no "@/..." aliases).
// The SQL table public.order_transitions (migration 05) mirrors TRANSITIONS.
// ============================================================================

export const ORDER_STATES = [
  "created",
  "awaiting_payment",
  "paid",
  "accepted",
  "processing",
  "ready",
  "dispatched",
  "delivered",
  "completed",
  "disputed",
  // terminal exits for orders that never complete
  "cancelled",
  "refunded",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

export type OrderActor = "system" | "buyer" | "seller" | "delivery" | "dispute" | "admin";

interface Transition {
  to: OrderState;
  /** Who may trigger it. "system" = payment processor / scheduled jobs. */
  actors: OrderActor[];
}

/** Every legal edge. Anything not listed here is rejected. */
export const TRANSITIONS: Record<OrderState, Transition[]> = {
  created: [
    { to: "awaiting_payment", actors: ["system"] },
    { to: "cancelled", actors: ["system", "buyer", "admin"] },
  ],
  awaiting_payment: [
    { to: "paid", actors: ["system"] },
    { to: "cancelled", actors: ["system", "buyer", "admin"] },
  ],
  paid: [
    { to: "accepted", actors: ["seller", "admin"] },
    { to: "disputed", actors: ["buyer", "dispute", "admin"] },
    { to: "refunded", actors: ["seller", "admin"] }, // seller declines → full refund
  ],
  accepted: [
    { to: "processing", actors: ["seller", "admin"] },
    { to: "disputed", actors: ["buyer", "dispute", "admin"] },
  ],
  processing: [
    { to: "ready", actors: ["seller", "admin"] },
    { to: "disputed", actors: ["buyer", "dispute", "admin"] },
  ],
  ready: [
    { to: "dispatched", actors: ["delivery", "seller", "admin"] },
    { to: "disputed", actors: ["buyer", "dispute", "admin"] },
  ],
  dispatched: [
    { to: "delivered", actors: ["delivery", "admin"] },
    { to: "disputed", actors: ["buyer", "dispute", "admin"] },
  ],
  delivered: [
    { to: "completed", actors: ["buyer", "system", "admin"] },
    { to: "disputed", actors: ["buyer", "dispute", "admin"] },
  ],
  disputed: [
    { to: "completed", actors: ["dispute", "admin"] }, // release / split
    { to: "refunded", actors: ["dispute", "admin"] },
  ],
  completed: [],
  cancelled: [],
  refunded: [],
};

export class InvalidTransitionError extends Error {
  readonly from: OrderState;
  readonly to: OrderState;
  readonly actor?: OrderActor;

  constructor(from: OrderState, to: OrderState, actor?: OrderActor) {
    super(
      actor
        ? `Order cannot move from "${from}" to "${to}" as ${actor}.`
        : `Order cannot move from "${from}" to "${to}".`,
    );
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
    this.actor = actor;
  }
}

export function canTransition(from: OrderState, to: OrderState, actor?: OrderActor): boolean {
  const edge = TRANSITIONS[from]?.find((t) => t.to === to);
  return Boolean(edge && (!actor || edge.actors.includes(actor)));
}

export function assertTransition(from: OrderState, to: OrderState, actor?: OrderActor): void {
  if (!canTransition(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
}

export function isTerminal(state: OrderState): boolean {
  return TRANSITIONS[state].length === 0;
}

/** States in which buyer money sits in escrow. */
export const ESCROW_HELD_STATES: OrderState[] = ["paid", "accepted", "processing", "ready", "dispatched", "delivered", "disputed"];

/** States from which a dispute may be opened. */
export const DISPUTABLE_STATES: OrderState[] = ORDER_STATES.filter((s) =>
  TRANSITIONS[s].some((t) => t.to === "disputed"),
);

/** The fulfilment path, used for "next step" affordances. */
const HAPPY_PATH: OrderState[] = [
  "created", "awaiting_payment", "paid", "accepted", "processing", "ready", "dispatched", "delivered", "completed",
];

export function nextHappyState(state: OrderState): OrderState | null {
  const i = HAPPY_PATH.indexOf(state);
  return i >= 0 && i < HAPPY_PATH.length - 1 ? HAPPY_PATH[i + 1] : null;
}

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  created: "Created",
  awaiting_payment: "Awaiting payment",
  paid: "Paid · in escrow",
  accepted: "Accepted by seller",
  processing: "Processing",
  ready: "Ready for pickup",
  dispatched: "Dispatched",
  delivered: "Delivered",
  completed: "Completed",
  disputed: "Disputed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Pre-P1 status strings → states (for persisted demo data). */
export const LEGACY_STATUS_MAP: Record<string, OrderState> = {
  "payment-initiated": "awaiting_payment",
  "escrow-secured": "paid",
  "seller-accepted": "accepted",
  preparing: "processing",
  "delivery-assigned": "ready",
  "out-for-delivery": "dispatched",
  delivered: "delivered",
  "confirmation-pending": "delivered",
  "funds-released": "completed",
  "dispute-opened": "disputed",
  "refund-approved": "refunded",
  cancelled: "cancelled",
};

export function toOrderState(raw: string): OrderState {
  if ((ORDER_STATES as readonly string[]).includes(raw)) return raw as OrderState;
  return LEGACY_STATUS_MAP[raw] ?? "created";
}

export function orderStateLabel(raw: string): string {
  if ((ORDER_STATES as readonly string[]).includes(raw)) return ORDER_STATE_LABEL[raw as OrderState];
  return LEGACY_STATUS_MAP[raw] ? ORDER_STATE_LABEL[LEGACY_STATUS_MAP[raw]] : raw.replaceAll(/[-_]/g, " ");
}
