import { loadConfigFiles } from "../utils/loadConfig";
import { readConfigFile } from "../utils/configFileReader";
import { loadServiceAdapters, type ServiceAdapter } from "../schemas/serviceAdaptorSchemas";
import { logger } from "../utils/logger";

let adapters: ServiceAdapter[] = [];

// Called once at boot. Fails loudly (loadServiceAdapters throws on a bad
// config) rather than letting a malformed *.config.toml surface as a mystery
// the first time something tries to dispatch to it.
export async function loadAdapters(dir = "bus"): Promise<ServiceAdapter[]> {
  const files = await loadConfigFiles(dir);
  const raw = await Promise.all(files.map((f) => readConfigFile(f)));
  adapters = loadServiceAdapters(raw);
  logger.info("adapters loaded", {
    count: adapters.length,
    names: adapters.map((a) => a.name),
  });
  return adapters;
}

export function adaptersForTopic(topic: string): ServiceAdapter[] {
  return adapters.filter((a) => a.enabled && a.topics.includes(topic));
}

export function getAdapter(name: string): ServiceAdapter | undefined {
  return adapters.find((a) => a.name === name && a.enabled);
}

/** Get all adapters including disabled — for the dashboard. */
export function getAllAdapters(): ServiceAdapter[] {
  return adapters;
}

/** Toggle adapter enabled state at runtime. Returns new state. */
export function toggleAdapter(name: string): boolean | null {
  const adapter = adapters.find((a) => a.name === name);
  if (!adapter) return null;
  adapter.enabled = !adapter.enabled;
  logger.info("adapter toggled", { name, enabled: adapter.enabled });
  return adapter.enabled;
}