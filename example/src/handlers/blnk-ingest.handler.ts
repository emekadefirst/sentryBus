import { Elysia } from "elysia";
import { FetchClient } from "../libs/http/core";

const BLNK_URL = process.env.BLNK_BASE_URL ?? "http://localhost:5001";
const BLNK_KEY = process.env.BLNK_API_KEY ?? "";

const blnkClient = new FetchClient(BLNK_URL, {
  headers: {
    "X-Blnk-Key": BLNK_KEY,
    "Content-Type": "application/json",
  },
});

/**
 * Transforms a SentryBus envelope into a Blnk transaction and forwards it.
 * SentryBus dispatches envelopes here; we reshape them for Blnk's API.
 */
export const blnkIngestHandler = new Elysia({ prefix: "/webhooks" })
  .post("/blnk-ingest", async ({ body, set }) => {
    const envelope = body as {
      id: string;
      type: string;
      version: string;
      correlationId: string;
      timestamp: string;
      payload: Record<string, any>;
    };

    const { type, payload, correlationId } = envelope;

    // Build Blnk transaction from envelope payload
    const blnkTransaction = {
      amount: payload.amount ?? 0,
      precision: 100,
      currency: "NGN",
      reference: payload.reference ?? correlationId,
      source: "@PaymentPool",
      destination: `@Order-${payload.orderId ?? "unknown"}`,
      description: `${type} — ${payload.customerName ?? payload.email ?? ""}`,
      meta_data: {
        event_type: type,
        envelope_id: envelope.id,
        order_id: payload.orderId,
        email: payload.email,
        status: payload.status,
        timestamp: envelope.timestamp,
      },
    };

    // Forward to Blnk
    const response = await blnkClient.post("/transactions", blnkTransaction);

    if (!response.ok) {
      console.error(`[Blnk Ingest] Failed:`, response.data);
      set.status = response.status;
      return { error: "Blnk rejected transaction", details: response.data };
    }

    console.log(`[Blnk Ingest] Transaction created: ${type} → ref: ${blnkTransaction.reference}`);
    return { ok: true, blnkResponse: response.data };
  });
