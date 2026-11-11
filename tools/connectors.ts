import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { apiGet, apiPost, formatError } from "../lib/apiClient.ts";
import { createRateLimiter } from "../lib/rateLimiter.ts";
import type { AuthRef, VirtualComponent, ComponentVersion } from "./types.ts";

// Connector requests are capped per tenant to avoid spamming the request webhook.
const CONNECTOR_REQUEST_LIMIT = 5;
const CONNECTOR_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const connectorRequestLimiter = createRateLimiter(CONNECTOR_REQUEST_LIMIT, CONNECTOR_REQUEST_WINDOW_MS);

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Input schemas follow OpenAPI, so body parameters sit under a `requestBody` property.
// Components expect every parameter on one level, and models tend to map `requestBody`
// literally, so lift its properties next to the path and query parameters.
// A body property whose name collides with an existing parameter stays under
// `requestBody` rather than overwriting it; `requestBody` is removed once empty.
function flattenRequestBody<T>(entry: T): T {
  const copy = structuredClone(entry) as T & { schemas?: JsonObject };
  const inSchema = copy.schemas?.in;
  if (!isObject(inSchema) || !isObject(inSchema.properties)) return copy;

  const params = inSchema.properties;
  const body = params.requestBody;
  if (!isObject(body) || !isObject(body.properties)) return copy;

  const bodyRequired = Array.isArray(body.required) ? body.required as string[] : [];

  for (const [name, schema] of Object.entries(body.properties)) {
    if (name in params) continue;
    // Match the per-property `required: true` convention of the surrounding parameters.
    params[name] = bodyRequired.includes(name) && isObject(schema) ? { ...schema, required: true } : schema;
    delete body.properties[name];
  }

  delete params.requestBody;

  return copy;
}

