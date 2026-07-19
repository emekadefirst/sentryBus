import { appConfig } from "./configs";
import { injest } from "./core/injest";
import { loadAdapters } from "./core/adapters";
import { startDispatchWorker } from "./core/dispatcher";
import { compose, withErrorBoundary, withRequestLog } from "./middleware";
await loadAdapters();
startDispatchWorker();

const handleInjest = compose(withErrorBoundary, withRequestLog)(injest);

const server = Bun.serve({
  port: appConfig.port,
  hostname: appConfig.host,
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") {
      return Response.json({ status: "ok", env: appConfig.env });
    }
    if (pathname === "/publish" && req.method === "POST") {
      return handleInjest(req);
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`service bus listening on ${server.url}`);