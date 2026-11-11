import { Router, WebStandardStreamableHTTPServerTransport } from '../deps.ts'
import { createMcpServer } from '../lib/mcpUtils.ts'
import { resolveUsageContext } from '../lib/usageTracking.ts'
import type { AuthRef } from '../tools/types.ts'
import { API_BASE_URL } from '../lib/config.ts'

const router = new Router();

const WWW_AUTHENTICATE = `Bearer resource_metadata="${API_BASE_URL}/.well-known/oauth-protected-resource"`;

router.post("/mcp", async (ctx) => {
  try {
    const authHeader = ctx.request.headers.get('authorization');
    if (!authHeader) {
      ctx.response.status = 401;
      ctx.response.headers.set('WWW-Authenticate', WWW_AUTHENTICATE);
      return;
    }

    const body = await ctx.request.body.json();

    const authRef: AuthRef = { value: authHeader, unauthorized: false };
    const usageContext = resolveUsageContext(authHeader, ctx.request.headers.get('mcp-session-id'), body);
    const server = await createMcpServer(authRef, usageContext);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    const webRequest = new Request(ctx.request.url.href, {
      method: ctx.request.method,
      headers: ctx.request.headers,
      body: JSON.stringify(body),
    });

    const response = await transport.handleRequest(webRequest);
    if (authRef.unauthorized) {
      ctx.response.status = 401;
      ctx.response.headers.set('WWW-Authenticate', WWW_AUTHENTICATE);
      return;
    }
    ctx.response.status = response.status;
    const skipHeaders = new Set(['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-expose-headers']);
    response.headers.forEach((value: string, key: string) => {
      if (!skipHeaders.has(key.toLowerCase())) ctx.response.headers.set(key, value);
    });
    ctx.response.body = response.body;
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = {
      jsonrpc: '2.0',
      error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
      id: null,
    };
  }
});

router.get('/mcp', (ctx) => {
  ctx.response.status = 405;
  ctx.response.headers.set('Allow', 'POST');
});

router.delete('/mcp', (ctx) => {
  ctx.response.status = 405;
  ctx.response.headers.set('Allow', 'POST');
});

export default router;