import { z } from "zod";

// Retry policy — a count alone can't express backoff shape, so it's its own object.
const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoff: z.enum(["fixed", "linear", "exponential"]),
  baseDelayMs: z.number().int().positive(),
  jitter: z.boolean().default(true),
});

// Circuit breaker — stop hammering a downed service, probe periodically, resume when healthy.
const CircuitBreakerSchema = z.object({
  failureThreshold: z.number().int().positive(), // consecutive failures before opening
  windowMs: z.number().int().positive(),         // time window the threshold applies over
  cooldownMs: z.number().int().positive(),       // wait before the next health probe
});

// Token bucket needs both numbers — a ceiling with no refill rate can't drive a limiter.
const RateLimitSchema = z.object({
  burst: z.number().int().positive(),
  refillPerSecond: z.number().positive(),
});

export const ServiceAdapterSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),

  protocol: z.enum(["http", "sse", "ws"]),
  baseUrl: z.string().url(),
  timeoutMs: z.number().int().positive(),

  // Reference to where the credential lives (env var name / secrets-manager key) —
  // never the credential itself. Resolved at boot, not stored here.
  credentialKey: z.string(),

  // Header name + scheme for the credential. Defaults to "Authorization: Bearer <value>".
  // Set to a custom header name (e.g. "X-Blnk-Key") for services that don't use Bearer auth.
  credentialHeader: z.string().default("Authorization"),
  credentialScheme: z.string().default("Bearer"),

  // One or more event types this adapter cares about. An adapter needing several
  // topics gets one entry with several topics, not several entries.
  topics: z.array(z.string()).min(1),

  rateLimit: RateLimitSchema,
  retry: RetryPolicySchema,
  circuitBreaker: CircuitBreakerSchema,

  // Only present for services that call back into the bus (e.g. Blnk's async
  // transaction-state webhooks). Omit both for one-directional adapters (e.g. a
  // Zoho sync that's outbound-only).
  webhookRoute: z.string().optional(),
  webhookSecret: z.string().optional(),

  // Envelope/schema version this adapter was built against — protects you when
  // the envelope shape changes later and older adapters are still deployed.
  envelopeVersion: z.string(),
});

export type ServiceAdapter = z.infer<typeof ServiceAdapterSchema>;

// Validates the whole config file at boot. Fails loudly with the specific field
// that's wrong, rather than an adapter silently misbehaving three requests in.
export function loadServiceAdapters(raw: unknown): ServiceAdapter[] {
  return z.array(ServiceAdapterSchema).parse(raw);
}

