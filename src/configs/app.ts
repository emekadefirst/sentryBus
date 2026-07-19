import { requireEnv } from "./env";

export const appConfig = {
  port: Number(requireEnv("PORT")  ?? 8085),
  host: requireEnv("HOST")  ?? "0.0.0.0",
  env: (requireEnv("NODE_ENV") ?? "dev") as
    | "dev"
    | "staging"
    | "prod"
    | "test",
  apiVersion: requireEnv("VERSION") ?? "v1",
  baseUrl: requireEnv("URL") ?? "http://localhost:8085",
  isProd: requireEnv("NODE_ENV") === "production",
} as const;
