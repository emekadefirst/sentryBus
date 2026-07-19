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

// --- Example entries, for reference ---
//
// const zohoAdapter: ServiceAdapter = {
//   name: "zoho-crm",
//   enabled: true,
//   protocol: "http",
//   baseUrl: "https://www.zohoapis.com/crm/v6",
//   timeoutMs: 5000,
//   credentialKey: "ZOHO_CRM_TOKEN",
//   topics: ["driver.onboarded", "company.account.updated"],
//   rateLimit: { burst: 20, refillPerSecond: 5 },
//   retry: { maxAttempts: 5, backoff: "exponential", baseDelayMs: 500, jitter: true },
//   circuitBreaker: { failureThreshold: 5, windowMs: 60_000, cooldownMs: 30_000 },
//   envelopeVersion: "1.0",
//   // no webhookRoute/webhookSecret — outbound-only for now
// };
//
// const blnkAdapter: ServiceAdapter = {
//   name: "blnk-ledger",
//   enabled: true,
//   protocol: "http",
//   baseUrl: "https://ledger.internal.example.com",
//   timeoutMs: 8000,
//   credentialKey: "BLNK_API_KEY",
//   topics: ["shipment.delivered", "invoice.due"],
//   rateLimit: { burst: 10, refillPerSecond: 2 },
//   retry: { maxAttempts: 8, backoff: "exponential", baseDelayMs: 1000, jitter: true },
//   circuitBreaker: { failureThreshold: 3, windowMs: 60_000, cooldownMs: 45_000 },
//   webhookRoute: "/webhooks/blnk",
//   webhookSecret: "BLNK_WEBHOOK_SIGNING_SECRET",
//   envelopeVersion: "1.0",
// };