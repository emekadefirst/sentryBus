type Fields = Record<string, unknown>;

const SECRET_KEY_PATTERN = /key|secret|token|password|credential/i;

export interface LogEntry {
  time: string;
  level: "info" | "warn" | "error";
  msg: string;
  [key: string]: unknown;
}

// Ring buffer for dashboard log stream
const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];
const sseClients = new Set<ReadableStreamDefaultController>();

export function getLogBuffer(): LogEntry[] {
  return logBuffer;
}

export function subscribeSSE(controller: ReadableStreamDefaultController) {
  sseClients.add(controller);
}

export function unsubscribeSSE(controller: ReadableStreamDefaultController) {
  sseClients.delete(controller);
}

function pushToClients(entry: LogEntry) {
  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const c of sseClients) {
    try { c.enqueue(new TextEncoder().encode(data)); } catch { sseClients.delete(c); }
  }
}

function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([k]) => !SECRET_KEY_PATTERN.test(k))
  );
  const entry: LogEntry = { time: new Date().toISOString(), level, msg, ...safe };
  console.log(JSON.stringify(entry));

  // Feed ring buffer + SSE
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  pushToClients(entry);
}

export const logger = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};