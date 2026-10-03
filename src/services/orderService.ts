import { canTransition, orderStateLabel, type OrderState } from "@/lib/naflis/orderMachine";
import { useNaflis } from "@/lib/naflis/store";
import { describePaymentError, paymentMode, requestServerTransition } from "@/services/walletService";

export interface TransitionResult {
  ok: boolean;
  message: string;
}

/**
 * Moves an order to `to`. Server-backed orders are validated by the payments
 * service first (actor + state machine + delivery gate); the local side effects
 * in `applyLocal` only run once the server has accepted the change.
 */
export async function runOrderTransition(
  orderId: string,
  to: OrderState,
  applyLocal: () => boolean | TransitionResult | void | null | undefined | object,
  note?: string,
): Promise<TransitionResult> {
  const order = useNaflis.getState().orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, message: "Order not found." };
  if (!canTransition(order.status, to)) {
    return { ok: false, message: `An order that is "${orderStateLabel(order.status)}" can't move to "${orderStateLabel(to)}".` };
  }
  if (to === "dispatched" && order.deliveryUnlocked === false) {
    return { ok: false, message: "Dispatch is locked until the buyer's payment plan allows delivery." };
  }

  if (order.serverBacked && paymentMode() === "server") {
    try {
      await requestServerTransition(orderId, to, note);
    } catch (err) {
      return { ok: false, message: describePaymentError(err).message };
    }
  }

  const res = applyLocal();
  if (res === false || res === null) return { ok: false, message: "That change couldn't be applied." };
  if (res && typeof res === "object" && "ok" in res && typeof (res as TransitionResult).ok === "boolean") {
    return res as TransitionResult;
  }
  return { ok: true, message: `Order is now ${orderStateLabel(to).toLowerCase()}.` };
}
