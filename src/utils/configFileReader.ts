import { pathToFileURL } from "node:url";

// Indirection prevents the bundler from rewriting the dynamic import
// into Bun.resolveSync (which uses module resolution, not filesystem paths).
const dynamicImport = new Function("specifier", "return import(specifier)") as (s: string) => Promise<{ default: unknown }>;

/**
 * Read and parse a single config file. Bun's loader parses TOML natively on
 * import, so there's no parser to pull in — the extension drives it.
 */
export async function readConfigFile<T = unknown>(path: string): Promise<T> {
  const mod = await dynamicImport(pathToFileURL(path).href);
  return mod.default as T;
}
