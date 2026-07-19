const missingVars: string[] = [];

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    missingVars.push(key);
    return "";
  }
  return value;
}

// Call once after all requireEnv() calls have run (i.e. after all config
// modules import). Fails loudly with every missing var listed at once,
// rather than crashing on the first and hiding the rest.
export function assertEnvComplete(): void {
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required env vars: ${missingVars.join(", ")}\n` +
      `Set them in .env or the environment before starting the bus.`
    );
  }
}
