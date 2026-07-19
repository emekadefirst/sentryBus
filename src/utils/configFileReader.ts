import { pathToFileURL } from "node:url";

/**
 * Read and parse a single config file. Bun's loader parses TOML natively on
 * import, so there's no parser to pull in — the extension drives it.
 */
export async function readConfigFile<T = unknown>(path: string): Promise<T> {
  const mod = await import(pathToFileURL(path).href);
  return mod.default as T;
}
