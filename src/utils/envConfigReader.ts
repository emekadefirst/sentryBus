import { pathToFileURL } from "node:url";
import { envSchemas, type envDTO } from "../schemas/envConfigSchemas";

let _config: envDTO | null = null;

/**
 * Load and validate bus/env.config.toml once at boot. Caches the result.
 * Fails loudly if the file is missing or doesn't match the schema.
 */
export async function loadEnvConfig(path = "bus/env.config.toml"): Promise<envDTO> {
  if (_config) return _config;
  const abs = Bun.resolveSync(path, process.cwd());
  const mod = await import(pathToFileURL(abs).href);
  _config = envSchemas.parse(mod.default);
  return _config;
}

/**
 * Synchronous access after loadEnvConfig() has run.
 */
export function getEnvConfig(): envDTO {
  if (!_config) throw new Error("envConfig not loaded — call loadEnvConfig() at boot first");
  return _config;
}
