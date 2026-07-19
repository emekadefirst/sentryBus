import Redis from "ioredis";
import { requireEnv } from "./env";

// Dedicated connection for BullMQ. Nothing else in the bus talks to Redis
// directly right now — circuit breaker state lives in-process (see
// core/circuitBreaker.ts). If something else needs Redis later, give it its
// own connection rather than sharing this one.
export const bullConnection = new Redis({
  host: requireEnv("REDIS_HOST"),
  port: Number(requireEnv("REDIS_PORT")),
  username: requireEnv("REDIS_USERNAME"),
  password: requireEnv("REDIS_PASSWORD"),
  // Required by BullMQ — its blocking calls fail outright without this.
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    // Keep retrying rather than giving up — a client that stops reconnecting
    // after a few tries means the bus silently stops processing jobs until
    // a manual restart.
    return Math.min(times * 500, 10_000);
  },
});

bullConnection.on("connect", () => console.log("[Redis] connected"));
bullConnection.on("error", (err) => console.error("[Redis] error:", err.message));