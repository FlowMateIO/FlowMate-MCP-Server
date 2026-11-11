import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { apiGet, apiPost, apiPatch, formatError } from "../lib/apiClient.ts";
import type { AuthRef, Flow, PaginatedResponse, SingleResponse } from "./types.ts";

const FLOW_REF_PATH = new URL("../references/flow-sdk.md", import.meta.url);

export function registerFlowTools(server: McpServer, authRef: AuthRef): void {

  // --- LIST FLOWS ---
  server.registerTool(
    "flowmate_list_flows",
    {
      title: "List Flows",
      description: `Retrieve the user's FlowMate flows (active and inactive) with optional filtering and pagination.

Use filter_status to return only active or only inactive flows. Use flowmate_get_flow to get the full graph of a single flow.

Returns:
  {
    "flows": [{ "id", "name", "status", "type", "cron", "createdAt", "updatedAt" }],
    "total": number,
    "page": number,
    "totalPages": number
  }

If page < totalPages, request the next page to see more flows.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(20).describe("Results per page, 1–100"),
        page_number: z.number().int().min(1).default(1).describe("Page to return"),
        filter_status: z.enum(["active", "inactive"]).optional().describe("Filter by flow status"),
        filter_type: z.enum(["ordinary", "long_running"]).optional().describe("Filter by flow type"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const query: Record<string, unknown> = {
          "page[size]": params.page_size,
          "page[number]": params.page_number,
        };
        if (params.filter_status) query["filter[status]"] = params.filter_status;
        if (params.filter_type) query["filter[type]"] = params.filter_type;

        const response = await apiGet<PaginatedResponse<Flow>>(authRef,"/flows", query);
        const flows = response.data ?? [];
        const meta = response.meta;

        const output = {
          flows: flows.map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            status: f.status,
            type: f.type,
            cron: f.cron,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          })),
          total: meta?.total ?? flows.length,
          page: meta?.page ?? params.page_number,
          totalPages: meta?.totalPages ?? 1,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- GET FLOW ---
  server.registerTool(
    "flowmate_get_flow",
    {
      title: "Get Flow",
      description: `Get full details of a single flow by ID, including graph, status, and configuration.

Use this to inspect a flow before changing it with flowmate_update_flow, or to debug a flow together with flowmate_get_flow_logs.

Returns:
  Full Flow object including graph nodes, status, type, cron.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Flow ID (from flowmate_list_flows)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<SingleResponse<Flow>>(authRef,`/flows/${params.id}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
          structuredContent: response.data,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- START FLOW ---
  server.registerTool(
    "flowmate_start_flow",
    {
      title: "Start Flow",
      description: `Start a FlowMate flow. The flow must be in 'inactive' status; starting a flow that is already active returns an error.

Once started, the flow runs according to its cron schedule or incoming webhooks.

Returns:
  Confirmation that the start command was accepted.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Flow ID to start"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        await apiPost(authRef,`/flows/${params.id}/start`);
        return {
          content: [{ type: "text", text: `Flow ${params.id} start command accepted. Status will change to 'starting'.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- STOP FLOW ---
  server.registerTool(
    "flowmate_stop_flow",
    {
      title: "Stop Flow",
      description: `Stop a running FlowMate flow. A flow must be stopped before it can be changed with flowmate_update_flow.

Returns:
  Confirmation that the stop command was accepted.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Flow ID to stop"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        await apiPost(authRef,`/flows/${params.id}/stop`);
        return {
          content: [{ type: "text", text: `Flow ${params.id} stop command accepted. Status will change to 'stopping'.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- UPDATE FLOW ---
  server.registerTool(
    "flowmate_update_flow",
    {
      title: "Update Flow",
      description: `Update a flow's configuration. Only provide the fields you want to change.

The flow MUST be inactive; updating an active flow fails, so call flowmate_stop_flow first and restart it with flowmate_start_flow afterwards.

Note: if graph is provided, it replaces the entire existing graph — fetch the current graph with flowmate_get_flow first and send the complete updated version.

Returns:
  Updated Flow object.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Flow ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        cron: z.string().optional().describe("New cron expression"),
        type: z.enum(["ordinary", "realtime"]).optional()
          .describe("Flow execution type: 'ordinary' (polling/cron) or 'realtime' (webhook-triggered)"),
        flowSettings: z.object({
          webhooks: z.object({
            requireWebhookAuth: z.boolean(),
          }),
        }).optional().describe("Webhook configuration for realtime flows"),
        graph: z.object({
          nodes: z.array(z.object({
            id: z.string().describe("Unique step ID within the flow (e.g. 'step_1')"),
            componentId: z.string().optional().describe("ID of the connector component (from flowmate_get_connector_details)"),
            function: z.string().optional().describe("Function to call on the component"),
            name: z.string().optional(),
            description: z.string().optional(),
            fields: z.record(z.unknown()).optional(),
            credentials_id: z.string().optional(),
            nodeSettings: z.record(z.unknown()).optional()
              .describe("Runtime settings: applyTransform, transformFunction, continueOnError, passthrough, autoSaveSnapshots, etc."),
          })),
          edges: z.array(z.object({ source: z.string(), target: z.string() })).optional(),
        }).optional().describe("Replacement graph — replaces the entire existing graph"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined)
        );
        const response = await apiPatch<SingleResponse<Flow>>(authRef,`/flows/${id}`, body);
        return {
          content: [{ type: "text", text: `Flow updated.\n\n${JSON.stringify(response.data, null, 2)}` }],
          structuredContent: response.data,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- GET FLOW LOGS ---
  server.registerTool(
    "flowmate_get_flow_logs",
    {
      title: "Get Flow Logs",
      description: `Retrieve execution logs from the FlowMate platform, e.g. to debug a failing flow.

tenant_id is required; all other filters are optional. Always provide a from/to range — without one the server may return no results. Keep the range narrow and use flow_id or errors_only to limit the response size.

Returns:
  Log entries matching the given filters.`,
      inputSchema: z.object({
        tenant_id: z.string().min(1).describe("Tenant ID to scope results (from flowmate_get_current_user)"),
        flow_id: z.string().optional().describe("Filter by flow ID"),
        step_id: z.string().optional().describe("Filter by step/node ID (e.g. 'step_1')"),
        from: z.string().optional().describe("Start of time range (ISO 8601, e.g. '2026-10-01T00:00:00Z')"),
        to: z.string().optional().describe("End of time range (ISO 8601)"),
        errors_only: z.boolean().optional().describe("When true, only error logs are returned. Defaults to false (all logs within the given filters)."),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const query: Record<string, unknown> = {
          "filter[tenant]": params.tenant_id,
        };
        if (params.flow_id) query["filter[flowId]"] = params.flow_id;
        if (params.step_id) query["filter[stepId]"] = params.step_id;
        if (params.from) query["from"] = params.from;
        if (params.to) query["to"] = params.to;
        if (params.errors_only) query["showErrors"] = true;
        const response = await apiGet(authRef, "/logs", query);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- CREATE FLOW ---
  server.registerTool(
    "flowmate_create_flow",
    {
      title: "Create Flow",
      description: `Create a new FlowMate flow. The flow is always created with status 'inactive' and must be started separately with flowmate_start_flow.

Call get_flow_reference before using this tool to ensure the correct structure.

Returns:
  { "id": string, "description": string, "status": "inactive" }`,
      inputSchema: z.object({
        description: z.string().optional().describe("Human-readable flow description"),
        cron: z.string().optional().describe("Cron expression for scheduled execution (e.g. '*/5 * * * *')"),
        type: z.enum(["ordinary", "realtime"]).optional()
          .describe("Flow execution type: 'ordinary' (polling/cron) or 'realtime' (webhook-triggered)"),
        flowSettings: z.object({
          webhooks: z.object({
            requireWebhookAuth: z.boolean(),
          }),
        }).optional().describe("Webhook configuration for realtime flows"),
        graph: z.object({
          nodes: z.array(z.object({
            id: z.string().describe("Unique step ID within the flow (e.g. 'step_1')"),
            componentId: z.string().describe("ID of the connector component (from flowmate_get_connector_details)"),
            function: z.string().describe("Function to call on the component"),
            name: z.string().optional(),
            description: z.string().optional(),
            credentials_id: z.string().optional(),
            fields: z.record(z.unknown()).optional(),
            nodeSettings: z.record(z.unknown()).optional()
              .describe("Runtime settings: applyTransform, transformFunction, continueOnError, passthrough, autoSaveSnapshots, etc."),
          })).min(1).describe("At least one node required"),
          edges: z.array(z.object({
            source: z.string(),
            target: z.string(),
          })).optional().describe("Required when graph has more than one node"),
        }).describe("Flow graph — nodes and their connections"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiPost<SingleResponse<Flow>>(authRef, "/flows", params);
        const flow = response.data;
        const output = { id: flow.id, description: flow.description, status: flow.status };
        return {
          content: [{ type: "text", text: `Flow created.\n\n${JSON.stringify(output, null, 2)}` }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- GET FLOW REFERENCE ---
  server.registerTool(
    "get_flow_reference",
    {
      title: "Get Flow Reference",
      description: "Call this before building, creating, or updating any FlowMate flow (flowmate_create_flow, flowmate_update_flow). Returns the flow structure, node fields, nodeSettings, validation rules, and mapping conventions.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const content = await Deno.readTextFile(FLOW_REF_PATH);
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to load flow reference: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- SEND WEBHOOK ---
  server.registerTool(
    "flowmate_send_webhook",
    {
      title: "Send Webhook",
      description: `Trigger any flow by POSTing a payload to its webhook endpoint.

This works for all flows, not only webhook/realtime flows: flows that run on a cron schedule can be triggered this way too, e.g. to run them on demand without waiting for the next scheduled run.

Side effect: this starts a real flow run, which may read from and write to the connected third-party systems.

Returns:
  The response from the FlowMate webhook endpoint.`,
      inputSchema: z.object({
        flow_id: z.string().min(1).describe("The ID of the flow to trigger via webhook"),
        payload: z.record(z.unknown()).optional().describe("The request body sent as the webhook payload"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const response = await apiPost(authRef, `/webhooks/${params.flow_id}`, params.payload ?? {});
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          structuredContent: response,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
