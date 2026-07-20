import { Elysia } from "elysia";
import { paymentService } from "./service";
import { PaystackClient } from "../libs/paystack/client";

const paystack = new PaystackClient();

export const paymentHandler = new Elysia({ prefix: "/payments" })
  // POST /payments/initiate
  .post("/initiate", async ({ body, set }) => {
    const { email, orderId, amount } = body as {
      email: string;
      orderId: string;
      amount: number;
    };

    if (!email || !orderId || !amount) {
      set.status = 400;
      return { error: "email, orderId, and amount are required" };
    }

    const result = await paymentService.initiatePayment({ email, orderId, amount });

    if (result.message && !result.url) {
      set.status = 400;
      return { error: result.message };
    }

    return result;
  })

  // POST /payments/webhook — Paystack webhook receiver
  .post("/webhook", async ({ request, set }) => {
    const signature = request.headers.get("x-paystack-signature");
    if (!signature) {
      set.status = 401;
      return { error: "Missing signature" };
    }

    const body = await request.text();
    const result = paystack.wbHandler(body, signature);

    if (!result) {
      set.status = 401;
      return { error: "Invalid signature" };
    }

    // TODO: update order status, publish event to SentryBus
    console.log(`[Payment] Webhook verified: ${result.event} — ref: ${result.reference}`);

    set.status = 200;
    return { received: true };
  });
