import { McpServer } from "../deps.ts";
import { z } from "../deps.ts";
import { axios } from "../deps.ts";
import { apiDelete, apiGet, formatError } from "../lib/apiClient.ts";
import { API_BASE_URL } from "../lib/config.ts";
import type { AuthClientStatus, AuthRef, Credential, CredentialMeta } from "./types.ts";

export function registerCredentialTools(server: McpServer, authRef: AuthRef): void {

  server.registerTool(
    "flowmate_get_credentials",
    {
      title: "Get Credentials",
      description: `Retrieve all credentials for third-party applications configured for the current user.

Use this to check which apps the user has already connected. The returned secretIds are used as credentials_id in flow/template nodes and as secretId in flowmate_execute_function.

Returns:
  List of credentials, each with a virtualComponentId, an oauth flag, and an array of secretIds.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const credentials = await apiGet<Credential[]>(authRef, "/icenter/credentials", {});

        const output = { credentials, total: credentials.length };

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
    "flowmate_create_credential",
    {
      title: "Create Credential",
      description: `Generate a link for the user to add credentials for a specific third-party application.

Use this when the user has no credential for the connector yet (e.g. flowmate_get_credentials_by_component returns none), or to replace an OAuth credential.

The user must open the returned link in their browser to complete the setup outside of this chat; this tool itself does not create or change anything.

Returns:
  A resource link the user should open to enter their credentials.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { virtualComponentId: string }) => {
      try {
        const me = await apiGet<{ tenant: string }>(authRef, "/users/me", {});
        const url = `${API_BASE_URL}/icenter/credentials/newCredential/${params.virtualComponentId}?t=${me.tenant}`;

        return {
          content: [
            {
              type: "resource_link",
              uri: url,
              name: "Add Credential",
              description: "Open this link in your browser to enter credentials for the application.",
              mimeType: "text/html",
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_get_auth_client",
    {
      title: "Get Auth Client Status",
      description: `Check whether an OAuth 2 auth client is available for a connector, and get the tenant's auth client ID if one is configured.

Call this before flowmate_create_auth_client, and to get the authClientId that flowmate_update_auth_client and flowmate_delete_auth_client need.

Interpreting the response:
  - defaultAuthClient: true — FlowMate ships a default auth client for this connector. It works out of the box and needs no setup; the tenant can still register its own if the user wants to, but do not suggest it unprompted.
  - defaultAuthClient: false and authClientId: null — no auth client at all. Users cannot connect this app until someone registers one with flowmate_create_auth_client.
  - authClientId set — the tenant has its own auth client. Pass this ID to flowmate_update_auth_client or flowmate_delete_auth_client. Do not call flowmate_create_auth_client for this connector; it will fail because one already exists.

Returns:
  { "defaultAuthClient": boolean, "authClientId": string | null }. Fails if the virtualComponentId does not match a known connector.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId (from flowmate_list_connectors)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { virtualComponentId: string }) => {
      try {
        const status = await apiGet<AuthClientStatus>(
          authRef,
          `/icenter/auth-clients/virtual-components/${params.virtualComponentId}`,
          {}
        );

        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
          structuredContent: status as unknown as Record<string, unknown>,
        };
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 404) {
          return {
            content: [{
              type: "text",
              text: `No connector found with virtualComponentId "${params.virtualComponentId}". Check the ID with flowmate_list_connectors.`,
            }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_inspect_auth_client",
    {
      title: "Inspect Auth Client",
      description: `Retrieve the configuration of a specific OAuth 2 auth client by its ID.

Use this to show the user how their auth client is set up — its name, OAuth flow type, redirect URI and authorization/token endpoints — for example when checking why a connection fails.

The client ID and client secret are removed from the response and never returned, so this tool cannot be used to read them back. To change them, send the user through flowmate_update_auth_client.

Returns:
  The auth client's configuration: name, type, redirectUri, endpoints, owners, tenant and timestamps.`,
      inputSchema: z.object({
        authClientId: z.string().min(1).describe("The ID of the auth client to inspect (from flowmate_get_auth_client)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { authClientId: string }) => {
      try {
        // Intentionally not an /icenter path — auth clients are served by a separate service.
        const response = await apiGet<{ data?: Record<string, unknown> } | Record<string, unknown>>(
          authRef,
          `/icenter/auth-clients/${params.authClientId}`,
          {}
        );

        const raw = (response as { data?: Record<string, unknown> }).data ?? response as Record<string, unknown>;

        // The service masks these already; strip them regardless so secrets can never leave this tool.
        const { clientId: _clientId, clientSecret: _clientSecret, ...authClient } = raw;

        return {
          content: [{ type: "text", text: JSON.stringify(authClient, null, 2) }],
          structuredContent: authClient,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_create_auth_client",
    {
      title: "Create OAuth Auth Client",
      description: `Generate a link for the user to configure an OAuth 2 auth client (their own app registration: client ID and client secret) for a specific connector.

An auth client belongs to the connector and is set up once per tenant; individual users then connect their accounts against it with flowmate_create_credential. Use this only for connectors that authenticate via OAuth 2, and only when no auth client exists yet.

Call flowmate_get_auth_client first. If it reports defaultAuthClient: true, the connector already works without any setup — only continue if the user explicitly wants their own client. If it returns an authClientId, one is already configured and this tool will fail; use flowmate_update_auth_client instead.

The user must open the returned link in their browser to complete the setup outside of this chat; this tool itself does not create or change anything, and does not check the connector beforehand.

Opening the link fails if the connector does not use OAuth 2 as its auth scheme (422), or if an auth client is already configured for it (409). If the user reports either, do not hand them the link again — for a non-OAuth 2 connector use flowmate_create_credential instead, and if an auth client already exists the setup is done and the user can connect their account with flowmate_create_credential.

Returns:
  A resource link the user should open to enter their OAuth client details.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId (from flowmate_list_connectors)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { virtualComponentId: string }) => {
      try {
        const me = await apiGet<{ tenant: string }>(authRef, "/users/me", {});
        const url = `${API_BASE_URL}/icenter/auth-clients/newAuthClient/${params.virtualComponentId}?t=${me.tenant}`;

        return {
          content: [
            {
              type: "resource_link",
              uri: url,
              name: "Configure OAuth Auth Client",
              description: "Open this link in your browser to enter the OAuth client ID and client secret for the application.",
              mimeType: "text/html",
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_update_auth_client",
    {
      title: "Update OAuth Auth Client",
      description: `Generate a link for the user to update an existing OAuth 2 auth client in place.

WARNING: An auth client is shared by everyone in the tenant who connected through it. Replacing its client ID or client secret immediately affects every credential created against it, which may break running flows if the new values are wrong or belong to a different OAuth app. Before calling this tool, tell the user about this impact and ask for explicit confirmation.

To set up an auth client for a connector that does not have one yet, use flowmate_create_auth_client instead.

The user must open the returned link in their browser to complete the update outside of this chat; this tool itself does not create or change anything.

Returns:
  A resource link the user should open to update the OAuth client details.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId the auth client belongs to"),
        authClientId: z.string().min(1).describe("The ID of the auth client to update (from flowmate_get_auth_client)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { virtualComponentId: string; authClientId: string }) => {
      try {
        const me = await apiGet<{ tenant: string }>(authRef, "/users/me", {});
        const url = `${API_BASE_URL}/icenter/auth-clients/newAuthClient/${params.virtualComponentId}?t=${me.tenant}&cid=${params.authClientId}`;

        return {
          content: [
            {
              type: "resource_link",
              uri: url,
              name: "Update OAuth Auth Client",
              description: "Open this link in your browser to update the OAuth client ID and client secret for the application.",
              mimeType: "text/html",
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_delete_auth_client",
    {
      title: "Delete OAuth Auth Client",
      description: `Permanently delete an OAuth 2 auth client by its ID.

WARNING: This is a DESTRUCTIVE and IRREVERSIBLE operation with tenant-wide impact. An auth client is shared by everyone in the tenant: deleting it invalidates every credential connected through it, so ALL of the tenant's flows and integrations that rely on this connector will stop working immediately — not just the current user's. The auth client cannot be restored; it has to be registered again from scratch, and every affected user has to reconnect their account.

Before executing this tool, you MUST warn the user of this impact in your own words and ask for explicit confirmation. Only proceed after the user has clearly confirmed they want to permanently delete this auth client. If they only want to change the client ID or secret, use flowmate_update_auth_client instead — that keeps existing connections intact.

Returns:
  Confirmation that the auth client was deleted.`,
      inputSchema: z.object({
        authClientId: z.string().min(1).describe("The ID of the auth client to delete (from flowmate_get_auth_client)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { authClientId: string }) => {
      try {
        await apiDelete(authRef, `/icenter/auth-clients/${params.authClientId}`);

        const output = { authClientId: params.authClientId, deleted: true };

        return {
          content: [{ type: "text", text: `Auth client ${params.authClientId} permanently deleted.` }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_update_credential",
    {
      title: "Update Credential",
      description: `Generate a link for the user to update an existing credential in place.

WARNING: Any running flows that reference this credential will immediately use the new values, which may cause disruptions if the new credentials are invalid. Before calling this tool, tell the user about this impact and ask for explicit confirmation.

This tool only works for credentials that are NOT of type OAuth; for OAuth credentials, use flowmate_create_credential instead.

The user must open the returned link in their browser to complete the update outside of this chat.

Returns:
  A resource link the user should open to update their credentials.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId the credential belongs to"),
        secretId: z.string().min(1).describe("The secretId of the credential to update"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { virtualComponentId: string; secretId: string }) => {
      try {
        const me = await apiGet<{ tenant: string }>(authRef, "/users/me", {});
        const url = `${API_BASE_URL}/icenter/credentials/newCredential/${params.virtualComponentId}?t=${me.tenant}&sid=${params.secretId}`;

        return {
          content: [
            {
              type: "resource_link",
              uri: url,
              name: "Update Credential",
              description: "Open this link in your browser to update the credential.",
              mimeType: "text/html",
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_get_credentials_by_component",
    {
      title: "Get Credentials by Component",
      description: `Retrieve the credentials the current user has for a specific third-party application.

Use this to check whether the user has already connected a given connector before building a node or executing a function. If no credential is returned, call flowmate_create_credential to let the user add one.

Returns:
  A single credential object with the virtualComponentId, an oauth flag, and an array of secretIds.`,
      inputSchema: z.object({
        virtualComponentId: z.string().min(1).describe("The connector's virtualComponentId (the same value as connector_id in flowmate_get_connector_details)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { virtualComponentId: string }) => {
      try {
        const credential = await apiGet<Credential>(
          authRef,
          `/icenter/credentials/${params.virtualComponentId}`,
          {}
        );

        return {
          content: [{ type: "text", text: JSON.stringify(credential, null, 2) }],
          structuredContent: credential,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_inspect_credential",
    {
      title: "Inspect Credential",
      description: `Retrieve metadata for a specific credential by its secretId.

This tool returns metadata only (name, type, and timestamps); the actual credential values are never returned.

Returns:
  Credential metadata: name, type, createdAt, updatedAt.`,
      inputSchema: z.object({
        secretId: z.string().min(1).describe("The secretId of the credential to inspect (from flowmate_get_credentials or flowmate_get_credentials_by_component)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: { secretId: string }) => {
      try {
        const response = await apiGet<{ data: Record<string, unknown> }>(
          authRef,
          `/secrets/${params.secretId}`,
          {}
        );

        const meta: CredentialMeta = {
          name: response.data.name as string,
          type: response.data.type as string,
          createdAt: response.data.createdAt as string,
          updatedAt: response.data.updatedAt as string,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(meta, null, 2) }],
          structuredContent: meta,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "flowmate_delete_credential",
    {
      title: "Delete Credential",
      description: `Permanently delete an existing credential by its secretId.

WARNING: This is a DESTRUCTIVE and IRREVERSIBLE operation. Any flows that rely on this credential will immediately stop working once it is deleted.

Before executing this tool, you MUST ask the user for explicit confirmation. Only proceed after the user has clearly confirmed they want to permanently delete this credential.

Returns:
  An object containing the secretId of the deleted credential.`,
      inputSchema: z.object({
        secretId: z.string().min(1).describe("The secretId of the credential to delete"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { secretId: string }) => {
      try {
        const result = await apiDelete<{ secretId: string }>(
          authRef,
          `/icenter/credentials/${params.secretId}`
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
