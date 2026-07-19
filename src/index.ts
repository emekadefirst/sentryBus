import { appConfig } from "./configs";

const server = Bun.serve({
  port: appConfig.port,
  hostname: appConfig.host,
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") {
      return Response.json({ status: "ok", env: appConfig.env });
    }
    return new Response("service bus up", { status: 200 });
  },
});

console.log(`service bus listening on ${server.url}`);
