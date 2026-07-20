import { OrderRepository } from "../repos/order.repository";
import { PaystackClient } from "../libs/paystack/client";
import type { Response } from "../libs/paystack/types";

const BUS_URL = process.env.URL ?? "http://localhost:8085";

const orderRepo = new OrderRepository();
const paystack = new PaystackClient();

async function publishToBus(type: string, payload: Record<string, any>) {
  try {
    const res = await fetch(`${BUS_URL}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
    const result = await res.json() as { dispatchedTo: number };
    console.log(`[Payment→Bus] ${type} → dispatched to ${result.dispatchedTo} adapter(s)`);
  } catch (error) {
    console.error(`[Payment→Bus] Failed to publish ${type}:`, error);
  }
}

export class PaymentService {
  async initiatePayment(orderId: string): Promise<Response> {
    const order = await orderRepo.findById(orderId);
    if (!order) {
      return { message: "Order not found" };
    }

    const email = order.customerContact;
    const amount = Math.round(parseFloat(order.total) * 100); // Paystack expects amount in kobo

    const result = await paystack.inipayment({ email, amount });

    // Publish payment.initiated to SentryBus → Blnk (shape matches Blnk's /transactions body)
    if (result.reference) {
      await publishToBus("payment.initiated", {
        precise_amount: amount,
        reference: result.reference,
        currency: "NGN",
        precision: 100,
        source: "@FundingPool",
        destination: `@Order-${orderId}`,
        description: `Payment initiated for order ${orderId}`,
        allow_overdraft: true,
        meta_data: {
          orderId,
          email,
          customerName: order.customerName,
          status: "pending",
          event: "payment.initiated",
        },
      });
    }

    return result;
  }

  async handleWebhook(event: string, reference: string, rawPayload: Record<string, any>) {
    const amount = rawPayload.amount ?? 0;
    const orderId = rawPayload.metadata?.orderId ?? reference;

    await publishToBus("payment.confirmed", {
      precise_amount: amount,
      reference: `${reference}-confirmed`,
      currency: rawPayload.currency ?? "NGN",
      precision: 100,
      source: `@Order-${orderId}`,
      destination: "@RevenuePool",
      description: `Payment confirmed for reference ${reference}`,
      allow_overdraft: true,
      meta_data: {
        event,
        reference,
        status: "success",
        gateway_response: rawPayload.gateway_response,
        paid_at: rawPayload.paid_at,
        customer: rawPayload.customer,
      },
    });
  }
}

export const paymentService = new PaymentService();
