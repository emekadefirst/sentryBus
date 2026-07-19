import Redis from "ioredis";
import { getEnvConfig } from "../utils/envConfigReader";

let _connection: Redis | null = null;

/**
 * Lazy-init the Redis connection. Must be called after loadEnvConfig().
 */
export function getBullConnection(): Redis {
  if (_connection) return _connection;

  const env = getEnvConfig();

  _connection = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    username: env.REDIS_USERNAME,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 500, 10_000);
    },
  });

  _connection.on("connect", () => console.log("[Redis] connected"));
  _connection.on("error", (err) => console.error("[Redis] error:", err.message));

  return _connection;
}
