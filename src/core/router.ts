import { getBusQueue } from "../libs/queue";
import { adaptersForTopic } from "./adapters";
import { logger } from "../utils/logger";
import type { Envelope } from "./envelop";

// Per-adapter jobs, not one shared job per envelope — a Blnk failure retries
// independently of a Zoho dispatch that already succeeded. Returns how many
// adapters the envelope was actually routed to.
export async function routeEnvelope(envelope: Envelope): Promise<number> {
  const adapters = adaptersForTopic(envelope.type);

  if (adapters.length === 0) {
    logger.warn("no adapter subscribed to topic", {
      type: envelope.type,
      envelopeId: envelope.id,
    });
    return 0;
  }

  const queue = getBusQueue();

  await Promise.all(
    adapters.map((adapter) =>
      queue.add(
        adapter.name,
        { envelope, adapterName: adapter.name },
        {
          jobId: `${envelope.id}:${adapter.name}`,
          attempts: adapter.retry.maxAttempts,
          backoff: { type: "custom" },
        }
      )
    )
  );

  return adapters.length;
}