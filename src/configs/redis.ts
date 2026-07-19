import { requireEnv } from "./env";
import Redis from "ioredis";

const redisEnv = {
  username: requireEnv("REDIS_USERNAME"),
  password: requireEnv("REDIS_PASSWORD"),
  host: requireEnv("REDIS_HOST"),
  port: Number(requireEnv("REDIS_PORT")),
};

export const redisConfig = redisEnv;

export const redis = new Redis({
  ...redisEnv,
  // ponytail: BullMQ needs this to be `null` on blocking connections. Give
  // BullMQ its own connection, or set null here if this instance feeds it.
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    if (times > 3) return null; // stop after 3 attempts
    return Math.min(times * 200, 2000); // 200ms, 400ms, 800ms backoff
  },
  reconnectOnError(err) {
    return err.message.includes("READONLY"); // cluster failover
  },
});

redis.on("connect", () => console.log("[Redis] Connected"));
redis.on("error", (err) => console.error("[Redis] Error:", err.message));
redis.on("reconnecting", () => console.log("[Redis] Reconnecting..."));
