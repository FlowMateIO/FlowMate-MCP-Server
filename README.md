# FlowMate-MCP-Server

The source code of the hosted **FlowMate MCP server**, published for transparency and verification. It lets AI assistants such as Claude, ChatGPT and Gemini work with [FlowMate](https://flowmate.io): connect business apps, run connector actions, and build, run and monitor integration flows.

**Hosted endpoint:** `https://api.flowmate.ai/mcp` (Streamable HTTP, stateless)

You don't need to run this code to use FlowMate. Connect your assistant to the hosted endpoint. This repository lets you see exactly what the server does with your requests.

## How it works

- The server is a thin layer over the public FlowMate API at `https://api.flowmate.ai`. Each tool call becomes one or more requests to that API, sent with **your own** bearer token. The server holds no credentials of its own and can do nothing your account can't.
- **Authentication** is OAuth 2.0. An unauthenticated request gets `401` with `WWW-Authenticate: Bearer resource_metadata="https://api.flowmate.ai/.well-known/oauth-protected-resource"`, from which MCP clients discover the FlowMate authorization server and sign you in.
- The transport is stateless: a fresh MCP server instance is created per request, and no conversation state is kept.
- Every tool carries a `title` and `readOnlyHint` / `destructiveHint` / `openWorldHint` annotations, so clients can ask for confirmation before changes.

## Connecting

| Client | How |
|---|---|
| Claude (claude.ai, Desktop, Claude Code) | Add a custom connector with the URL `https://api.flowmate.ai/mcp` and sign in to FlowMate when prompted. Claude Code: `claude mcp add --transport http flowmate https://api.flowmate.ai/mcp` |
| ChatGPT | Add `https://api.flowmate.ai/mcp` as a connector/app with OAuth authentication. |
| Gemini CLI | `gemini extensions install https://github.com/FlowMateIO/FlowMate-MCP-Server`. The [`gemini-extension.json`](gemini-extension.json) in this repo points to the hosted endpoint. |
| Other MCP clients | Any client that supports Streamable HTTP and OAuth 2.0 can use `https://api.flowmate.ai/mcp`. |

## Tools

Read-only tools (no changes to your account):

| Area | Tools |
|---|---|
| Connectors | `flowmate_list_connectors`, `flowmate_get_connector_details`, `flowmate_get_function_schemas` |
| Credentials | `flowmate_get_credentials`, `flowmate_get_credentials_by_component`, `flowmate_inspect_credential`, `flowmate_get_auth_client`, `flowmate_inspect_auth_client`, `flowmate_create_credential`\*, `flowmate_update_credential`\*, `flowmate_create_auth_client`\*, `flowmate_update_auth_client`\* |
| Flows | `flowmate_list_flows`, `flowmate_get_flow`, `flowmate_get_flow_logs`, `flowmate_get_executions`, `flowmate_get_token_usage` |
| Templates | `flowmate_list_templates`, `flowmate_get_template`, `flowmate_list_template_versions`, `flowmate_get_template_version` |
| Users | `flowmate_get_current_user`, `flowmate_get_users`, `flowmate_get_invitations` |
| Reference & onboarding | `get_flow_reference`, `get_template_reference`, `get_mapping_reference`, `get_lookup_reference`, `flowmate_onboarding` |

\* These only return a link that you open in your browser to enter or change credentials. Secrets are never entered in, or passed through, the chat.

Tools that change data or reach outside your account:

| Area | Tools |
|---|---|
| Connector actions | `flowmate_execute_function` (runs a connector action against a connected app) |
| Flows | `flowmate_create_flow`, `flowmate_update_flow`, `flowmate_start_flow`, `flowmate_stop_flow`, `flowmate_send_webhook` |
| Templates | `flowmate_create_template`, `flowmate_update_template`, `flowmate_generate_flow_from_template` (deprecated) |
| Users | `flowmate_create_invitation`, `flowmate_promote_user`, `flowmate_demote_user` |
| Feedback | `flowmate_request_connector`, `flowmate_support_request` |

Destructive tools (always confirm first): `flowmate_delete_credential`, `flowmate_delete_auth_client`, `flowmate_delete_template`.

The exact names, descriptions, input schemas and annotations are in [`tools/`](tools). The guides returned by the reference and onboarding tools are in [`references/`](references).

## Data handling

- **Tool calls:** your inputs go to the FlowMate API to carry out the call. The server doesn't store them.
- **Usage records** ([`lib/usageTracking.ts`](lib/usageTracking.ts)): after each tool call, the server sends one record to the FlowMate API for product analytics and support. A record holds the tool name, timestamp, duration, whether the call failed, the MCP session ID, the client's name and version (e.g. "claude-ai"), and the tool's arguments with secrets redacted. Keys such as passwords, tokens, API keys and authorization headers are replaced with `[REDACTED]`, as are bearer tokens, JWTs and credentials embedded in URLs. **Tool results are never recorded.** Records are linked to your FlowMate user and tenant through your token.
- **Support and connector requests** (`flowmate_support_request`, `flowmate_request_connector`) send the text you provide, together with your user ID and, for support requests, your name and email, to the FlowMate team.
- The server never asks for or reads your chat history, memory or files.

See the [FlowMate Privacy Policy](https://www.flowmate.io/privacy-policy) for retention, recipients and your rights.

## Running locally

Requires [Deno](https://deno.com) 2.x.

```bash
deno task start
```

The server listens on `http://localhost:2405/mcp` and forwards every call to the FlowMate API with the bearer token your client sends. You still need a FlowMate account.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `2405` | Listen port |
| `API_BASE_URL` | `https://api.flowmate.ai` | FlowMate API the tools call |
| `LOG_LEVEL` | `INFO` | Log level |
| `SUPPORT_REQUEST_WEBHOOK_ID` | — | Target for `flowmate_support_request`. If unset, the tool reports that it isn't configured. |
| `CONNECTOR_REQUEST_WEBHOOK_ID` | — | Target for `flowmate_request_connector`. If unset, the tool reports that it isn't configured. |

A `Dockerfile` is included.

## Support

Use the `flowmate_support_request` tool from your assistant, or contact FlowMate through [flowmate.io](https://flowmate.io).

## License

Copyright 2026 FlowMate GmbH. Licensed under the [Apache License, Version 2.0](LICENSE); see also [NOTICE](NOTICE). The license does not grant rights to the FlowMate name or logo. Contributions are accepted under the same license (Section 5). Third-party dependencies keep their own licenses, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
