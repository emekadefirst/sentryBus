type Fields = Record<string, unknown>;

const SECRET_KEY_PATTERN = /key|secret|token|password|credential/i;

function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([k]) => !SECRET_KEY_PATTERN.test(k))
  );
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...safe }));
}

export const logger = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};