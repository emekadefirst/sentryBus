function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    missingVars.push(key);
    return "";
  }
  return value;
}

const missingVars: string[] = [];

// ── Database ──────────────────────────────────────────────────────────────────

const database = {
  port: process.env.DB_PORT ?? "5432",
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
  host: process.env.DB_HOST ?? "localhost",
};


export const databaseConfig = {
  dbUrl: `postgresql://${database.user}:${database.password}@${database.host}:${database.port}/${database.database}`,
};


export const paysatckConfig = {
  secretKey: requireEnv("PAYSATCK_SECRET_KEY"),
  url: requireEnv("PAYSATCK_URL"),
};


export const hasuraConfig = {
  url: requireEnv("HASURA_URL"),
  adminSecret: requireEnv("HASURA_ADMIN_SECRET"),
  cloudIp: requireEnv("HASURA_CLOUD_IP"),
};
