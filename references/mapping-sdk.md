# nodeSettings Reference

Settings that control how a node executes within a FlowMate flow.

---

## Polling Triggers

Any standard GET endpoint that returns a list of objects can be used as a polling trigger in FlowMate. FlowMate calls the endpoint on a schedule (e.g. every 5 minutes) and uses `snapshotKey` to detect new or updated records.

**Example:** `GET /companies` returns `[{ "id": "...", "name": "...", "createdAt": "..." }]`
→ Set `arraySplittingKey: "data"` (or whatever the array key is) and `snapshotKey: "createdAt"`

FlowMate stores the latest `createdAt` value after each run. On the next execution, only records newer than that timestamp are processed (via `syncParam` if the endpoint supports it, otherwise client-side filtering).

> There is no special "trigger" endpoint type needed — regular GET list endpoints work as polling triggers.

---

## `arraySplittingKey`

The key in the trigger response that contains the array of records. FlowMate splits this array and processes each item as a separate message.

**Example:** If the trigger returns `{ "data": [...] }`, set `arraySplittingKey: "data"`.

```json
"nodeSettings": {
  "arraySplittingKey": "data",
  "snapshotKey": "updated_at",
  "autoSaveSnapshots": false
}
```

> This is the standard field available in all generated connectors and most manual connectors. It is set on the trigger node only.

---

## `snapshotKey`

The field name in the trigger response that contains a timestamp. FlowMate stores this value after each execution. On the next run, only records newer than the stored timestamp are processed.

**Example:** `snapshotKey: "updated_at"`

> Always used together with `arraySplittingKey` on the trigger node.

---

## `syncParam`

The query parameter name that the trigger endpoint accepts to filter records by date (e.g. `since`, `modified_after`). Must be used **together with `snapshotKey`**.

FlowMate passes the stored snapshot value as the value for this parameter on each execution.

```json
"nodeSettings": {
  "arraySplittingKey": "data",
  "snapshotKey": "updated_at",
  "syncParam": "since",
  "autoSaveSnapshots": false
}
```

> If the endpoint does not support a date filter parameter, leave `syncParam` empty.

---

## `autoSaveSnapshots`

- `false` on trigger nodes
- `false` on Logic Gateway nodes (`exec`)
- `false` on create/update action nodes

---

## `passthrough`

Set to `true` when downstream nodes need to reference this node's output via `passthrough.step_N.data.*`.

- Trigger node: always `true` (implicitly)
- Intermediate lookup/get nodes: `true`
- Final create/update nodes with no downstream references: `false`

---

## `continueOnError`

Set to `true` **only** for get → not-found → create patterns, where a 404/not-found response is expected and handled by a Logic Gateway immediately after.

> Never use for general error fallback logic.

---

## All nodeSettings Fields (reference)

| Field | Trigger | Lookup/Search | Logic Gateway | Create/Update |
|---|---|---|---|---|
| `arraySplittingKey` | ✅ set | — | — | — |
| `snapshotKey` | ✅ set | — | — | — |
| `syncParam` | if supported | — | — | — |
| `autoSaveSnapshots` | `false` | — | `false` | `false` |
| `passthrough` | `true` | `true` | — | depends |
| `continueOnError` | — | get→create only | — | — |
| `applyTransform` | `"before"` | `"before"` | `"before"` | `"before"` |
| `idLinking` | — | `false` | — | `false` |



# FlowMate Mapping Rules Reference

## Mapper Types

Every mapper field follows this base structure:

```json
{
  "fieldName": {
    "fieldType": "OUTPUT_FIELD",
    "type": "<MAPPER_TYPE>",
    "data": {
      "value": "..."
    }
  }
}
```

- The top-level key is the **target field path** (e.g. `properties.email`)
- `fieldType` is always `OUTPUT_FIELD`
- `type` is one of the mapper types below
- `data` contains mapper-specific configuration

---

### INPUT_FIELD
Maps a source field directly to a target field. **Default mapper — use unless another type is more appropriate.**

```json
{
  "firstName": {
    "fieldType": "OUTPUT_FIELD",
    "type": "INPUT_FIELD",
    "data": {
      "value": "contact.first_name"
    }
  }
}
```

---

### TEXT
Fills a field with a static value identical for all records.

```json
{
  "status": {
    "fieldType": "OUTPUT_FIELD",
    "type": "TEXT",
    "data": {
      "value": "Open"
    }
  }
}
```

---

### USER_INPUT
Prompts the user to enter a static value at flow creation time. Use when the value is instance-specific and cannot be determined automatically.

```json
{
  "category": {
    "fieldType": "OUTPUT_FIELD",
    "type": "USER_INPUT",
    "data": {
      "parameterName": "Please enter the name of the category"
    }
  }
}
```

---

### JSONATA
Dynamic expression using JSONata syntax. Use for transformations, conditionals, or referencing passthrough data.

```json
{
  "fullName": {
    "fieldType": "OUTPUT_FIELD",
    "type": "JSONATA",
    "data": {
      "value": "passthrough.step_1.data.first_name & ' ' & passthrough.step_1.data.last_name"
    }
  }
}
```

