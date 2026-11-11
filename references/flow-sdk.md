# FlowMate Flow Reference

## Before You Build

### What is a Flow?

A flow is a specific, executable instance of an integration or automation. It
belongs to a specific end user within the tenant and contains all
execution-ready configuration: credentials, resolved data mappings, and
schedule.

Unlike templates, flows are not shared — each end user manages their own flow
instances independently.

### Flows ≠ Templates

Do NOT use `mapper` in flows — that is the template mapping mechanism. Flow
nodes always use `transformFunction` inside `nodeSettings` — see Mapping
(`transformFunction`) below.

> See the Template Reference for template-specific structure and `mapper` usage.

---

## Flow Structure

Flows created with `flowmate_create_flow` always start with `status: inactive`.
Start a flow separately using `flowmate_start_flow` after creation.

To test an active flow once without waiting for its cron schedule, trigger it
via `flowmate_send_webhook` — this works for polling (cron) flows too.

---

### Minimum Required Body

The absolute minimum is a `graph` with at least one node. Each node requires
three fields:

| Field         | Required | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `id`          | Yes      | Unique step identifier within the flow (e.g. `step_1`) |
| `componentId` | Yes      | ID of the connector/component to use                   |
| `function`    | Yes      | Function name to call on that component                |

**Minimum valid body (1 node):**

```json
{
  "type": "ordinary",
  "name": "",
  "cron": "*/5 * * * *",
  "description": "My Flow",
  "graph": {
    "nodes": [
      {
        "id": "step_1",
        "componentId": "6a219513d9b9ae97652f4165",
        "function": "drive_drives_list"
      }
    ]
  }
}
```

**Minimum valid body (2+ nodes — edges required):**

```json
{
  "type": "ordinary",
  "name": "",
  "cron": "*/5 * * * *",
  "description": "My Flow",
  "graph": {
    "nodes": [
      {
        "id": "step_1",
        "componentId": "6a219513d9b9ae97652f4165",
        "function": "drive_drives_list"
      },
      {
        "id": "step_2",
        "componentId": "615db405149785001df46e43",
        "function": "execute"
      }
    ],
    "edges": [
      { "source": "step_1", "target": "step_2" }
    ]
  }
}
```

---

### Validation Rules

| Rule                       | Error                                                |
| -------------------------- | ---------------------------------------------------- |
| `graph` is empty `{}`      | `Flows require at least one node.` (400)             |
| Multiple nodes, no `edges` | `Flows with more than one node require edges.` (400) |

---

### Top-Level Flow Fields

| Field          | Required | Description                                                      |
| -------------- | -------- | ---------------------------------------------------------------- |
| `graph`        | Yes      | Flow graph object with `nodes` and optional `edges`              |
| `type`         | Yes      | Always `"ordinary"`                                              |
| `name`         | Yes      | Always `""` (empty string)                                       |
| `cron`         | Yes      | Cron schedule. Default if not specified by user: `"*/5 * * * *"`. `""` for webhook-triggered flows (see Trigger Types) |
| `flowSettings` | No       | Omit — webhook auth is off by default                            |
| `description`  | No       | Human-readable flow description (used as the flow name)          |

---

### Trigger Types

| Type        | How it runs                                                            | `cron`          |
| ----------- | ---------------------------------------------------------------------- | --------------- |
| **Polling** | Runs on the cron schedule; step 1 fetches data from the source system  | e.g. `"*/5 * * * *"` |
| **Webhook** | Runs whenever the source system sends an event to the flow's webhook URL | `""`           |

**Default: build polling flows.** Use a webhook flow if the source system
offers webhooks (e.g. Calendly webhook subscriptions) or the user asks for it.

#### Webhook flows

- No dedicated trigger step is needed. The webhook payload is passed to step 1
  as `data`. Example — "new Calendly booking → find contact in HubSpot → add
  note": step 1 is HubSpot `searchObjects`, mapping from the Calendly payload.
- Webhook URL: `https://api.flowmate.ai/webhooks/<flowId>` — the flow must be
  created first to get its `id`.
