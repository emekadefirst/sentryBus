import { loadConfigFiles } from "../utils/loader";
import { readConfigFile } from "../utils/configFileReader";
import { loadServiceAdapters, type ServiceAdapter } from "../schemas/serviceAdaptor";
import { logger } from "../utils/logger";

let adapters: ServiceAdapter[] = [];

// Called once at boot. Fails loudly (loadServiceAdapters throws on a bad
// config) rather than letting a malformed *.config.toml surface as a mystery
// the first time something tries to dispatch to it.
export async function loadAdapters(dir = "bus"): Promise<ServiceAdapter[]> {
  const files = await loadConfigFiles(dir);
  const raw = await Promise.all(files.map((f) => readConfigFile(f)));
  adapters = loadServiceAdapters(raw).filter((a) => a.enabled);
  logger.info("adapters loaded", {
    count: adapters.length,
    names: adapters.map((a) => a.name),
  });
  return adapters;
}

export function adaptersForTopic(topic: string): ServiceAdapter[] {
  return adapters.filter((a) => a.topics.includes(topic));
}

export function getAdapter(name: string): ServiceAdapter | undefined {
  return adapters.find((a) => a.name === name);
}