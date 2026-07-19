import { z } from "zod";
import { randomUUID } from "node:crypto";

export const EnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string(), // topic, e.g. "order.created"
  version: z.string(), // envelope schema version this was built against
  correlationId: z.string(),
  timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

// Producers only supply intent, not bookkeeping — the bus stamps id,
// version, and timestamp itself so a producer can't get those fields wrong
// or forget them.
const PublishRequestSchema = z.object({
  type: z.string().min(1),
  correlationId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const ENVELOPE_VERSION = "1.0";

export function buildEnvelope(raw: unknown): Envelope {
  const req = PublishRequestSchema.parse(raw);
  return {
    id: randomUUID(),
    type: req.type,
    version: ENVELOPE_VERSION,
    correlationId: req.correlationId ?? randomUUID(),
    timestamp: new Date().toISOString(),
    payload: req.payload,
  };
}