/**
 * FlowMate MCP server.
 *
 * A stateless Streamable HTTP MCP endpoint at POST /mcp. Every tool call is
 * forwarded to the public FlowMate API (see lib/config.ts) using the caller's
 * own bearer token.
 */
import { Application, oakCors, Router } from "./deps.ts";
import mcp from "./routes/mcp.ts";
import { PORT } from "./lib/config.ts";
import { setupLog } from "./lib/logger.ts";

await setupLog();

const app = new Application();
app.use(
  oakCors({
    origin: true,
    credentials: true,
    allowedHeaders: "*",
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"],
    maxAge: 0,
  }),
);

app.addEventListener("error", (event) => {
  console.log(event.error);
});

app.use(async (ctx, next) => {
  await next();
  ctx.response.headers.set("Cache-Control", "no-store,max-age=0");
});

const healthcheck = new Router();
healthcheck.get("/healthcheck", (ctx) => {
  ctx.response.body = { status: "ok" };
});
app.use(healthcheck.routes());
app.use(healthcheck.allowedMethods());

app.use(mcp.routes());
app.use(mcp.allowedMethods());

app.addEventListener("listen", ({ secure, hostname, port }) => {
  const protocol = secure ? "https://" : "http://";
  console.log(`Listening on: ${protocol}${hostname ?? "localhost"}:${port}`);
});

await app.listen({ port: PORT });
