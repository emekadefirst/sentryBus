#!/usr/bin/env bun
import { loadEnvConfig } from "./utils/envConfigReader";
import { getAppConfig } from "./configs";
import { injest } from "./core/injest";
import { loadAdapters } from "./core/adapters";
import { startDispatchWorker } from "./core/dispatcher";
import { compose, withErrorBoundary, withRequestLog } from "./middleware";
import { printBanner } from "./utils/banner";

// Load env.config.toml first — everything else reads from it.
await loadEnvConfig();

const appConfig = getAppConfig();
const adapters = await loadAdapters();
startDispatchWorker();

const handleInjest = compose(withErrorBoundary, withRequestLog)(injest);

const server = Bun.serve({
  port: appConfig.port,
  hostname: appConfig.host,
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    if (pathname === "/publish" && req.method === "POST") {
      return handleInjest(req);
    }
    return new Response("not found", { status: 404 });
  },
});

printBanner(adapters, server.port!);
