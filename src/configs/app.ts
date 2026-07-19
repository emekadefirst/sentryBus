import { getEnvConfig } from "../utils/envConfigReader";

export function getAppConfig() {
  const env = getEnvConfig();
  return {
    port: env.PORT,
    host: env.HOST,
    baseUrl: env.URL,
  } as const;
}