export function registerConnectorTools(server: McpServer, authRef: AuthRef): void {

  // --- LIST CONNECTORS ---
  server.registerTool(
    "flowmate_list_connectors",
    {
      title: "List Connectors",
      description: `List all connectors (virtual components) available in the FlowMate platform.

Use this first to find the connector a flow or template should use. The full list is returned in one call; there is no pagination or filter.

Then call flowmate_get_connector_details with the connector's virtualComponentId and defaultVersionId to see its actions and triggers.

Returns:
  {
    "connectors": [{ "virtualComponentId", "name", "defaultVersionId", "description", "isGlobal" }],
    "total": number
  }`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const response = await apiGet<{ data: VirtualComponent[] } | VirtualComponent[]>(authRef, "/virtual-components", { mcp: true });

        const connectors: VirtualComponent[] = Array.isArray(response)
          ? response
          : (response as { data: VirtualComponent[] }).data ?? [];

        const output = {
          connectors: connectors.map((c) => ({
            virtualComponentId: c._id,
            name: c.name,
            defaultVersionId: c.defaultVersionId,
            description: c.description,
            isGlobal: c.isGlobal,
          })),
          total: connectors.length,
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

  // --- GET CONNECTOR DETAILS ---
  server.registerTool(
    "flowmate_get_connector_details",
    {
      title: "Get Connector Details",
      description: `Get full details of a connector version, including all available actions and triggers.

Use this to understand which functions a connector provides before adding it as a node to a flow or template.

Input and output schemas are not included; call flowmate_get_function_schemas for a specific function if you need them.

Returns:
  Full ComponentVersion object with actions, triggers, field definitions and the componentId that flow and template nodes need.`,
      inputSchema: z.object({
        connector_id: z.string().min(1).describe("The connector's virtualComponentId (from flowmate_list_connectors)"),
        version_id: z.string().min(1).describe("The connector's defaultVersionId (from flowmate_list_connectors)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<ComponentVersion | { data: ComponentVersion }>(
          authRef,
          `/virtual-components/${params.connector_id}/${params.version_id}`
        );

        const raw = "data" in (response as object)
          ? (response as { data: ComponentVersion }).data
          : response as ComponentVersion;

        const { _id, ...rest } = raw as ComponentVersion & { _id?: string };
        const details = { ...rest, componentVersionId: _id };

        for (const entry of [...(details.triggers ?? []), ...(details.actions ?? [])] as unknown as Record<string, unknown>[]) {
          delete entry.function;
          delete entry.schemas;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
          structuredContent: details,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- GET FUNCTION SCHEMAS ---
  server.registerTool(
    "flowmate_get_function_schemas",
    {
      title: "Get Function Schemas",
      description: `Get the full definition of a single trigger or action of a connector version, including its input and output schemas.

Use this after flowmate_get_connector_details to inspect a specific function before building a node or calling flowmate_execute_function.

Note: Logic Gateway functions (exec) do not return input/output schemas.

Returns:
  The matching trigger or action, including its schemas.`,
      inputSchema: z.object({
        connector_id: z.string().min(1).describe("The connector's virtualComponentId (from flowmate_list_connectors)"),
        version_id: z.string().min(1).describe("The connector's defaultVersionId (from flowmate_list_connectors)"),
        function_name: z.string().min(1).describe("The name of the trigger or action (from flowmate_get_connector_details)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<ComponentVersion | { data: ComponentVersion }>(
          authRef,
          `/virtual-components/${params.connector_id}/${params.version_id}`
        );

        const raw = "data" in (response as object)
          ? (response as { data: ComponentVersion }).data
          : response as ComponentVersion;

        const match = [...(raw.triggers ?? []), ...(raw.actions ?? [])]
          .find((entry) => entry.name === params.function_name);

        if (!match) {
          return {
            content: [{
              type: "text",
              text: `No trigger or action named "${params.function_name}" was found on connector "${params.connector_id}" version "${params.version_id}". Use flowmate_get_connector_details to list available function names.`,
            }],
            isError: true,
          };
        }

        const definition = flattenRequestBody(match);

        return {
          content: [{ type: "text", text: JSON.stringify(definition, null, 2) }],
          structuredContent: definition,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- EXECUTE FUNCTION ---
  server.registerTool(
    "flowmate_execute_function",
    {
      title: "Execute Connector Function",
      description: `Execute a single trigger or action of a FlowMate connector directly and return its result instantly, without creating a flow.

Side effect: this makes real API calls to the third-party system, including writes (e.g. creating or updating records). Before executing an action that creates, changes or deletes data, confirm with the user.

Use flowmate_get_function_schemas first to build a valid payload.

Returns:
  The result of the executed function.

Before executing, check the connector's authType and supportsInstantExecution. Do not create credentials for NO_AUTH connectors. Connectors with supportsInstantExecution: false (e.g. the Agent) can only run inside a flow.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId (connector_id in the discovery tools)"),
        operationId: z.string().min(1).describe("The name of the trigger or action to execute (function_name from flowmate_get_connector_details)"),
        secretId: z.string().min(1).describe("The secretId of the credential to use (from flowmate_get_credentials_by_component)"),
        data: z.record(z.unknown()).describe("Payload for the function, formatted according to its input schema"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const body = {
          operationId: params.operationId,
          secretId: params.secretId,
          data: params.data,
        };
        const response = await apiPost(authRef, `/icenter/execute/${params.virtualComponentId}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          structuredContent: response,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- REQUEST CONNECTOR ---
  server.registerTool(
    "flowmate_request_connector",
    {
      title: "Request Connector",
      description: `Request a missing FlowMate connector or a missing endpoint on an existing connector. Call this when the user asks for a connector that does not exist in FlowMate, or when they need an endpoint that is missing from an existing connector.

Use this tool exclusively for connector requests (a missing connector or a missing endpoint). Do NOT use it for support requests, bug reports, or questions about existing flows or connectors — use flowmate_support_request for those.

Populate the message field with a clear description of what is needed.

Returns:
  { "success": true, "message": string } on success, or { "success": false, "error": string } on failure (including rate limiting). This tool never throws — always inspect the "success" field and relay "error" to the user if present. If the request was rate-limited, do not retry immediately; tell the user to try again later.`,
      inputSchema: z.object({
        connector_name: z.string().min(2).max(100).describe("The official, normalized name of the connector (e.g. \"HubSpot\", \"Slack\"). Fix typos and capitalization."),
        connector_exists: z.boolean().describe("true if the connector already exists in FlowMate (but an endpoint is missing), false if the connector is missing entirely"),
        message: z.string().optional().describe("Clear description of what is needed, e.g. \"Endpoint createDeal is needed for quote creation\" or \"Connector needed for CRM sync\""),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const webhookId = Deno.env.get("CONNECTOR_REQUEST_WEBHOOK_ID");
      if (!webhookId) {
        const result = { success: false, error: "Connector requests are not configured (missing CONNECTOR_REQUEST_WEBHOOK_ID)." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      let tenantId: string | undefined;
      let userId: string | undefined;
      try {
        const me = await apiGet<{ _id?: string; id?: string; tenant?: string }>(authRef, "/users/me", {});
        tenantId = me.tenant;
        userId = me._id ?? me.id;
      } catch (error) {
        const result = { success: false, error: formatError(error) };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      if (!tenantId) {
        const result = { success: false, error: "Could not resolve the tenant for the current user." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      const { allowed, retryAfter } = connectorRequestLimiter(tenantId);
      if (!allowed) {
        const result = {
          success: false,
          error: `Rate limit exceeded: max ${CONNECTOR_REQUEST_LIMIT} connector requests per tenant per 24h.${retryAfter ? ` Try again in ${retryAfter}s.` : ""}`,
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      try {
        await apiPost(authRef, `/webhooks/${webhookId}`, {
          connector_name: params.connector_name,
          connector_exists: params.connector_exists,
          message: params.message ?? "",
          tenant_id: tenantId,
          user_id: userId,
        });

        const result = { success: true, message: "Connector request submitted successfully." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      } catch (error) {
        const result = { success: false, error: formatError(error) };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }
    }
  );
}

