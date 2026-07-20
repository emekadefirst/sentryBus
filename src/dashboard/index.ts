import { getAllAdapters, toggleAdapter } from "../core/adapters";
import { getAllBreakerStates } from "../core/circuitBreaker";
import { getLogBuffer, subscribeSSE, unsubscribeSSE } from "../utils/logger";
import { dashboardHTML } from "./page";

/**
 * Handle all /_bus/* routes. Returns null if path doesn't match,
 * letting the main router continue.
 */
export function handleDashboardRequest(req: Request): Response | null {
  const { pathname } = new URL(req.url);

  if (!pathname.startsWith("/console")) return null;

  // Dashboard HTML
  if (pathname === "/console" || pathname === "/console/") {
    return new Response(dashboardHTML(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Topology API
  if (pathname === "/console/api/topology" && req.method === "GET") {
    const adapters = getAllAdapters();
    const breakers = getAllBreakerStates();

    const nodes = adapters.map((a) => ({
      name: a.name,
      enabled: a.enabled,
      protocol: a.protocol,
      baseUrl: a.baseUrl,
      topics: a.topics,
      circuitBreaker: breakers[a.name] ?? { state: "closed", failures: 0 },
    }));

    // Edges: topic → adapter
    const edges: { from: string; to: string }[] = [];
    for (const a of adapters) {
      for (const t of a.topics) {
        edges.push({ from: t, to: a.name });
      }
    }

    return Response.json({ nodes, edges });
  }

  // Log buffer (initial load)
  if (pathname === "/console/api/logs" && req.method === "GET") {
    return Response.json(getLogBuffer());
  }

  // SSE log stream
  if (pathname === "/console/api/logs/stream" && req.method === "GET") {
    let controller: ReadableStreamDefaultController;
    let heartbeat: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start(c) {
        controller = c;
        subscribeSSE(controller);
        // Keep-alive ping every 30s to prevent idle timeout
        heartbeat = setInterval(() => {
          try { controller.enqueue(new TextEncoder().encode(":ping\n\n")); } catch { clearInterval(heartbeat); }
        }, 30_000);
      },
      cancel() {
        clearInterval(heartbeat);
        unsubscribeSSE(controller);
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  // Toggle adapter
  if (pathname.startsWith("/console/api/adapters/") && req.method === "POST") {
    const parts = pathname.split("/");
    // /_bus/api/adapters/:name/toggle
    if (parts[5] === "toggle") {
      const name = parts[4];
      if (!name) return Response.json({ error: "missing name" }, { status: 400 });
      const result = toggleAdapter(decodeURIComponent(name));
      if (result === null) {
        return Response.json({ error: "adapter not found" }, { status: 404 });
      }
      return Response.json({ name, enabled: result });
    }
  }

  return new Response("not found", { status: 404 });
}
