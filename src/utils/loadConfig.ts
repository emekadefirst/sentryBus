import { Glob } from "bun";

// Adapter configs live one-per-file so a bad edit to one can't fail the whole set.
const CONFIG_GLOB = "*.config.toml";

/**
 * Find adapter config files in `dir`. Returns absolute paths, sorted for a
 * stable, deterministic load order. Missing dir just yields an empty list.
 */
export async function loadConfigFiles(dir = "bus"): Promise<string[]> {
  const glob = new Glob(CONFIG_GLOB);
  const files: string[] = [];
  for await (const path of glob.scan({ cwd: dir, absolute: true, onlyFiles: true })) {
    files.push(path);
  }
  return files.sort();
}
