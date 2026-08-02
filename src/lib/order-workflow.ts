import { resolvePaymentStatus, type PaymentBadge } from "./payment-status";

export type OrderWorkflowInput = {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  fulfillment_status?: string | null;
  fulfillment_method?: string | null;
  total?: number | string | null;
  advance_paid?: number | string | null;
  paid_amount?: number | string | null;
};

export type FulfillmentStage =
  | "on_hold"
  | "needs_packing"
  | "assigned"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "failed"
  | "returned";

export type OrderNextAction =
  | "validate_payment"
  | "prepare_pickup"
  | "pack_and_ship"
  | "confirm_pickup"
  | "hand_over_pickup"
  | "collect_and_hand_over"
  | "mark_delivered"
  | "collect_and_deliver"
  | "deliver_digital"
  | "resolve_delivery_failure"
  | "review_order"
  | "none";

export type OrderWorkflow = {
  payment: PaymentBadge;
  fulfillment: FulfillmentStage;
  nextAction: OrderNextAction;
  needsAttention: boolean;
  awaitingPayment: boolean;
  withCourier: boolean;
  terminal: boolean;
  isCod: boolean;
  isManualBenefit: boolean;
  outstanding: number;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export function getFulfillmentStage(order: OrderWorkflowInput): FulfillmentStage {
  const fulfillment = normalize(order.fulfillment_status);
  const status = normalize(order.status);

  if (
    ["completed", "delivered", "picked_up"].includes(fulfillment) ||
    ["completed", "delivered"].includes(status)
  ) {
    return "completed";
  }
  if (
    ["cancelled", "canceled"].includes(fulfillment) ||
    ["cancelled", "canceled"].includes(status)
  ) {
    return "cancelled";
  }
  if (fulfillment === "returned") return "returned";
  if (["delivery_failed", "failed"].includes(fulfillment)) return "failed";
  if (["shipped", "out_for_delivery", "ready_for_delivery"].includes(fulfillment)) {
    return "out_for_delivery";
  }
  if (fulfillment === "assigned") {
    return "assigned";
  }
  if (fulfillment === "ready_for_pickup") return "ready_for_pickup";
  if (fulfillment === "needs_packing") return "needs_packing";
  return "on_hold";
}

export function getOrderWorkflow(order: OrderWorkflowInput): OrderWorkflow {
  const total = Number(order.total ?? 0);
  const paid = Number(order.advance_paid ?? order.paid_amount ?? 0);
  const payment = resolvePaymentStatus(order.payment_status, order.status, total, paid);
  const fulfillment = getFulfillmentStage(order);
  const method = normalize(order.payment_method);
  const fulfillmentMethod = normalize(order.fulfillment_method) || "delivery";
  const isCod = ["cod", "cash", "cash_on_delivery", "cash on delivery"].includes(method);
  const isManualBenefit = ["benefit", "benefitpay", "benefit_pay", "bank_transfer"].includes(
    method,
  );
  const terminal =
    ["completed", "cancelled", "returned"].includes(fulfillment) || payment === "refunded";
  const outstanding = Math.max(0, Number((total - paid).toFixed(3)));

  let nextAction: OrderNextAction = "none";

  if (!terminal) {
    if (fulfillment === "failed") {
      nextAction = "resolve_delivery_failure";
    } else if (isManualBenefit && payment !== "paid") {
      nextAction = "validate_payment";
    } else if (fulfillmentMethod === "pickup") {
      if (["on_hold", "needs_packing"].includes(fulfillment) && (payment === "paid" || isCod)) {
        nextAction = "prepare_pickup";
      } else if (fulfillment === "ready_for_pickup") {
        nextAction =
          payment === "paid" || outstanding <= 0 ? "hand_over_pickup" : "collect_and_hand_over";
      }
    } else if (fulfillmentMethod === "digital") {
      if (payment === "paid") nextAction = "deliver_digital";
    } else if (
      ["on_hold", "needs_packing"].includes(fulfillment) &&
      (payment === "paid" || isCod)
    ) {
      nextAction = "pack_and_ship";
    } else if (fulfillment === "assigned") {
      nextAction = "confirm_pickup";
    } else if (fulfillment === "out_for_delivery") {
      nextAction =
        payment === "paid" || outstanding <= 0 ? "mark_delivered" : "collect_and_deliver";
    } else if (!method) {
      nextAction = "review_order";
    }
  }

  // COD is intentionally excluded: payment is expected at pickup/delivery and
  // its current operational action is preparation or handover, not "wait".
  const awaitingPayment = !terminal && !isCod && payment !== "paid";

  return {
    payment,
    fulfillment,
    nextAction,
    needsAttention: nextAction !== "none",
    awaitingPayment,
    withCourier: fulfillment === "out_for_delivery",
    terminal,
    isCod,
    isManualBenefit,
    outstanding,
  };
}
