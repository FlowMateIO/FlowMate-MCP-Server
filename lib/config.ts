/** Base URL of the public FlowMate API that every tool call is sent to. */
export const API_BASE_URL = Deno.env.get("API_BASE_URL") || "https://api.flowmate.ai";

/** Port the MCP server listens on. */
export const PORT = parseInt(Deno.env.get("PORT") || "2405");
