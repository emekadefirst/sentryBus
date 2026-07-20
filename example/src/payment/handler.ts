import { Elysia } from "elysia";
import { paymentService } from "./service";
import { PaystackClient } from "../libs/paystack/client";

const paystack = new PaystackClient();

export const paymentHandler = new Elysia({ prefix: "/payments" })
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

    // Parse full payload for audit
    const payload = JSON.parse(body);

    // Publish to SentryBus → Blnk for audit
    await paymentService.handleWebhook(result.event, result.reference, payload.data ?? {});

    set.status = 200;
    return { received: true };
  });
