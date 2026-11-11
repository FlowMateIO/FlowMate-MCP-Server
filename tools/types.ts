// --- Shared ---

export interface AuthRef {
  value: string;
  unauthorized: boolean;
}


export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SingleResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

// --- Templates ---

export interface FlowGraph {
  nodes: FlowNode[];
  edges?: FlowEdge[];
}

export interface FlowNode {
  id: string;
  componentId?: string;
  credentials_id?: string;
  function?: string;
  name?: string;
  description?: string;
  fields?: Record<string, unknown>;
}

export interface FlowEdge {
  source: string;
  target: string;
}

export interface FlowTemplate {
  [key: string]: unknown;
  id: string;
  name: string;
  description?: string;
  graph: FlowGraph;
  type: "ordinary" | "realtime";
  cron?: string;
  status: "published" | "draft";
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MutableFlowTemplate {
  name: string;
  description?: string;
  graph: FlowGraph;
  type: "ordinary" | "realtime";
  cron?: string;
}

// --- Flows ---

export interface Flow {
  [key: string]: unknown;
  id: string;
  name: string;
  description?: string;
  graph: FlowGraph;
  type: "ordinary" | "realtime";
  cron?: string;
  status: "active" | "inactive" | "starting" | "stopping";
  createdAt: string;
  updatedAt: string;
}

// --- Executions ---

export interface FlowExecution {
  [key: string]: unknown;
  flowId?: string;
  flowName?: string;
  count?: number;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
}

// --- Token Usage ---

export interface TokenUsageRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  // Present only for tenant-scoped responses (one row per user + model).
  userId?: string;
  username?: string;
}

export interface TokenUsageTotals {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface TokenUsageResponse {
  scope: { type: "user" | "tenant"; id: string };
  from: string;
  to: string;
  usage: TokenUsageRow[];
  totals: TokenUsageTotals;
}

// --- Virtual Components (Connectors) ---

export interface VirtualComponent {
  _id: string;
  name: string;
  defaultVersionId?: string;
  description?: string;
  logo?: string;
  isGlobal?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComponentVersion {
  [key: string]: unknown;
  _id?: string;
  componentVersionId?: string;
  componentId: string;
  version?: string;
  actions?: ComponentAction[];
  triggers?: ComponentTrigger[];
  description?: string;
}

export interface ComponentAction {
  name: string;
  title?: string;
  description?: string;
  fields?: Record<string, unknown>;
}

export interface ComponentTrigger {
  name: string;
  title?: string;
  description?: string;
  fields?: Record<string, unknown>;
}

// --- Template Versions ---

export interface TemplateVersion {
  [key: string]: unknown;
  id: string;
  version?: string;
  createdAt?: string;
  createdBy?: string;
}

// --- Credentials ---

export interface Credential {
  virtualComponentId: string;
  oauth: boolean;
  secretIds: string[];
}

export interface CredentialMeta {
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthClientStatus {
  /** FlowMate ships a default auth client for this connector — it works without tenant setup. */
  defaultAuthClient: boolean;
  /** The tenant's own auth client, or null when none is configured. */
  authClientId: string | null;
}

// --- Users ---

export interface OihUser {
  [key: string]: unknown;
  id: string;
  username?: string;
  email?: string;
}
