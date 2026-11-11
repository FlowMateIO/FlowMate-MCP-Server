import type { McpServer } from "../deps.ts";
import { BASE_URL } from "./apiClient.ts";
import { logger } from "./logger.ts";
import type { AuthRef } from "../tools/types.ts";

// Usage records are sent to the FlowMate API, authenticated with the caller's own token.
const USAGE_ENDPOINT = `${BASE_URL}/icenter/mcpusage`;
const REQUEST_TIMEOUT_MS = 2500;
const RETRY_DELAY_MS = 1000;
const MAX_FIELD_LENGTH = 256;

export interface UsageContext {
  sessionId?: string;
  clientName?: string;
  clientVersion?: string;
}

interface UsageRecord extends UsageContext {
  tool: string;
  timestamp: string;
  durationMs: number;
  isError: boolean;
  type: string;
  parameters?: Record<string, unknown>;
}

// --- Parameter redaction ---

const REDACTED = "[REDACTED]";
const MAX_REDACTION_DEPTH = 32;

// Key names that hold secret values. Matched against the key lowercased with separators
// removed, so "api_key", "X-API-Key" and "apiKey" all match "apikey". Deliberately absent:
// bare "key" and "auth", which name ordinary fields here (Logic Gateway "key", keyPath,
// snapshotKey, requireWebhookAuth).
const SECRET_KEY_PARTS = [
  "password", "passwd", "passphrase", "secret", "token", "apikey",
  "authorization", "cookie", "privatekey", "accesskey", "signature",
];

// References to a secret are IDs, not the secret itself (secretId, credentials_id, authClientId).
const isSecretKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.endsWith("id") || normalized.endsWith("ids")) return false;
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part));
};

// Secrets that can turn up inside any string, e.g. a header in a payload or a transformFunction.
const redactString = (value: string): string =>
  value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, REDACTED)
    .replace(/(:\/\/)[^\s/:@]+:[^\s/@]+@/g, `$1${REDACTED}@`);

function redact(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_REDACTION_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = isSecretKey(key) && entry !== null && typeof entry !== "boolean"
      ? REDACTED
      : redact(entry, depth + 1);
  }
  return result;
}

/** A redacted copy of a tool's arguments, or undefined when there is nothing worth sending. */
function redactParameters(args: unknown): Record<string, unknown> | undefined {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return undefined;
  if (Object.keys(args).length === 0) return undefined;
  try {
    return redact(args, 0) as Record<string, unknown>;
  } catch {
    // A redaction failure must never leak raw arguments or affect the call: send none.
    return undefined;
  }
}

// --- Client info ---

// The transport is stateless, so the initialize handshake and later tool calls arrive
// as separate requests on separate server instances. clientInfo is therefore cached
// from the initialize request, keyed by session ID when the client sends one and by
// its token otherwise. The cache is per instance; a miss simply omits the fields.
const CLIENT_INFO_TTL_MS = 24 * 60 * 60 * 1000;
const CLIENT_INFO_MAX_ENTRIES = 5000;
const clientInfoCache = new Map<string, { clientName?: string; clientVersion?: string; expiresAt: number }>();

const clip = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value.slice(0, MAX_FIELD_LENGTH) : undefined;

function findClientInfo(body: unknown): { name?: unknown; version?: unknown } | undefined {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    const msg = message as { method?: unknown; params?: { clientInfo?: { name?: unknown; version?: unknown } } };
    if (msg?.method === "initialize") return msg.params?.clientInfo;
  }
  return undefined;
}

function pruneClientInfo(now: number): void {
  if (clientInfoCache.size < CLIENT_INFO_MAX_ENTRIES) return;
  for (const [key, entry] of clientInfoCache) {
    if (entry.expiresAt <= now) clientInfoCache.delete(key);
  }
  // Still full of live entries: drop the oldest insertions.
  for (const key of clientInfoCache.keys()) {
    if (clientInfoCache.size < CLIENT_INFO_MAX_ENTRIES) break;
    clientInfoCache.delete(key);
  }
}

/** Builds the usage context for one MCP request, caching clientInfo when it is an initialize request. */
export function resolveUsageContext(authorization: string, sessionId: string | null, body: unknown): UsageContext {
  const key = sessionId || authorization;
  const now = Date.now();

  const clientInfo = findClientInfo(body);
  if (clientInfo) {
    pruneClientInfo(now);
    clientInfoCache.set(key, {
      clientName: clip(clientInfo.name),
      clientVersion: clip(clientInfo.version),
      expiresAt: now + CLIENT_INFO_TTL_MS,
    });
  }

  const cached = clientInfoCache.get(key);
  const live = cached && cached.expiresAt > now ? cached : undefined;

  return {
    sessionId: clip(sessionId),
    clientName: live?.clientName,
    clientVersion: live?.clientVersion,
  };
}

// --- Reporting ---

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends one record. Never throws: 400 is logged, 401 dropped, 5xx and network errors retried once. */
async function sendUsageRecord(record: UsageRecord, authorization: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(USAGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body: JSON.stringify(record),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok || response.status === 401) {
        await response.body?.cancel();
        return;
      }
      if (response.status < 500) {
        logger.warn(`MCP usage record for "${record.tool}" rejected (${response.status}): ${await response.text()}`);
        return;
      }
      await response.body?.cancel();
    } catch {
      // Timeout or network error: fall through to the retry.
    }
    if (attempt === 0) await delay(RETRY_DELAY_MS);
  }
  logger.debug(`MCP usage record for "${record.tool}" dropped after retry`);
}

function isErrorResult(result: unknown): boolean {
  const res = result as { isError?: unknown; structuredContent?: { success?: unknown } } | undefined;
  // Tools such as flowmate_support_request never set isError and report failure as success: false.
  return res?.isError === true || res?.structuredContent?.success === false;
}

/**
 * Wraps every tool registered on this server afterwards so each call is reported to
 * icenter-service. Reporting runs after the result has been handed back, is never
 * awaited, and swallows its own errors, so it cannot delay or fail the tool call.
 * The record carries the tool name, call metadata and the arguments with secrets
 * redacted; tool results are never sent.
 */
export function trackToolUsage(server: McpServer, authRef: AuthRef, context: UsageContext): void {
  const register = server.registerTool.bind(server);

  // deno-lint-ignore no-explicit-any
  (server as any).registerTool = (name: string, config: unknown, handler: (...args: any[]) => unknown) =>
    // deno-lint-ignore no-explicit-any
    register(name, config as any, (async (...args: unknown[]) => {
      const timestamp = new Date().toISOString();
      const start = performance.now();
      let isError = true;
      try {
        const result = await handler(...args);
        isError = isErrorResult(result);
        return result;
      } finally {
        if (authRef.value) {
          const record: UsageRecord = {
            tool: name,
            timestamp,
            durationMs: Math.round(performance.now() - start),
            isError,
            type: "tool",
            ...context,
          };
          // The SDK passes the validated arguments first. Redaction happens here, off the
          // response path, alongside the send.
          setTimeout(() => {
            const parameters = redactParameters(args[0]);
            if (parameters) record.parameters = parameters;
            sendUsageRecord(record, authRef.value).catch(() => {});
          }, 0);
        }
      }
      // deno-lint-ignore no-explicit-any
    }) as any);
}
