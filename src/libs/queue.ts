import { Queue } from "bullmq";
import { bullConnection } from "../configs/redis";
import { getAdapter } from "../core/adapters";

export const QUEUE_NAME = "bus-events";

export const busQueue = new Queue(QUEUE_NAME, { connection: bullConnection });

// BullMQ ships "fixed" and "exponential" backoff, but neither reads a
// per-adapter delay/jitter, and "linear" isn't built in at all. One custom
// strategy reads the retry policy straight from the adapter's own
// *.config.toml (via the adapter registry), so behavior matches what's
// declared there exactly — no duplicated retry config riding along in the
// job payload.
export function backoffStrategy(
  attemptsMade: number,
  _type: string | undefined,
  _err: Error | undefined,
  job?: { data?: { adapterName?: string } }
): number {
  const adapterName = job?.data?.adapterName;
  const adapter = adapterName ? getAdapter(adapterName) : undefined;
  const retry = adapter?.retry ?? {
    backoff: "exponential" as const,
    baseDelayMs: 1000,
    jitter: true,
    maxAttempts: 5,
  };
  const noise = retry.jitter ? Math.random() * retry.baseDelayMs * 0.2 : 0;

  if (retry.backoff === "fixed") return retry.baseDelayMs + noise;
  if (retry.backoff === "linear") return retry.baseDelayMs * attemptsMade + noise;
  return retry.baseDelayMs * Math.pow(2, attemptsMade - 1) + noise; // exponential
}