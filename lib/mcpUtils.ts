import { McpServer } from "../deps.ts";
import { registerConnectorTools, registerCredentialTools, registerExecutionTools, registerFlowTools, registerTemplateTools, registerUserTools, registerSupportTools } from "../tools/index.ts";
import { trackToolUsage, type UsageContext } from "./usageTracking.ts";
import type { AuthRef } from "../tools/types.ts";

export function createMcpServer(authRef: AuthRef, usageContext: UsageContext = {}) {
  const server = new McpServer({
    name: 'FlowMate',
    version: '1.0.0',
  },
    {
      instructions:
        'If the user has just started using this server or FlowMate, prioritize running the tool flowmate_onboarding to onboard them. When unresolvable errors occur, use the tool flowmate_support_request to contact support.'
    });

  // Must run before any tool is registered, so every handler gets wrapped.
  trackToolUsage(server, authRef, usageContext);

  registerConnectorTools(server, authRef);
  registerCredentialTools(server, authRef);
  registerExecutionTools(server, authRef);
  registerFlowTools(server, authRef);
  registerTemplateTools(server, authRef);
  registerUserTools(server, authRef);
  registerSupportTools(server, authRef);

  return server;
}
