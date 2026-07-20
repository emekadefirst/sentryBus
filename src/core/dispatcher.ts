import { Worker, type Job } from "bullmq";
import { getBullConnection } from "../configs/redis";
import { QUEUE_NAME, backoffStrategy } from "../libs/queue";
import { getAdapter } from "./adapters";
import { allowDispatch, recordSuccess, recordFailure } from "./circuitBreaker";
import { logger } from "../utils/logger";
import type { Envelope } from "./envelop";

interface DispatchJobData {
  envelope: Envelope;
  adapterName: string;
}

async function processDispatchJob(job: Job<DispatchJobData>) {
  const { envelope, adapterName } = job.data;
  const adapter = getAdapter(adapterName);

  if (!adapter) {
    // Config was disabled/removed after the job was already queued.
    logger.warn("adapter no longer configured, dropping job", {
      adapterName,
      envelopeId: envelope.id,
    });
    return;
  }

  if (!allowDispatch(adapter.name, adapter.circuitBreaker.cooldownMs)) {
    // Breaker's open — fail fast without touching the network, let BullMQ's
    // own retry/backoff schedule the next attempt.
    throw new Error(`circuit open for ${adapter.name}`);
  }

  // Placeholder outbound call — swap this for each adapter's real request
  // shape (Zoho's OAuth header, Blnk's transaction payload) once those are
  // built. What stays the same regardless of adapter: timeout, credential
  // resolution by reference, and how success/failure feed the breaker.
  const credential = process.env[adapter.credentialKey];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), adapter.timeoutMs);

  try {
    const res = await fetch(adapter.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Bus metadata as headers — envelope stays internal, but tracing survives.
        "x-sentrybus-envelope-id": envelope.id,
        "x-sentrybus-event-type": envelope.type,
        "x-sentrybus-correlation-id": envelope.correlationId,
        ...(credential
          ? { [adapter.credentialHeader]: adapter.credentialScheme ? `${adapter.credentialScheme} ${credential}` : credential }
          : {}),
      },
      body: JSON.stringify(envelope.payload),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`${adapter.name} responded ${res.status}`);

    recordSuccess(adapter.name);
    logger.info("dispatched", {
      adapterName: adapter.name,
      envelopeId: envelope.id,
      attempt: job.attemptsMade + 1,
    });
  } catch (err) {
    recordFailure(adapter.name, adapter.circuitBreaker.failureThreshold);
    logger.warn("dispatch failed", {
      adapterName: adapter.name,
      envelopeId: envelope.id,
      attempt: job.attemptsMade + 1,
      error: (err as Error).message,
    });
    throw err; // re-throw so BullMQ counts the attempt and retries/dead-letters
  } finally {
    clearTimeout(timeout);
  }
}

export function startDispatchWorker(): Worker<DispatchJobData> {
  const worker = new Worker<DispatchJobData>(QUEUE_NAME, processDispatchJob, {
    connection: getBullConnection(),
    settings: { backoffStrategy },
  });

  worker.on("failed", (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      logger.error("dead-lettered", {
        adapterName: job.data.adapterName,
        envelopeId: job.data.envelope.id,
        error: err.message,
      });
    }
  });

  return worker;
}