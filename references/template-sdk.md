## What is a Template?

A template is a blueprint for a Flow. It defines the connector graph, all data
transformations between steps, and optionally prompts the end user for
user-specific input (e.g. "which project?", "which pipeline?"). Templates are
shared across the entire tenant. Publishing a template makes it available to end
users, who can create a flow instance from it with a single click.

New templates are always created as `"draft"` (see rules below). To publish a
draft, call `flowmate_update_template` with `status: "published"` after the
template has been created and verified.

### Data mapping in templates: `mapper`

Templates use a structured `mapper` object on each node. The mapper defines
typed field mappings with explicit types (`TEXT`, `JSONATA`,
`PASSTHROUGH_FIELD`, `INPUT_FIELD`, `LOOKUP`, `USER_SELECT`, etc.). This
structured format enables the FlowMate UI to render user-facing configuration
screens when a user creates a flow from the template.

### Templates ≠ Flows

Do NOT use `transformFunction` in templates — that is the flow mapping mechanism
and will be ignored. Template nodes always use `mapper`.

> See the Flow Reference for flow-specific structure and `transformFunction`
> usage.

---

**Template rules:**

- Follow `references/template-structure.md` exactly — field names, nesting,
  types are not flexible
- Use only endpoints confirmed available in Step 2
- Apply two-pass ID substitution when replacing component IDs (top-level +
  nested in `sourceLookupOptions`)
- `description`: descriptive English name with version suffix (e.g.
  `HubSpot Deal to MySaaS Company v1`)
- `name`: always empty string `""`
- `status`: always `"draft"`
- `type`: omit entirely

### Step 5 — Validation Checklist

Before delivering output, verify internally:

- [ ] All endpoints used exist in the connector (confirmed in Step 2)
- [ ] No self-referencing edges
- [ ] `continueOnError` only in get→not-found→create patterns
- [ ] Bidirectional flows split into separate templates
- [ ] `description` is descriptive with version suffix
- [ ] `name` is `""`
- [ ] `status` is `"draft"`
- [ ] `type` field absent

# FlowMate Template Structure Reference

## Top-Level Envelope

```json
{
  "data": {
    "name": "",
    "description": "Descriptive integration name (e.g. MySaaS Company to HubSpot Deal v1)",
    "graph": {
      "nodes": [...],
      "edges": [...]
    },
    "status": "draft",
    "cron": "*/5 * * * *",
    "tags": [],
    "flowSettings": {
      "webhooks": { "requireWebhookAuth": false }
    },
    "inputSchema": null,
    "outputSchema": null,
    "flattenOutputSchema": false
  }
}
```

**Rules:**

- `description` — the display name shown in FlowMate UI. Use a descriptive
  English name with version suffix (e.g. `MySaaS Company to HubSpot Deal v1`)
- `name` — leave empty (`""`) — **this applies to the top-level template
  envelope only**, not to node `name` fields. Node names should be the
  connector's display name (e.g. `"HubSpot"`, `"Asana"`)
- `status` — always `"draft"`, never `"published"` at creation time. Publishing
  is a separate later step via `flowmate_update_template` with
  `status: "published"`
- `type` — omit entirely
- `cron` — default polling interval, keep as `"*/5 * * * *"` unless specified
  otherwise

---

## Node Structure

Every node follows this schema:

```json
{
  "id": "step_N",
  "componentId": "...",
  "virtualComponentId": "...",
  "componentVersionId": "...",
  "function": "actionName",
  "name": "ConnectorDisplayName",
  "description": "Human readable description",
  "fields": {
    "otherServer": "",
    "instance-otherServer": false
  },
  "nodeSettings": {
    "arraySplittingKey": "data",
    "snapshotKey": "updated_at",
    "passthrough": true,
    "continueOnError": false,
    "applyTransform": "before",
    "autoSaveSnapshots": true
  },
  "mapper": { ... }
}
```

### nodeSettings Rules

