import { describe, expect, it } from "vitest";
import { getOrderWorkflow } from "../src/lib/order-workflow";

const order = (overrides: Record<string, unknown> = {}) => ({
  status: "confirmed",
  payment_status: "unpaid",
  payment_method: "benefit",
  fulfillment_status: "ON_HOLD",
  fulfillment_method: "delivery",
  total: 13,
  advance_paid: 0,
  ...overrides,
});

describe("getOrderWorkflow", () => {
  it("requires manual BenefitPay validation", () => {
    const result = getOrderWorkflow(order());
    expect(result.nextAction).toBe("validate_payment");
    expect(result.needsAttention).toBe(true);
    expect(result.awaitingPayment).toBe(true);
  });

  it("treats unpaid COD as fulfillment work, not awaiting payment", () => {
    const result = getOrderWorkflow(order({ payment_method: "cod" }));
    expect(result.nextAction).toBe("pack_and_ship");
    expect(result.needsAttention).toBe(true);
    expect(result.awaitingPayment).toBe(false);
  });

  it("moves paid pickup orders through preparation and handover", () => {
    expect(
      getOrderWorkflow(order({ payment_status: "paid", fulfillment_method: "pickup" })).nextAction,
    ).toBe("prepare_pickup");
    expect(
      getOrderWorkflow(
        order({
          payment_status: "paid",
          fulfillment_method: "pickup",
          fulfillment_status: "READY_FOR_PICKUP",
        }),
      ).nextAction,
    ).toBe("hand_over_pickup");
  });

  it("collects COD only at pickup or delivery completion", () => {
    expect(
      getOrderWorkflow(
        order({
          payment_method: "cod",
          fulfillment_method: "pickup",
          fulfillment_status: "READY_FOR_PICKUP",
        }),
      ).nextAction,
    ).toBe("collect_and_hand_over");
    expect(
      getOrderWorkflow(order({ payment_method: "cod", fulfillment_status: "OUT_FOR_DELIVERY" }))
        .nextAction,
    ).toBe("collect_and_deliver");
  });

  it("never flags terminal orders even if stale payment fields remain", () => {
    for (const fulfillment_status of ["COMPLETED", "DELIVERED", "CANCELLED", "RETURNED"]) {
      const result = getOrderWorkflow(order({ fulfillment_status }));
      expect(result.nextAction).toBe("none");
      expect(result.needsAttention).toBe(false);
      expect(result.awaitingPayment).toBe(false);
    }
  });

  it("flags failed delivery for resolution", () => {
    const result = getOrderWorkflow(
      order({ payment_method: "cod", fulfillment_status: "DELIVERY_FAILED" }),
    );
    expect(result.nextAction).toBe("resolve_delivery_failure");
    expect(result.needsAttention).toBe(true);
  });
});