**FlowMate JSONata constraints:**
- Use **single quotes** `'` for string literals — never double quotes `"`
- The entire expression must be on a **single line** — no line breaks allowed

> Emoji support depends on the target connector — check the connector reference for specific rules.

---

### LOOKUP
Dynamic dropdown populated at flow creation time from a connector function. Use for tenant-specific identifiers.

```json
{
  "pipeline": {
    "fieldType": "OUTPUT_FIELD",
    "type": "LOOKUP",
    "data": {
      "useAsJsonata": false,
      "doubleLookup": false,
      "labelPath": "label",
      "keyPath": "id",
      "functionName": "listPipelines",
      "componentId": "...",
      "inputParameters": "{\"objectType\":\"deals\"}",
      "parameterName": "Select HubSpot Pipeline"
    }
  }
}
```

---

### MAPPING_TABLE
Maps values between source and target systems via a user-defined table. Use for status/stage fields that differ per system.

```json
{
  "dealstage": {
    "fieldType": "OUTPUT_FIELD",
    "type": "MAPPING_TABLE",
    "data": {
      "sourceLookupOptions": { ... },
      "targetLookupOptions": { ... },
      "showInIC": true,
      "path": "passthrough.step_1.data.stage",
      "parameterName": "Map deal stages from Source to HubSpot",
      "mappings": [{ "input": "", "output": "" }],
      "targetLookup": true,
      "sourceLookup": false
    }
  }
}
```

---

### ARRAY_ELEMENT
For fields that are part of an array structure (e.g. search filters). Requires `dataField` with arrayPath, index, and property.

```json
{
  "filters#0#propertyName": {
    "fieldType": "ARRAY_ELEMENT",
    "type": "TEXT",
    "data": { "value": "email" },
    "dataField": { "arrayPath": "filters", "index": "0", "property": "propertyName" }
  }
}
```

---

### INPUT_REFERENCE
Reuses a mapper field defined in another step. Use to avoid duplicating LOOKUP or MAPPING_TABLE definitions.

```json
{
  "pipeline": {
    "fieldType": "OUTPUT_FIELD",
    "type": "INPUT_REFERENCE",
    "data": {
      "referenceStepId": "step_14",
      "referenceFieldName": "pipeline"
    }
  }
}
```

---

## Mapping Decision Rules

### When to apply defaults vs. ask the user

| Field Type | Mapper to Use | Ask User? |
|---|---|---|
| Tenant-specific identifiers (pipeline ID, channel ID, form ID) | `LOOKUP` | Yes — user selects at flow creation |
| Status/stage values that differ per system | `MAPPING_TABLE` | Yes — user maps values |
| Free-form instance-specific values (category, tag, label) | `USER_INPUT` | Yes — user enters at flow creation |
| Well-known standard fields (email, first name, last name, phone) | `INPUT_FIELD` | No — propose default mapping |
| Obvious static config required by target (object type, static flags) | `TEXT` | No — use sensible default |
| Transformations or conditional logic | `JSONATA` | No — generate expression, explain it |

### Default mapping is allowed only when ALL of these are true:
1. It follows a **widely accepted convention** (e.g. `email → email`, `first_name → firstName`)
2. It is **unlikely to cause incorrect behavior** if the convention holds
3. It is **reversible** — the user can override it without breaking the flow

### When to ask the user
Present a **Mapping Proposal** before generating the template for any field where:
- The correct value is tenant-specific (pipeline, channel, form, board)
- The field is a status/stage that must be mapped between systems
- No clear convention exists between source and target field names
- The field is required and has no safe default

**Mapping Proposal Format:**

```
## Mapping Proposal — [Step Name]

The following fields require your input before I can generate the template:

| Target Field | Proposed Approach | Reason |
|---|---|---|
| pipeline | LOOKUP (user selects) | Tenant-specific — differs per HubSpot account |
| dealstage | MAPPING_TABLE | Stage names differ between source and HubSpot |
| properties.email | INPUT_FIELD ← source.email | Standard convention |
| tag | USER_INPUT | No source field available — static value needed |

**Questions:**
1. Should `properties.phone` map from `mobile` or `phone` in the source?
2. Is there a default owner for created contacts, or should this come from the source?

Please confirm or adjust before I generate the template.
```

---

## Full Mapping Example

Given source (step_1 output) and target (step_2 input):

**Source fields:** `data.first_name`, `data.last_name`, `data.email`
**Target fields:** `firstName`, `lastName`, `email`, `tag`

**Generated mapping for step_2:**
```json
{
  "firstName": {
    "fieldType": "OUTPUT_FIELD",
    "type": "INPUT_FIELD",
    "data": { "value": "data.first_name" }
  },
  "lastName": {
    "fieldType": "OUTPUT_FIELD",
    "type": "INPUT_FIELD",
    "data": { "value": "data.last_name" }
  },
  "email": {
    "fieldType": "OUTPUT_FIELD",
    "type": "INPUT_FIELD",
    "data": { "value": "data.email" }
  },
  "tag": {
    "fieldType": "OUTPUT_FIELD",
    "type": "USER_INPUT",
    "data": { "parameterName": "Please enter a tag for the synchronised contacts" }
  }
}
```
