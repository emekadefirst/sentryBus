export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    missingVars.push(key);
    return "";
  }
  return value;
}

const missingVars: string[] = [];