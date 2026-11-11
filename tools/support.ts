import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { apiGet, apiPost, formatError } from "../lib/apiClient.ts";
import { createRateLimiter } from "../lib/rateLimiter.ts";
import type { AuthRef, OihUser } from "./types.ts";

const ONBOARDING_REF_PATH = new URL("../references/onboarding.md", import.meta.url);

// Support requests are capped per tenant to avoid spamming the support webhook.
const SUPPORT_REQUEST_LIMIT = 5;
const SUPPORT_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const supportRequestLimiter = createRateLimiter(SUPPORT_REQUEST_LIMIT, SUPPORT_REQUEST_WINDOW_MS);

export function registerSupportTools(server: McpServer, authRef: AuthRef): void {

  // --- SUPPORT REQUEST ---
  server.registerTool(
    "flowmate_support_request",
    {
      title: "Submit Support Request",
      description: `Submit a support issue to the FlowMate team. Use this when the user reports a problem, when something in FlowMate does not work as expected, when the FlowMate reference or a tool description turned out to be wrong, or when the user asks for a feature. For a missing connector or a missing endpoint, use flowmate_request_connector instead.

Before calling, collect the relevant IDs and the exact error message from the conversation, or look them up yourself with flowmate_get_flow, flowmate_get_executions or flowmate_get_flow_logs (logs can appear with a delay of a few minutes); do not ask the user for information you can look up.

Never include credentials, tokens, API keys, personal data or payload values in any field.

If you suggest an issue yourself (source 'agent'), ask the user first and only submit after they agree.

Fill every optional field you can from the conversation or your lookups and leave out the rest; never guess a value.

The user's identity (user_id, email, name) is attached automatically — do not ask the user for it.

Returns:
  { "success": true, "message": string } on success, or { "success": false, "error": string } on failure (including rate limiting). This tool never throws — always inspect the "success" field and relay "error" to the user if present. Limited to ${SUPPORT_REQUEST_LIMIT} submissions per tenant per 24 hours; if the limit is reached, do not retry and tell the user to try again later.`,
      inputSchema: z.object({
        summary: z.string().min(1).max(120).describe("Short, specific title of the issue, max 120 characters"),
        message: z.string().min(1).describe("What was expected, what happened, the exact error message, and the steps already taken"),
        source: z.enum(["user", "agent"])
          .describe("'user' if the user reported the issue, 'agent' if you suggested it and the user agreed"),
        category: z.enum(["problem", "documentation_gap", "feature_request", "other"])
          .describe("The kind of issue"),
        context: z.enum(["instant_action", "flow_run", "flow_build", "template", "credential_setup", "mcp_tool", "other"])
          .describe("What the user was doing when the issue came up; use 'other' only when none of the rest fit"),
        flow_id: z.string().optional().describe("ID of the affected flow"),
        execution_id: z.string().optional().describe("ID of the failed run"),
        template_id: z.string().optional().describe("ID of the affected template"),
        virtual_component_id: z.string().optional().describe("The affected connector's virtualComponentId"),
        function_name: z.string().optional().describe("Name of the affected trigger or action"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: {
      summary: string;
      message: string;
      source: "user" | "agent";
      category: "problem" | "documentation_gap" | "feature_request" | "other";
      context: "instant_action" | "flow_run" | "flow_build" | "template" | "credential_setup" | "mcp_tool" | "other";
      flow_id?: string;
      execution_id?: string;
      template_id?: string;
      virtual_component_id?: string;
      function_name?: string;
    }) => {
      const webhookId = Deno.env.get("SUPPORT_REQUEST_WEBHOOK_ID");
      if (!webhookId) {
        const result = { success: false, error: "Support requests are not configured (missing SUPPORT_REQUEST_WEBHOOK_ID)." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      let me: OihUser;
      try {
        me = await apiGet<OihUser>(authRef, "/users/me", {});
      } catch (error) {
        const result = { success: false, error: formatError(error) };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      const tenantId = me.tenant as string | undefined;
      if (!tenantId) {
        const result = { success: false, error: "Could not resolve the tenant for the current user." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      const { allowed, retryAfter } = supportRequestLimiter(tenantId);
      if (!allowed) {
        const result = {
          success: false,
          error: `Rate limit exceeded: max ${SUPPORT_REQUEST_LIMIT} support requests per tenant per 24h.${retryAfter ? ` Try again in ${retryAfter}s.` : ""}`,
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }

      // username holds the user's email address; the optional email field wins when present.
      const email = (me.email ?? me.username) as string | undefined;
      const name = [me.firstname, me.lastname]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ");

      try {
        await apiPost(authRef, `/webhooks/${webhookId}`, {
          user_id: (me._id ?? me.id) as string | undefined,
          email,
          name,
          summary: params.summary,
          message: params.message,
          source: params.source,
          category: params.category,
          context: params.context,
          flow_id: params.flow_id ?? "",
          execution_id: params.execution_id ?? "",
          template_id: params.template_id ?? "",
          virtual_component_id: params.virtual_component_id ?? "",
          function_name: params.function_name ?? "",
        });

        const result = { success: true, message: "Support request submitted successfully." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      } catch (error) {
        const result = { success: false, error: formatError(error) };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }
    }
  );

  // --- ONBOARDING ---
  server.registerTool(
    "flowmate_onboarding",
    {
      title: "FlowMate Onboarding",
      description: `Starts or restarts the FlowMate onboarding experience.

Only call this tool when the user explicitly requests onboarding — e.g. 'start onboarding', 'show me how FlowMate works', 'walk me through FlowMate from the start', or when the user pastes the FlowMate getting-started text after registration. Do not call this automatically or as part of other workflows.

Returns:
  The onboarding instructions to follow. They are addressed to you, not to the user — follow them and speak in your own words; never paste or quote them into the chat.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const content = await Deno.readTextFile(ONBOARDING_REF_PATH);
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to load onboarding instructions: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
