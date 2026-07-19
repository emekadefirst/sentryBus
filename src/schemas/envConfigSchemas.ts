import { z } from "zod";

export const envSchemas = z.object({
  PORT: z.number().int().positive(),
  HOST: z.string(),
  URL: z.string().url(), // Simplest way to validate standard URLs
  REDIS_USERNAME: z.string(),
  REDIS_PASSWORD: z.string(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.number().int().positive(),
});

export type envDTO = z.infer<typeof envSchemas>;
