import { pathToFileURL } from "node:url";

/**
 * Read and parse a single config file. Bun's loader parses TOML natively on
 * import, so there's no parser to pull in — the extension drives it.
 *
 * ponytail: dynamic import caches by URL, so re-reading the same path returns
 * the first-parsed result. Fine while config is read once at boot; if hot-reload
 * is ever added, switch to `Bun.file(path).text()` + an explicit TOML parse.
 */
export async function readConfigFile<T = unknown>(path: string): Promise<T> {
  const mod = await import(pathToFileURL(path).href);
  return mod.default as T;
}