- The webhook must be registered in the source system:
  - **Source connector has a webhook function** (e.g. "Create Webhook
    Subscription"): register it via `flowmate_execute_function`, using the
    webhook URL above.
  - **No webhook function:** tell the user to enter the webhook URL in the
    source tool's UI.

---

### Node Fields Reference

| Field            | Required | Description                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| `id`             | Yes      | Unique step ID within the flow (e.g. `step_1`, `step_2`)      |
| `componentId`    | Yes      | ID of the connector component                                 |
| `function`       | Yes      | Function to execute on the component                          |
| `name`           | No       | Human-readable label for the step                             |
| `description`    | No       | Description of what this step does                            |
| `credentials_id` | No       | ID of the stored credential to use for authentication         |
| `fields`         | No       | Component-specific configuration (trigger params, code, etc.) |
| `nodeSettings`   | No       | Runtime behavior settings (see below)                         |

> ⚠️ **`componentId` must come from `flowmate_get_connector_details`'s
> `componentId` field** — never `_id`/`virtualComponentId` from
> `flowmate_list_connectors`, and never `componentVersionId`/`defaultVersionId`.
> Mixing these up is a common cause of broken flows built via MCP. See
> template-sdk.md's "Component IDs — Where to Find Them" section for the full
> lookup table (flow nodes only need this one field; templates additionally need
> `virtualComponentId`/`componentVersionId`).

> ⚠️ **Check for an existing credential before creating one.** Call
> `flowmate_get_credentials_by_component` with the connector's
> `virtualComponentId` (or `flowmate_get_credentials` to list all of the user's
> credentials) to see if a `secretId` already exists for this connector. Only
> create a new one if none exists. Use the resulting `secretId` as the node's
> `credentials_id`.

> ⚠️ **Flows must never contain a `LOOKUP` or `USER_SELECT` mapper entry.**
> Those are template-authoring constructs resolved later by the FlowMate UI. In
> a flow, every mapper field must already hold a concrete, resolved value. Where
> a template would use `LOOKUP`, use `flowmate_execute_function` (see
> lookup-sdk.md for how to find `functionName`/`inputParameters`) to fetch the
> real result and embed it directly.

---

### `nodeSettings` Fields

| Field               | Description                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `applyTransform`    | When to apply mapping: `"before"` (default) or `"after"`                                       |
| `transformFunction` | JSONata mapping expression — defines how data is transformed before/after this step            |
| `continueOnError`   | If `true`, the flow continues even if this step errors                                         |
| `passthrough`       | If `true`, this step's output is available to downstream steps via `passthrough.<stepId>.data` |
| `autoSaveSnapshots` | Whether to auto-save polling snapshots                                                         |
| `initialSnapshot`   | Start value for first poll (default: `"1970-01-01T00:00:00.000Z"`). Must match the format of the `snapshotKey` field — see Initial Data Import below |
| `snapshotKey`       | Field within each individual record — after `arraySplittingKey` splitting — used for delta/incremental polling (e.g. `updatedAt`) |
| `arraySplittingKey` | Key to split array responses into individual messages. Works on trigger and action nodes       |
| `skipImport`        | ⚠️ Not evaluated by generic triggers — do not use. Use `initialSnapshot` instead               |
| `syncParam`         | Query parameter name the trigger endpoint accepts for delta filtering (e.g. `since`, `updatedSince`). Used together with `snapshotKey` — see Initial Data Import below |

---

### Initial Data Import — Default: No Historical Import

By default, a new flow must **not** import existing records — only records
created or changed after the flow is set up. Import historical data only if the
user explicitly asks for it.

> **Scope:** the snapshot approach below applies to **list** trigger endpoints
> (the trigger fetches records and filters them against the snapshot). For
> search endpoints or endpoints with their own time filter (e.g. a `since` /
> `updated_after` parameter), follow the connector's own rules and function
> description instead.

**How (list endpoints):** set `snapshotKey`, `autoSaveSnapshots: true`, and `initialSnapshot` to
the current time.

- **`snapshotKey`:** choose the field based on the user's use case — a
  "created" field for new records only, an "updated" field for new and
  changed records. This refers to the field **inside each individual
  record**, i.e. after `arraySplittingKey` has already split the array —
  e.g. for `{ "data": [{ "updatedAt": "..." }] }` with
  `arraySplittingKey: "data"`, use `snapshotKey: "updatedAt"`, never
  `"data.updatedAt"`.
- **`syncParam`:** if the trigger endpoint supports a native delta-query
  parameter (e.g. `?since=...`, `?updatedSince=...`, `?modified_after=...`),
  set `syncParam` to that parameter's name. FlowMate then passes the stored
  snapshot value as this parameter's value on every run, instead of relying
  on client-side filtering. Leave `syncParam` unset if the endpoint has no
  such parameter.
- **Format:** `initialSnapshot` must use the same format as the `snapshotKey`
  field (ISO 8601 string, Unix seconds as number, Unix milliseconds as
  number). Take the format from the connector schema if it is clear; if not,
  check a real record via `flowmate_execute_function` first.

> ⚠️ A format mismatch fails silently: the trigger emits 0 items on every run
> and never advances the snapshot. No error is raised.

**No usable timestamp field:** ask the user before building. Without a
snapshot, every run fetches the full list — existing records are imported on
the first run and re-emitted on every run after that.

**User explicitly wants historical data:** omit `initialSnapshot` for all
history, or set it to the requested start date (in the field's format). Warn
about volume — pagination support differs per connector, so large histories may
be incomplete or slow.

> Manual (non-OpenAPI) connectors may implement snapshots differently — if the
> trigger's description defines `snapshotKey` behavior, follow it.

---

### Mapping (`transformFunction`)

#### Overview

`transformFunction` is technically optional but **required in practice** for any
action node — without it, action nodes receive no structured input and the flow
will not behave correctly.

**Trigger nodes also require `transformFunction`** when the connector function
accepts parameters (e.g. `properties`, `associations`). Do NOT put these values
in `fields.triggerParams` — that object exists as an empty placeholder only.
Pass all data via `transformFunction` in `nodeSettings`.

```json
"nodeSettings": {
  "applyTransform": "before",
  "autoSaveSnapshots": false,
  "transformFunction": "{\"data\":{\"properties\":\"dealname,dealstage,amount\",\"associations\":\"companies\"},\"metadata\":metadata}"
}
```

#### Where it lives

`transformFunction` is a field inside `nodeSettings`:

```json
"nodeSettings": {
  "applyTransform": "before",
  "transformFunction": "{ ... JSONata expression ... }"
}
```

#### Structure

The value is a JSON-encoded string containing a JSONata expression. It typically
produces an object with two keys:

| Key        | Description                                                 |
| ---------- | ----------------------------------------------------------- |
| `data`     | The payload sent to the connector function                  |
| `metadata` | Pass-through of message metadata — always set to `metadata` |

> ⚠️ **Before building the `data` payload for a step's function:**
>
> 1. Check `schemas.in.properties` (from `flowmate_get_function_schemas`) for a
>    `requestBody` key.
> 2. If `requestBody` is present: the mappable fields live under
>    `schemas.in.properties.requestBody.properties`. Map them directly —
>    `data:{field:value}`, NOT `data:{requestBody:{field:value}}`.
> 3. If `requestBody` is absent: the mappable fields live directly under
>    `schemas.in.properties`. Map them directly — `data:{field:value}`.
>
> In both cases the shape of the `data` object is identical — only where you
> look up the fields in the schema differs. (Typical for connectors generated
> from a Swagger/OpenAPI spec, e.g. Slack.)

**Example — hardcoded values:**

```json
"transformFunction": "{\"data\":{\"objectType\":\"contacts\",\"name\":\"my_field\",\"type\":\"string\"},\"metadata\":metadata}"
```

**Example — dynamic values referencing a previous step via `passthrough`:**

```json
"transformFunction": "{\"data\":{\"hubspot_id\":passthrough.step_1.data.portalId},\"metadata\":metadata}"
```

#### Referencing previous steps

When `passthrough: true` is set on an upstream node, its output is available in
downstream `transformFunction` expressions:

```
passthrough.<stepId>.data.<fieldName>
```

The upstream node must have `"passthrough": true` in its `nodeSettings` for this
to work.

#### `applyTransform` values

| Value      | Behaviour                                                                  |
| ---------- | -------------------------------------------------------------------------- |
| `"before"` | Mapping runs before the connector function executes (default, most common) |
| `"after"`  | Mapping runs after the connector function executes                         |

---

### Edges Array

Required only when a graph has more than one node (see Validation Rules above) —
single-node flows omit `edges` entirely.

Edges define execution flow. Each edge is a simple source → target pair:

```json
"edges": [
  { "source": "step_1", "target": "step_2" },
  { "source": "step_3", "target": "step_4" }
]
```

> ⚠️ Never create a self-referencing edge (source === target) — causes infinite
> loop. Note: Logic Gateway branching is defined in the Gateway's
> `fields.rule.actions`, NOT in the edges array (see Logic Gateway Node below).
> Only sequential (non-branching) connections go in edges.

---

### Logic Gateway Node

Logic Gateway uses a single fixed `componentId` — the same across every flow, no
lookup needed:

- `componentId`: `658c29cb2eab41b1b9c67d5c`

> Logic Gateway nodes need **no `transformFunction`** — the whole configuration
> lives in `fields.rule`.

```json
{
  "id": "step_N",
  "componentId": "658c29cb2eab41b1b9c67d5c",
  "function": "exec",
  "name": "Logic Gateway",
  "description": "Execute a predefined logic for a step",
  "fields": {
    "rule": {
      "type": "CONDITION",
      "subtype": "AND",
      "operands": [
        {
          "operation": "EXISTS",
          "value": { "type": "value", "data": "" },
          "key": {
            "type": "ref",
            "internalType": "OUTPUT_FIELD",
            "data": { "stepId": "step_X", "field": "results[0].id" }
          }
        }
      ],
      "actions": {
        "positive": { "command": "run-next-steps", "parameters": ["step_Y"] },
        "negative": { "command": "run-next-steps", "parameters": ["step_Z"] }
      },
      "command": "EMIT_DATA"
    }
  },
  "nodeSettings": {
    "applyTransform": "before",
    "autoSaveSnapshots": false
  }
}
```

> For array responses (e.g. search results), use bracket notation:
> `results[0].id`. `results.id` only works when `results` is a plain object, not
> an array.

**OR subtype** — positive fires if any one operand matches:

```json
"rule": {
  "type": "CONDITION",
  "subtype": "OR",
  "operands": [
    {
      "operation": "EXISTS",
      "value": { "type": "value", "data": "" },
      "key": {
        "type": "ref",
        "internalType": "OUTPUT_FIELD",
        "data": { "stepId": "step_2", "field": "results[0].id" }
      }
    },
    {
      "operation": "EXISTS",
      "value": { "type": "value", "data": "" },
      "key": {
        "type": "ref",
        "internalType": "OUTPUT_FIELD",
        "data": { "stepId": "step_3", "field": "results[0].id" }
      }
    }
  ],
  "actions": {
    "positive": { "command": "run-next-steps", "parameters": ["step_5"] },
    "negative": { "command": "run-next-steps", "parameters": ["step_6"] }
  },
  "command": "EMIT_DATA"
}
```

**Stopping execution silently:** Use `omit-message` on a branch when the flow
should stop with no downstream step triggered and no error raised:

```json
"negative": { "command": "omit-message" }
```

> Use `omit-message` on the negative branch when the flow should stop silently —
> no downstream step is triggered and no error is raised.

> All operations (EXISTS, EQUALS, CONTAINS, IS_TRUTHY) route to the negative
> branch when the referenced field is missing or undefined — no error is thrown.

> ⚠️ **`EXISTS` and `IS_TRUTHY` do not behave like their names suggest —
> confirmed by test runs (TC-11, TC-14):**
>
> - `EXISTS` is **not** a pure presence check. An empty string (`""`) routes to
>   the **negative** branch, exactly like a missing field. It only returns
>   positive for a genuinely non-empty value.
> - `IS_TRUTHY` is **not** JavaScript truthiness. It only returns positive for
>   the exact boolean `true`. Non-empty strings, non-zero numbers, and other
>   JS-truthy values all route **negative**.
> - Rule of thumb: use `EXISTS` to check "does this field have real content?".
>   Use `IS_TRUTHY` only when the field is an actual boolean flag.

#### Operations

All four operations fail cleanly to the negative branch when the referenced
field is missing or undefined — no error is thrown.

| Operation   | What it checks                             | Value format                                                     | Key constraint                                                                                                               |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `EXISTS`    | Field is present and has a non-empty value | No value needed                                                  | Empty string `""` routes negative — same as a missing field. Not a pure presence check.                                      |
| `EQUALS`    | Value is an exact match                    | `{ "type": "string", "data": "value" }`                          | No type coercion. Integer field `55779` does not match string `"55779"`. Cast numeric fields to string in a code step first. |
| `CONTAINS`  | Value matches a regex pattern              | `{ "type": "regex", "data": { "value": "crit", "flags": "i" } }` | Supports flags. `"i"` = case-insensitive. Works in both CONDITION and SWITCH options.                                        |
| `IS_TRUTHY` | Value is explicitly boolean `true`         | No value needed                                                  | Only boolean `true` routes positive. Non-empty strings and integers route negative. Use EXISTS for non-boolean fields.       |

**Choosing the right operation:**

| Goal                                | Use                                                              |
| ----------------------------------- | ---------------------------------------------------------------- |
| Field is present and not empty      | `EXISTS`                                                         |
| Field equals a specific string      | `EQUALS`                                                         |
| Field matches a pattern             | `CONTAINS` with regex                                            |
| Boolean flag is explicitly `true`   | `IS_TRUTHY`                                                      |
| Numeric comparison                  | Cast to string in a code step, then `EQUALS` or `CONTAINS`       |
| Field has any value (empty allowed) | Not possible with a single operation — preprocess in a code step |

#### run-next-steps — constraints

`run-next-steps` is single-target, same-flow only.

| Usage                                   | Result                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `["step_N"]` — single step, same flow   | ✅ Works                                                                      |

---

#### BRANCHING / SWITCH — multi-branch routing

Use SWITCH when there are more than two possible paths and only one should
execute. Options are evaluated in array order — the first match wins, all
subsequent options are skipped. If no option matches, the `default` action
fires.

- No `"command": "EMIT_DATA"` on the rule (unlike CONDITION)
- Each option can independently use `AND` or `OR` subtype
- Each option can have multiple operands
- `default.action` accepts both `omit-message` and `run-next-steps`

```json
{
  "id": "step_N",
  "componentId": "658c29cb2eab41b1b9c67d5c",
  "function": "exec",
  "name": "Logic Gateway",
  "description": "Route by customer segment",
  "fields": {
    "rule": {
      "type": "BRANCHING",
      "subtype": "SWITCH",
      "options": [
        {
          "type": "CONDITION",
          "subtype": "AND",
          "operands": [
            {
              "operation": "EQUALS",
              "key": {
                "type": "ref",
                "internalType": "OUTPUT_FIELD",
                "data": { "stepId": "step_1", "field": "segment" }
              },
              "value": { "type": "string", "data": "enterprise" }
            }
          ],
          "action": { "command": "run-next-steps", "parameters": ["step_3"] }
        },
        {
          "type": "CONDITION",
          "subtype": "OR",
          "operands": [
            {
              "operation": "EQUALS",
              "key": {
                "type": "ref",
                "internalType": "OUTPUT_FIELD",
                "data": { "stepId": "step_1", "field": "segment" }
              },
              "value": { "type": "string", "data": "smb" }
            },
            {
              "operation": "EQUALS",
              "key": {
                "type": "ref",
                "internalType": "OUTPUT_FIELD",
                "data": { "stepId": "step_1", "field": "segment" }
              },
              "value": { "type": "string", "data": "mid-market" }
            }
          ],
          "action": { "command": "run-next-steps", "parameters": ["step_4"] }
        }
      ],
      "default": {
        "action": { "command": "omit-message", "parameters": [] }
      }
    }
  },
  "nodeSettings": {
    "applyTransform": "before",
    "autoSaveSnapshots": false
  }
}
```

> **Order matters:** Put the most specific options first. If option 1 uses
> CONTAINS "crit" and option 2 uses EQUALS "critical", option 1 will always win
> for the value "critical" — even though option 2 is a more precise match.

#### Merge Pattern (multiple paths converging)

Merging happens through a **combination** of Logic Gateway `actions` and edges —
not edges alone. A step becomes a merge target when multiple upstream sources
(Gateway actions and/or edges) all point to it.

**Example:** "Does contact exist? Yes → send Slack message. No → create contact
→ send Slack message."

```
step_1 (trigger)
  └── step_2 (Gateway: contact exists?)
        ├── positive → step_4 (Slack message)   ← via Gateway action
        └── negative → step_3 (create contact)
                           └── step_4            ← via Edge
```

This produces:

- Gateway `step_2` actions: `positive: ["step_4"]`, `negative: ["step_3"]`
- Edge: `{ "source": "step_3", "target": "step_4" }`

`step_4` is the merge point — reached either directly from the Gateway
(positive) or after the create step (negative path via edge). No special merge
node is needed; the target simply receives execution from whichever path reaches
it.

> ⚠️ Do not rely on edges alone for merging. Gateway `actions` are the primary
> routing mechanism for branches; edges only connect sequential steps within a
> path.

---

### Known Component IDs

| Component     | `componentId`              | Notes                                                                                                                                                  |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js Code  | `615db405149785001df46e43` | Use `fields.code` for the script                                                                                                                       |
| Logic Gateway | `658c29cb2eab41b1b9c67d5c` | Conditional branching — no credentials required. `function`: `exec`. Flow nodes use only `componentId` — no `virtualComponentId`/`componentVersionId`. |

> **Logic Gateway note:** No credentials required. `function` is always `exec`.
> See the Logic Gateway Node section above for full node structure and JSON
> examples.

---

### Node.js Code Node

Before adding a code node, check whether the transformation can be done with
JSONata in the next step's `transformFunction`. Only use a code node when
JSONata is not sufficient — avoid unnecessary code steps.

Default code (`function`: `execute`) — extend it by changing `msg.data` and
emitting `msg`:

```js
async function run(msg, cfg, snapshot, incomingMessageHeaders, tokenData={}) {
	this.logger.info('going to emit msg: %j', msg);
	this.emit('data', msg);
}
```

Set `passthrough: true` in the code node's `nodeSettings` if a later
(non-immediate) step needs its output.

---

### Full Node Example (with mapping)

```json
{
  "id": "step_2",
  "componentId": "66266abcd91d2c147baca859",
  "function": "createProperty",
  "name": "HubSpot",
  "credentials_id": "69f0832edcccb102bf07cac0",
  "description": "Create Property",
  "fields": {
    "otherServer": "",
    "instance-otherServer": false
  },
  "nodeSettings": {
    "continueOnError": true,
    "passthrough": false,
    "applyTransform": "before",
    "autoSaveSnapshots": false,
    "transformFunction": "{\"data\":{\"objectType\":\"contacts\",\"name\":\"my_field\",\"label\":\"My Field\",\"type\":\"string\",\"fieldType\":\"text\",\"groupName\":\"contactinformation\"},\"metadata\":metadata}"
  }
}
```

---

### Full Flow Example (as created by the UI)

```json
{
  "type": "ordinary",
  "name": "",
  "cron": "*/5 * * * *",
  "flowSettings": { "webhooks": { "requireWebhookAuth": false } },
  "description": "My full flow description",
  "graph": {
    "nodes": [
      {
        "id": "step_1",
        "componentId": "6a219513d9b9ae97652f4165",
        "function": "drive_drives_list",
        "name": "Google Drive",
        "description": "Lists the user's shared drives.",
        "credentials_id": "6a2282e22956701851e7b3d8",
        "fields": {
          "triggerParams": {
            "pageSize": "",
            "instance-pageSize": false
          },
          "otherServer": "",
          "instance-otherServer": false
        },
        "nodeSettings": {
          "applyTransform": "before",
          "autoSaveSnapshots": false,
          "initialSnapshot": "1970-01-01T00:00:00.000Z",
          "transformFunction": "{\"data\":{\"pageSize\":\"100\"},\"metadata\":metadata}"
        }
      },
      {
        "id": "step_2",
        "componentId": "615db405149785001df46e43",
        "function": "execute",
        "name": "Node.js code",
        "description": "",
        "fields": {
          "code": "async function run(msg, cfg, snapshot, incomingMessageHeaders, tokenData={}) {\n\tthis.logger.info('going to emit msg: %j', msg);\n\tthis.emit('data', msg);\n}"
        },
        "nodeSettings": {
          "applyTransform": "before",
          "autoSaveSnapshots": false
        }
      }
    ],
    "edges": [
      { "source": "step_1", "target": "step_2" }
    ]
  }
}
```

---

### Connector-Specific Notes

#### HubSpot — `searchObjects`

When building a flow step that calls HubSpot `searchObjects`, strongly prefer
including both of the following:

- `emitOnlyFirstResult: "true"` in the `transformFunction` data payload —
  prevents the flow from emitting and processing every result when only the
  first match is needed.
- `continueOnError: true` in `nodeSettings` — prevents the entire flow from
  failing when the search returns no results (which HubSpot treats as an error).

These are not hard requirements enforced by the platform, but omitting them
frequently causes unexpected behaviour in production flows (infinite fan-out or
silent flow halts on empty searches).

**Recommended `nodeSettings` for a `searchObjects` step:**

```json
"nodeSettings": {
  "applyTransform": "before",
  "continueOnError": true,
  "transformFunction": "{\"data\":{\"objectType\":\"contacts\",\"emitOnlyFirstResult\":\"true\", ...},\"metadata\":metadata}"
}
```

---

### Successful Response

```json
{
  "data": {
    "id": "6a22dc609cd9b5c7707f0432",
    "description": "My Flow",
    "graph": { "...": "..." },
    "owners": [
      { "id": "636d0762bd257a7eb2373d6c", "type": "user" },
      { "id": "636d0762bd257a7eb2373d6a", "type": "tenant" }
    ],
    "status": "inactive",
    "requiresReview": false,
    "createdAt": "2026-06-05T14:25:36.733Z",
    "updatedAt": "2026-06-05T14:25:36.733Z"
  },
  "meta": {}
}
```

The `id` in the response is the flow's permanent identifier — use it for
`flowmate_start_flow`, `flowmate_update_flow`, `flowmate_stop_flow`, and
`flowmate_get_flow_logs`.

---

### Credential & Live-Data Tools

Building a flow sometimes requires information this doc can't hard-code. Use
these tools:

| Tool                                    | Purpose                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `flowmate_get_credentials`              | List all of the current user's credentials                                                                |
| `flowmate_get_credentials_by_component` | Check whether the user already has a credential for a connector (by `virtualComponentId`) before creating a new one |
| `flowmate_create_credential`            | Get a link for the user to add a new credential — only if none already exists                             |
| `flowmate_get_function_schemas`         | Get a connector function's input/output schema before building the node                                   |
| `flowmate_execute_function`             | Call a connector trigger/action and get a real result instantly — e.g. to resolve IDs or check real data formats |

---

### Flow Lifecycle — Required Order of Operations

| Operation              | Prerequisite                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `flowmate_start_flow`  | Flow must exist and be `inactive`                                                       |
| `flowmate_update_flow` | **Flow must be stopped first** (`inactive`) — call `flowmate_stop_flow` before updating |
| `flowmate_stop_flow`   | Flow must be `active`                                                                   |

> **Important:** `flowmate_update_flow` will fail if the flow is currently
> active. Always call `flowmate_stop_flow` to set the flow to `inactive` before
> calling `flowmate_update_flow`. After the update, call `flowmate_start_flow`
> again if the flow should resume running.