| Field                     | When to use                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arraySplittingKey`       | Trigger node only — key in the response that contains the array of records to split into individual messages. Check `outputMetadata` or the response schema in `flowmate_get_connector_details`. Typical values: `results`, `data`, `items`. Prefer `noArraySplitting: true` if race conditions are a risk |
| `snapshotKey`             | Trigger node only — field in each individual record used for delta detection. Typical values: `updatedAt`, `updated_at`, `modifiedAt`. For HubSpot connectors default to `updatedAt` unless the response schema indicates otherwise                                                                        |
| `passthrough: true`       | When downstream nodes need to reference this node's output                                                                                                                                                                                                                                                 |
| `continueOnError: true`   | ONLY for get → not-found → create patterns                                                                                                                                                                                                                                                                 |
| `autoSaveSnapshots: true` | Trigger nodes and intermediate lookup nodes                                                                                                                                                                                                                                                                |
| `applyTransform`          | Always `"before"`                                                                                                                                                                                                                                                                                          |

### function field — Triggers vs Actions

For **action nodes**: `function` is the action name exactly as returned by
`flowmate_get_connector_details` (e.g. `"createTask"`, `"upsertContact"`).

For **trigger nodes**: `function` is also the function name from connector
details (e.g. `"get__crm_v3_objects_deals_getPage"`). The value
`"./lib/triggers/trigger.js"` that appears in connector details is the internal
file path — do **not** use it as the `function` value in a template node.

### fields vs mapper

| Field    | Purpose                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `fields` | Connector configuration — static settings like `otherServer`, `instance-otherServer`. Set once per node, not per message. |
| `mapper` | Data mappings — values from previous steps passed into this step's action.                                                |

> ⚠️ Do NOT put data mappings or dynamic expressions in `fields`. Use `mapper`
> for all data that flows between steps.

---

## Component IDs — Where to Find Them

Every node requires three ID fields sourced from two different MCP calls:

| Node field           | Value to use                                          | Where it comes from                       |
| -------------------- | ----------------------------------------------------- | ----------------------------------------- |
| `virtualComponentId` | `_id` of the connector                                | `flowmate_list_connectors` response       |
| `componentId`        | `componentId` field                                   | `flowmate_get_connector_details` response |
| `componentVersionId` | `_id` of the version (= `defaultVersionId` from list) | `flowmate_get_connector_details` response |

> ⚠️ Do NOT use `_id` from `flowmate_list_connectors` as `componentId` — that
> value is the `virtualComponentId`. Mixing these up will silently produce a
> broken template.

**Two-pass substitution:** When adapting a reference template, replace all three
IDs in both the top-level node definition and inside any `sourceLookupOptions` /
`targetLookupOptions` in the mapper.

---

## Mapper Field Types

> ⚠️ **Before defining mapper keys for a node:**
>
> 1. Check `schemas.in.properties` (from `flowmate_get_function_schemas`) for a
>    `requestBody` key.
> 2. If `requestBody` is present: the mappable fields live under
>    `schemas.in.properties.requestBody.properties`. Use them directly as mapper
>    keys — `"field": {...}`, NOT `"requestBody": {"field": {...}}` or paths
>    like `requestBody.field`.
> 3. If `requestBody` is absent: the mappable fields live directly under
>    `schemas.in.properties`. Use them directly as mapper keys —
>    `"field": {...}`.
>
> In both cases the mapper's key structure is identical — only where you look up
> the fields in the schema differs. (Typical for connectors generated from a
> Swagger/OpenAPI spec, e.g. Slack.)

### TEXT — Static value

```json
"fieldName": {
  "type": "TEXT",
  "fieldType": "OUTPUT_FIELD",
  "data": { "value": "staticValue" }
}
```

### JSONATA — Dynamic expression

```json
"fieldName": {
  "type": "JSONATA",
  "fieldType": "OUTPUT_FIELD",
  "data": { "value": "passthrough.step_1.data.someField" }
}
```

### ARRAY_ELEMENT — For filter arrays (e.g. searchObjects)

```json
"filters#0#propertyName": {
  "type": "TEXT",
  "fieldType": "ARRAY_ELEMENT",
  "data": { "value": "email" },
  "dataField": { "arrayPath": "filters", "index": "0", "property": "propertyName" }
}
```

### LOOKUP — Dynamic dropdown (e.g. pipeline selection)

```json
"pipeline": {
  "type": "LOOKUP",
  "fieldType": "OUTPUT_FIELD",
  "data": {
    "useAsJsonata": false,
    "doubleLookup": false,
    "labelPath": "label",
    "keyPath": "id",
    "functionName": "listPipelines",
    "componentId": "...",
    "inputParameters": "{\"objectType\":\"deals\"}",
    "parameterName": "HubSpot Pipeline"
  }
}
```

### MAPPING_TABLE — Mapped values between systems

```json
"dealstage": {
  "type": "MAPPING_TABLE",
  "fieldType": "OUTPUT_FIELD",
  "data": {
    "sourceLookupOptions": {
      "keyPath": "...",
      "labelPath": "...",
      "componentId": "...",
      "functionName": "...",
      "inputParameters": "{}"
    },
    "targetLookupOptions": {
      "keyPath": "id",
      "labelPath": "label",
      "componentId": "...",
      "functionName": "...",
      "inputParameters": "{}"
    },
    "showInIC": true,
    "path": "passthrough.step_1.data.stage",
    "parameterName": "Map stages from Source to Target",
    "mappings": [{ "input": "", "output": "" }],
    "targetComponentName": "HubSpot",
    "sourceComponentName": "SourceSystem",
    "targetLookup": true,
    "sourceLookup": false
  }
}
```

### INPUT_REFERENCE — Reuse mapper field from another step

```json
"pipeline": {
  "type": "INPUT_REFERENCE",
  "fieldType": "OUTPUT_FIELD",
  "data": {
    "referenceStepId": "step_14",
    "referenceFieldName": "pipeline"
  }
}
```

### PASSTHROUGH_FIELD — Reference a specific field from a previous step

The most common mapper type in multi-step templates. References a named field
from a specific upstream step's output via passthrough.

```json
"fieldName": {
  "type": "PASSTHROUGH_FIELD",
  "fieldType": "OUTPUT_FIELD",
  "data": {
    "passthroughFieldName": "Name",
    "passthroughStepId": "step_1"
  }
}
```

> ⚠️ `passthroughStepId` must reference a data-emitting node (trigger or
> action). Never reference a Logic Gateway step — Gateways route messages but
> emit no data of their own.

### INPUT_FIELD — Reference a field from the current step's incoming data by name

Used when the field name is known but you want the user to confirm or override
it. Passes the field name as a static string that the connector resolves against
`msg.data`.

```json
"fieldName": {
  "type": "INPUT_FIELD",
  "fieldType": "OUTPUT_FIELD",
  "data": {
    "value": "External_ID__c"
  }
}
```

> ⚠️ INPUT_FIELD is NOT the same as PASSTHROUGH_FIELD. INPUT_FIELD passes a
> static string value — it does not resolve the field from a previous step. Use
> PASSTHROUGH_FIELD when you need the actual value from an upstream step.

### USER_SELECT — User-facing toggle or dropdown

Renders a toggle or select input for the end user when creating a flow from the
template.

```json
"fieldName": {
  "type": "USER_SELECT",
  "fieldType": "OUTPUT_FIELD",
  "data": {
    "showAsToggle": true,
    "parameterName": "Send emails?",
    "toggleActiveValue": "true",
    "toggleInactiveValue": "false",
    "selectOptions": [{ "label": "", "value": "" }]
  }
}
```

---

## Logic Gateway Node

Logic Gateways always use fixed IDs — the same across every template, no lookup
needed:

- `componentId`: `658c29cb2eab41b1b9c67d5c`
- `virtualComponentId`: `658c29ca2eab41b1b9c67d5a`
- `componentVersionId`: `658c29cb2eab41b1b9c67d61`

```json
{
  "id": "step_N",
  "componentId": "658c29cb2eab41b1b9c67d5c",
  "virtualComponentId": "658c29ca2eab41b1b9c67d5a",
  "componentVersionId": "658c29cb2eab41b1b9c67d61",
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

### run-next-steps — constraints

`run-next-steps` is single-target, same-flow only.

| Usage                                   | Result                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `["step_N"]` — single step, same flow   | ✅ Works                                                                      |
| `["step_N", "step_M"]` — multiple steps | ❌ Runtime silently drops the message — no step executes                      |
| `["flowId:stepId"]` — different flow    | ❌ Runtime prepends current flow ID → malformed reference, target unreachable |

> ⚠️ Multiple targets do not produce parallel execution. The message is silently
> dropped with no error — this is one of the hardest failure modes to debug.

---

### BRANCHING / SWITCH — multi-branch routing

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
  "virtualComponentId": "658c29ca2eab41b1b9c67d5a",
  "componentVersionId": "658c29cb2eab41b1b9c67d61",
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

---

## Node.js Code Component

Use only when the required logic cannot be expressed with existing components
(mappers, Logic Gateway, transformations). Code is harder to maintain than
declarative configuration — prefer built-in components wherever possible.

**Typical use cases:** outbound HTTP/webhook calls, conditional filtering that
Logic Gateway cannot handle, custom data transformations.

**Fixed node field:**

- `function` is always `execute`

**Default code template:**

```js
async function run(msg, cfg, snapshot, incomingMessageHeaders, tokenData = {}) {
  this.logger.info("going to emit msg: %j", msg);
  this.emit("data", msg);
}
```

**Parameters:**

- `msg` — incoming message from the previous step. `msg.data` contains the
  step's payload; `msg.passthrough` contains all previous steps' outputs
- `cfg` — connector configuration (e.g. `otherServer`, credentials, service
  info)
- `snapshot` — persistent store for state between executions (e.g.
  `lastUpdatedDate`, `itemsCount`)

**Emitting output:**

Pass the message along unchanged:

```js
await this.emit("data", msg);
```

Emit custom data:

```js
const data = { result: "Hello world!" };
await this.emit("data", { data });
```

You can emit multiple data messages in one execution. Not calling `this.emit`
silently stops downstream execution for that message.

**Logging:**

```js
this.logger.info("label: %j", obj); // %j = JSON, %s = string
this.logger.error("something failed: %j", err);
```

**Filtering example** (only pass through completed tasks):

```js
async function run(msg, cfg, snapshot) {
  this.logger.info("Incoming msg: %j", msg);
  if (msg.data.percentComplete === 100) {
    await this.emit("data", msg);
  }
  // no emit = silently skip
}
```

**Rules:**

- `function` field on the node is `execute`
- All code must be inside `async function run(...)`
- Output via `this.emit('data', ...)` — do **not** use `return` to pass data
  downstream
- `fetch` is **not available** — use `request.post({ uri, json: true, body })` /
  `request.get({ uri, json: true })`
- **Do not set a mapper on a Code Component** — the mapper renames fields in
  `msg.data`, breaking alignment with `msg.passthrough`. Access upstream data
  directly via `msg.passthrough.step_N.data.fieldName`
- Boolean values in mappers: use `JSONATA` type — `TEXT` type passes `"true"` as
  a string, not `true` as a boolean

---

## Edges Array

Edges define execution flow. Each edge is a simple source → target pair:

```json
"edges": [
  { "source": "step_1", "target": "step_2" },
  { "source": "step_3", "target": "step_4" }
]
```

> ⚠️ Never create a self-referencing edge (source === target) — causes infinite
> loop. Note: Logic Gateway branching is defined in the Gateway's
> `fields.rule.actions`, NOT in the edges array. Only sequential (non-branching)
> connections go in edges.

### Merge Pattern (multiple paths converging)

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

### Operations

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

---

## passthrough Reference Pattern

To reference data from a previous step in a mapper:

```
passthrough.step_N.data.fieldName
```

For nested fields:

```
passthrough.step_N.data.data.fieldName
```

For conditional fallback (step A result or step B result):

```jsonata
passthrough.step_8.data.results.id ? passthrough.step_8.data.results.id : passthrough.step_10.data.id
```

---

## Common JSONata Patterns

### Extract first name from full name

```jsonata
$trim($replace(passthrough.step_1.data.contact_name, /\s+\S+$/, ''))
```

### Extract last name from full name

```jsonata
$split(passthrough.step_1.data.contact_name, ' ')[$count($split(passthrough.step_1.data.contact_name, ' ')) - 1]
```

---

## Common Pitfalls

| Symptom                                                            | Cause                                                                 | Fix                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Downstream step receives `"true"` string instead of `true` boolean | Mapper field uses `TEXT` type for boolean                             | Switch mapper field to `JSONATA` type                                                                                                                                   |
| Code Component output missing in passthrough                       | Mapper set on Code Component renames `msg.data` fields                | Remove mapper; read `msg.passthrough.step_N.data.field` directly                                                                                                        |
| Logic Gateway branch not taken for EQUALS condition                | Wrong field path, or type mismatch — EQUALS performs no type coercion | Check the field path. An integer field `55779` will not match `{ "type": "string", "data": "55779" }`. Cast numeric fields to string in a code step before the gateway. |
| Template uses wrong `componentId`                                  | `_id` from `flowmate_list_connectors` used as `componentId`           | Use `componentId` from `flowmate_get_connector_details`; `_id` from list is `virtualComponentId`                                                                        |
| Trigger node not firing                                            | `"./lib/triggers/trigger.js"` used as `function` value                | Use the actual function name from connector details (e.g. `"get__crm_v3_objects_deals_getPage"`)                                                                        |
| Step config not applied                                            | Data mapping placed in `fields` instead of `mapper`                   | Move dynamic values to `mapper`; `fields` is for static connector config only                                                                                           |
