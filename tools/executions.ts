import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { apiGet, formatError } from "../lib/apiClient.ts";
import type { AuthRef, FlowExecution, TokenUsageResponse } from "./types.ts";

export function registerExecutionTools(server: McpServer, authRef: AuthRef): void {

  server.registerTool(
    "flowmate_get_executions",
    {
      title: "Get Flow Executions",
      description: `Retrieve flow execution statistics from the FlowMate platform, grouped by a dimension over a date range.

Use this for an overview of how often flows ran; use flowmate_get_flow_logs for details of individual runs.

Note: dates here use YYYY-MM-DD, while flowmate_get_flow_logs uses ISO 8601 timestamps.

Returns:
  Execution data grouped by the specified dimension.`,
      inputSchema: z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date (YYYY-MM-DD)"),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date (YYYY-MM-DD)"),
        groupby: z.string().default("flow").describe("Grouping dimension, e.g. 'flow' to aggregate by flow"),
        tenant: z.string().min(1).describe("Tenant ID to scope results to (from flowmate_get_current_user)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<{ data: FlowExecution[] } | FlowExecution[]>(
          authRef,
          "/icenter/executions",
          {
            start: params.start,
            end: params.end,
            groupby: params.groupby,
            tenant: params.tenant,
          }
        );

        const executions: FlowExecution[] = Array.isArray(response)
          ? response
          : (response as { data: FlowExecution[] }).data ?? [];

        const output = { executions, total: executions.length };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_get_token_usage",
    {
      title: "Get Agent Token Usage",
      description: `Retrieve aggregated LLM token usage caused by FlowMate's own agent component over a date range, for one user or one tenant. Read-only.

Scope: pass at most ONE of user, tenant or ownTenant; with none, the caller's own usage is returned. Users can see their own usage, tenant admins their tenant and its members, platform admins any user or tenant.

Returns:
  scope, from, to, a usage breakdown (per model for user scope; per user and model for tenant scope), and summed totals (inputTokens, outputTokens, requestCount).`,
      inputSchema: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Range start (YYYY-MM-DD), inclusive. Default: start of the current UTC month"),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Range end (YYYY-MM-DD), inclusive. Default: today (UTC)"),
        user: z.string().min(1).optional().describe("Scope to one user (ObjectId)"),
        tenant: z.string().min(1).optional().describe("Scope to one tenant (ObjectId)"),
        ownTenant: z.boolean().optional().describe("Scope to the caller's own tenant"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      // Enforce mutual exclusivity client-side to fail fast.
      const scopes = [
        params.user !== undefined ? "user" : null,
        params.tenant !== undefined ? "tenant" : null,
        params.ownTenant ? "ownTenant" : null,
      ].filter(Boolean);
      if (scopes.length > 1) {
        return {
          content: [{ type: "text", text: `Error: user, tenant and ownTenant are mutually exclusive (got: ${scopes.join(", ")}).` }],
          isError: true,
        };
      }

      try {
        const query: Record<string, unknown> = {};
        if (params.from !== undefined) query.from = params.from;
        if (params.to !== undefined) query.to = params.to;
        if (params.user !== undefined) query.user = params.user;
        if (params.tenant !== undefined) query.tenant = params.tenant;
        if (params.ownTenant) query.ownTenant = true;

        const usage = await apiGet<TokenUsageResponse>(authRef, "/tokenusage", query);

        return {
          content: [{ type: "text", text: JSON.stringify(usage, null, 2) }],
          structuredContent: usage,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
