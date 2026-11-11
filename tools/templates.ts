import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { apiGet, apiPost, apiPatch, apiDelete, formatError } from "../lib/apiClient.ts";
import type {
  AuthRef,
  FlowTemplate,
  MutableFlowTemplate,
  PaginatedResponse,
  SingleResponse,
  TemplateVersion,
} from "./types.ts";

const TEMPLATE_REF_PATH = new URL("../references/template-sdk.md", import.meta.url);
const MAPPING_REF_PATH = new URL("../references/mapping-sdk.md", import.meta.url);
const LOOKUP_REF_PATH = new URL("../references/lookup-sdk.md", import.meta.url);

export function registerTemplateTools(server: McpServer, authRef: AuthRef): void {

  // --- LIST TEMPLATES ---
  server.registerTool(
    "flowmate_list_templates",
    {
      title: "List Templates",
      description: `Retrieve FlowMate flow templates with optional filtering and pagination.

Use filters to narrow results by status, search term or tags. Use flowmate_get_template to get the full graph of a single template.

Returns:
  {
    "templates": [{ "id", "name", "description", "status", "type", "tags", "createdAt", "updatedAt" }],
    "total": number,
    "page": number,
    "totalPages": number
  }`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(20).describe("Results per page, 1–100"),
        page_number: z.number().int().min(1).default(1).describe("Page to return, 1-based"),
        filter_status: z.enum(["published", "draft"]).optional().describe("Only return templates with this status"),
        search: z.string().optional().describe("Full-text search across template names and descriptions"),
        tags: z.string().optional().describe("Comma-separated tag filter (e.g. \"crm,sales\")"),
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
        if (params.search) query.search = params.search;
        if (params.tags) query.tags = params.tags;

        const response = await apiGet<PaginatedResponse<FlowTemplate>>(authRef,"/templates", query);
        const templates = response.data ?? [];
        const meta = response.meta;

        const output = {
          templates: templates.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            status: t.status,
            type: t.type,
            tags: t.tags,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          })),
          total: meta?.total ?? templates.length,
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

  // --- GET TEMPLATE ---
  server.registerTool(
    "flowmate_get_template",
    {
      title: "Get Template",
      description: `Get the full details of a single FlowMate template by ID, including its graph (nodes and edges).

Use this before changing a template with flowmate_update_template.

Returns:
  Full FlowTemplate object including graph nodes, type, status, cron, tags.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Template ID (from flowmate_list_templates)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<SingleResponse<FlowTemplate>>(authRef,`/templates/${params.id}`);
        const template = response.data;
        return {
          content: [{ type: "text", text: JSON.stringify(template, null, 2) }],
          structuredContent: template,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- CREATE TEMPLATE ---
  server.registerTool(
    "flowmate_create_template",
    {
      title: "Create Template",
      description: `Create a new FlowMate flow template in the repository.

Call get_template_reference before using this tool to ensure the correct structure.

Each graph node MUST have id, componentId, function and name, even though only id is enforced by the schema.

Returns:
  Created FlowTemplate object with generated ID.`,
      inputSchema: z.object({
        name: z.string().min(1).describe("Template display name"),
        description: z.string().optional().describe("Template description"),
        type: z.enum(["ordinary", "realtime"]).describe("Flow type. Use 'ordinary' for polling/scheduled flows, 'realtime' for webhook-triggered flows"),
        cron: z.string().optional().describe("Cron schedule expression (e.g. '*/5 * * * *') — omit for webhook/realtime flows"),
        graph: z.object({
          nodes: z.array(z.object({
            id: z.string().describe("Node ID, e.g. 'step_1'"),
            componentId: z.string().optional().describe("Component repository ID (from flowmate_get_connector_details) — required in practice"),
            function: z.string().optional().describe("Function name to execute — required in practice"),
            name: z.string().optional().describe("Descriptive node name — required in practice"),
            description: z.string().optional(),
            fields: z.record(z.unknown()).optional().describe("Component-specific config fields"),
            credentials_id: z.string().optional().describe("Secret service credential ID"),
          }).passthrough()).describe("Array of nodes in the flow"),
          edges: z.array(z.object({
            source: z.string(),
            target: z.string(),
          })).optional().describe("Connections between nodes"),
        }).describe("Flow graph definition"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        const body: MutableFlowTemplate = {
          name: params.name,
          description: params.description,
          type: params.type,
          graph: params.graph,
          ...(params.cron ? { cron: params.cron } : {}),
        };

        const response = await apiPost<SingleResponse<FlowTemplate>>(authRef,"/templates", body);
        const template = response.data;

        return {
          content: [{ type: "text", text: `Template created: ${template.id}\n\n${JSON.stringify(template, null, 2)}` }],
          structuredContent: template,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- UPDATE TEMPLATE ---
  server.registerTool(
    "flowmate_update_template",
    {
      title: "Update Template",
      description: `Update an existing FlowMate template. Only provide the fields you want to change.

Note: if graph is provided, it replaces the entire existing graph — fetch the current graph with flowmate_get_template first.

Setting status to 'published' makes the template visible to end users, so confirm with the user before publishing.

Returns:
  Updated FlowTemplate object.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Template ID to update"),
        name: z.string().min(1).optional().describe("New template name"),
        description: z.string().optional().describe("New description"),
        type: z.enum(["ordinary", "realtime"]).optional().describe("New flow type"),
        cron: z.string().optional().describe("New cron expression (set to empty string to remove)"),
        status: z.enum(["draft", "published"]).optional().describe("Set to 'published' to make the template available to end users, keep as 'draft' while in active development"),
        graph: z.object({
          nodes: z.array(z.object({
            id: z.string(),
            componentId: z.string().optional(),
            function: z.string().optional(),
            name: z.string().optional(),
            description: z.string().optional(),
            fields: z.record(z.unknown()).optional(),
            credentials_id: z.string().optional(),
          }).passthrough()),
          edges: z.array(z.object({ source: z.string(), target: z.string() })).optional(),
        }).optional().describe("Replacement graph"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined)
        );

        const response = await apiPatch<SingleResponse<FlowTemplate>>(authRef,`/templates/${id}`, body);
        const template = response.data;

        return {
          content: [{ type: "text", text: `Template updated.\n\n${JSON.stringify(template, null, 2)}` }],
          structuredContent: template,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- DELETE TEMPLATE ---
  server.registerTool(
    "flowmate_delete_template",
    {
      title: "Delete Template",
      description: `Permanently delete a FlowMate template.

WARNING: This action is DESTRUCTIVE and cannot be undone. Before executing this tool, you MUST ask the user for explicit confirmation.

Returns:
  Confirmation message.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Template ID to delete"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        await apiDelete(authRef,`/templates/${params.id}`);
        return {
          content: [{ type: "text", text: `Template ${params.id} deleted successfully.` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- GENERATE FLOW FROM TEMPLATE (DEPRECATED) ---
  server.registerTool(
    "flowmate_generate_flow_from_template",
    {
      title: "Generate Flow from Template [Deprecated]",
      description: `**Deprecated — do not use.** This tool is no longer supported and may be removed. To create a flow, use flowmate_create_flow instead.

(Previously: created a new flow from a template.)

Returns:
  { "id": string (new flow ID), "status": "starting" }`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Template ID to generate a flow from"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiPost<{ data: { id: string; status: string } }>(authRef,`/templates/${params.id}/generate`);
        const result = response.data;

        return {
          content: [{ type: "text", text: `Flow generated. New flow ID: ${result.id}, status: ${result.status}` }],
          structuredContent: result,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- LIST TEMPLATE VERSIONS ---
  server.registerTool(
    "flowmate_list_template_versions",
    {
      title: "List Template Versions",
      description: `Retrieve all versions of a FlowMate template by its ID.

Use verbose=false (default) to get a compact list and then flowmate_get_template_version for a single version; only use verbose=true if you need the full content of every version, as it returns large responses.

Returns (verbose=false):
  { "versions": [{ "id", "version", "createdAt", "createdBy" }] }

Returns (verbose=true):
  { "versions": [{ ...full template version object }] }`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Template ID"),
        verbose: z.boolean().default(false).describe("Include full template object per version"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<{ data: TemplateVersion[]; meta?: { total?: number } }>(
          authRef,
          `/templates/${params.id}/versions`,
          { verbose: params.verbose }
        );
        const versions = response.data ?? [];
        const output = {
          versions: params.verbose
            ? versions
            : versions.map((v) => ({
                id: v.id,
                version: v.version,
                createdAt: v.createdAt,
                createdBy: v.createdBy,
              })),
          total: response.meta?.total ?? versions.length,
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

  // --- GET TEMPLATE VERSION ---
  server.registerTool(
    "flowmate_get_template_version",
    {
      title: "Get Template Version",
      description: `Get a specific version of a FlowMate template by template ID and version ID.

Returns:
  Full TemplateVersion object including graph, version metadata, and timestamps.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Template ID"),
        versionId: z.string().min(1).describe("Version ID (the id field from flowmate_list_template_versions)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const response = await apiGet<SingleResponse<TemplateVersion>>(
          authRef,
          `/templates/${params.id}/versions/${params.versionId}`
        );
        const version = response.data;
        return {
          content: [{ type: "text", text: JSON.stringify(version, null, 2) }],
          structuredContent: version,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // --- GET TEMPLATE REFERENCE ---
  server.registerTool(
    "get_template_reference",
    {
      title: "Get Template Reference",
      description: "Call this before building, updating, or debugging any FlowMate template (flowmate_create_template, flowmate_update_template). Returns the structural conventions, JSONata rules, and Logic Gateway patterns.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const content = await Deno.readTextFile(TEMPLATE_REF_PATH);
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to load template reference: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- GET MAPPING REFERENCE ---
  server.registerTool(
    "get_mapping_reference",
    {
      title: "Get Mapping Reference",
      description: "Call this before writing field mappings for FlowMate flows or templates. Returns the mapping rules, mapper types, and node settings required for building FlowMate templates.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const content = await Deno.readTextFile(MAPPING_REF_PATH);
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to load mapping reference: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- GET LOOKUP REFERENCE ---
  server.registerTool(
    "get_lookup_reference",
    {
      title: "Get Lookup Reference",
      description: "Call this when a flow or template needs tenant-specific values (e.g. HubSpot pipelines, Slack channels) that must be looked up at runtime. Returns predefined Lookup snippets for these common fields.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const content = await Deno.readTextFile(LOOKUP_REF_PATH);
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to load lookup reference: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
