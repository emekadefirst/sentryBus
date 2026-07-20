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
    const amount = Math.round(parseFloat(order.total) * 100); // Paystack expects amount in kobo as integer

    console.log(`[Payment] Initiating: email=${email}, amount=${amount}, total=${order.total}`);

    const result = await paystack.inipayment({ email, amount });

    // Publish payment.initiated to SentryBus → Blnk
    if (result.reference) {
      await publishToBus("payment.initiated", {
        orderId,
        email,
        amount,
        reference: result.reference,
        customerName: order.customerName,
        status: "pending",
      });
    }

    return result;
  }

  async handleWebhook(event: string, reference: string, rawPayload: Record<string, any>) {
    await publishToBus("payment.confirmed", {
      event,
      reference,
      status: "success",
      ...rawPayload,
    });
  }
}

export const paymentService = new PaymentService();
