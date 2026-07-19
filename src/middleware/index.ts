import { logger } from "../utils/logger";

export type Handler = (req: Request) => Promise<Response> | Response;
export type Middleware = (next: Handler) => Handler;

export function compose(...middlewares: Middleware[]): (handler: Handler) => Handler {
  return (handler) => middlewares.reduceRight((next, mw) => mw(next), handler);
}

export const withRequestLog: Middleware = (next) => async (req) => {
  const start = Date.now();
  const res = await next(req);
  logger.info("request", {
    method: req.method,
    path: new URL(req.url).pathname,
    status: res.status,
    durationMs: Date.now() - start,
  });
  return res;
};

export const withErrorBoundary: Middleware = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    logger.error("unhandled request error", {
      path: new URL(req.url).pathname,
      error: (err as Error).message,
    });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
};