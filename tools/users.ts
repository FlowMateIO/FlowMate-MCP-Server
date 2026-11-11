import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { apiGet, apiPatch, apiPost, formatError } from "../lib/apiClient.ts";
import type { AuthRef, OihUser } from "./types.ts";

const TENANT_ADMIN_PERMISSION = "tenant.all";

export function registerUserTools(server: McpServer, authRef: AuthRef): void {

  server.registerTool(
    "flowmate_get_current_user",
    {
      title: "Get Current User",
      description: `Retrieve information about the currently authenticated user.

Call this to get the user's tenant ID (needed for flowmate_get_flow_logs and flowmate_get_executions) and to check their permissions.

Interpreting the response:
  - permissions containing "all" indicates a platform admin.
  - permissions containing "tenant.all" indicates a tenant admin.
  - tenantType is either "TEAM" or "PARTNER". PARTNER is a special elevated tenant type; for PARTNER tenants the "plan" field is irrelevant and should be ignored.
  - plan indicates the product plan the user's tenant is subscribed to (relevant only for TEAM tenants).

Returns:
  The current user's profile, including username, firstname, lastname, status, tenant, tenantType, plan, roles, and permissions.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const user = await apiGet<OihUser>(authRef, "/users/me", {});

        return {
          content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
          structuredContent: user as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_get_users",
    {
      title: "Get Users",
      description: `Retrieve the users of a FlowMate tenant.

Use this to list the members of the user's own team (default). Admin users may pass a different tenant ID to view users of another tenant. If a user's permissions contain "tenant.all", they are a tenant admin.

Returns:
  List of users.`,
      inputSchema: z.object({
        tenant: z.string().min(1).optional().describe("Optional tenant ID to scope results to. Defaults to your own tenant"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { tenant?: string }) => {
      try {
        let tenant = params.tenant;
        if (!tenant) {
          const me = await apiGet<{ tenant: string }>(authRef, "/users/me", {});
          tenant = me.tenant;
        }

        const response = await apiGet<{ data: OihUser[] } | OihUser[]>(
          authRef,
          "/users",
          { tenant }
        );

        const users: OihUser[] = Array.isArray(response)
          ? response
          : (response as { data: OihUser[] }).data ?? [];

        const output = { users, total: users.length };

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
    "flowmate_create_invitation",
    {
      title: "Create Invitation",
      description: `Invite a new user to the FlowMate platform by email address.

Side effect: the backend immediately sends an invitation email to the provided address, so confirm the address with the user before calling this tool.

Returns:
  The created invitation.`,
      inputSchema: z.object({
        username: z.string().email().describe("The email address of the person to invite (despite the parameter name, this must be a valid email address)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params: { username: string }) => {
      try {
        const invitation = await apiPost(authRef, "/invitations", {
          username: params.username,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(invitation, null, 2) }],
          structuredContent: invitation as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_get_invitations",
    {
      title: "Get Invitations",
      description: `Retrieve currently outstanding (pending) user invitations for the FlowMate platform.

Use this to check whether someone has already been invited before calling flowmate_create_invitation.

Returns:
  List of pending invitations.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        type Invitation = Record<string, unknown>;
        const response = await apiGet<{ data: Invitation[] } | Invitation[]>(
          authRef,
          "/invitations",
          {}
        );

        const invitations: Invitation[] = Array.isArray(response)
          ? response
          : (response as { data: Invitation[] }).data ?? [];

        const output = { invitations, total: invitations.length };

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
    "flowmate_promote_user",
    {
      title: "Promote User to Tenant Admin",
      description: `Grant a user tenant admin status by adding the "tenant.all" permission.

This changes the user's permissions, so confirm with the user before calling it.

The user is fetched first; if they already have the "tenant.all" permission, an error is returned.

Returns:
  The updated user.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("The ID of the user to promote to tenant admin (from flowmate_get_users)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params: { id: string }) => {
      try {
        const user = await apiGet<OihUser & { permissions?: string[] }>(
          authRef,
          `/users/${params.id}`,
          {}
        );

        const permissions = user.permissions ?? [];
        if (permissions.includes(TENANT_ADMIN_PERMISSION)) {
          return {
            content: [{ type: "text", text: "This user is already a tenant admin." }],
            isError: true,
          };
        }

        const updated = await apiPatch<OihUser>(authRef, `/users/${params.id}`, {
          permissions: [...permissions, TENANT_ADMIN_PERMISSION],
        });

        return {
          content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
          structuredContent: updated as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_demote_user",
    {
      title: "Demote User from Tenant Admin",
      description: `Revoke a user's tenant admin status by removing the "tenant.all" permission.

This changes the user's permissions, so confirm with the user before calling it.

The user is fetched first; if they do not have the "tenant.all" permission, an error is returned.

Returns:
  The updated user.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("The ID of the user to demote from tenant admin (from flowmate_get_users)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params: { id: string }) => {
      try {
        const user = await apiGet<OihUser & { permissions?: string[] }>(
          authRef,
          `/users/${params.id}`,
          {}
        );

        const permissions = user.permissions ?? [];
        if (!permissions.includes(TENANT_ADMIN_PERMISSION)) {
          return {
            content: [{ type: "text", text: "This user is not a tenant admin." }],
            isError: true,
          };
        }

        const updated = await apiPatch<OihUser>(authRef, `/users/${params.id}`, {
          permissions: permissions.filter((p) => p !== TENANT_ADMIN_PERMISSION),
        });

        return {
          content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
          structuredContent: updated as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
