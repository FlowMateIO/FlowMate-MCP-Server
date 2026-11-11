# Predefined Lookup Snippets — Index

Ready-to-use LOOKUP snippets for common tenant-specific fields, grouped by domain.

## How to use

- Copy the snippet for the relevant connector and field
- Replace `FIELD_KEY` with the actual target field name from the template schema
- Replace `fieldType` with the correct type for the target field — always context-dependent, never copy blindly
- Replace `STEP_ID` in any `##REFERENCE:STEP_ID:field##` expressions with the actual step ID of the step containing the referenced lookup
- `parameterName` is shown in the Integration Center UI — adjust the label to be descriptive for the end user

> **Note on `fieldType`:** `fieldType` describes the data type expected by the target field. It is not fixed per lookup — always derive it from the target field schema. Exception: some lookups have a fixed `fieldType` due to schema constraints — these are explicitly noted.

---

## Available Snippets

| Connector | Lookup | Depends on | Known usages | File |
|---|---|---|---|---|
| HubSpot | Pipeline | — | `createDealWithAssociations` | `lookups/crm.md` |
| HubSpot | Deal Stage | Pipeline | `createDealWithAssociations` | `lookups/crm.md` |
| HubSpot | Field Selection | — | independent | `lookups/crm.md` |
| Pipedrive | Pipeline | — | `getPipelineDeals_trigger`, `addDeal` | `lookups/crm.md` |
| Pipedrive | Stage | Pipeline (optional) | `addDeal` | `lookups/crm.md` |
| Pipedrive | Field Selection | — | independent | `lookups/crm.md` |
| Salesforce | Field Selection | — | independent | `lookups/crm.md` |
| Salesforce | Opportunity Stage | RecordTypeId | `createOpportunity` | `lookups/crm.md` |
| Slack | Channel | — | `chat_postMessage` | `lookups/communication.md` |
| Microsoft Teams | Send to Channel (teamId + channelId) | — | `sendMessageInChannel` | `lookups/communication.md` |
| Microsoft Teams | Send to Chat (chatId) | — | `sendMessageInChat` | `lookups/communication.md` |
| SharePoint | Drive — Standard Site | — | `getDriveChanges` | `lookups/productivity.md` |
| SharePoint | Drive by Site ID (siteId + driveId) | — | `getDriveChanges` | `lookups/productivity.md` |
| Typeform | Form | — | `getFormResponses` | `lookups/productivity.md` |
| Typeform | Form Fields | Form | — | `lookups/productivity.md` |
| Google Forms | Form | — | `getFormConvertedResponses` | `lookups/productivity.md` |
| Google Forms | Form Fields | Form | — | `lookups/productivity.md` |

## MAPPING_TABLE Snippets

| Connector | Snippet | File |
|---|---|---|
| HubSpot | Map all Deal Stages from source system | `lookups/crm.md` |

# Lookup Snippets

> Snippets are organized by domain. Read `lookups/index.md` first to find the right file,
> then load only the relevant domain file.

→ See `references/lookups/index.md`

# Lookup Snippets — Productivity & Forms

## SharePoint

### Drive — Standard Site

Standalone. No site selection needed.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "value.name",
    "keyPath": "value.id",
    "functionName": "getDrivesFromStandardSite",
    "componentId": "697b929da46ef17ed72c328c",
    "inputParameters": "{}",
    "parameterName": "Drive ID"
  }
}
```

**Known usages:** `getDriveChanges` → `FIELD_KEY = "driveId"` (required)

---

### Drive by Site ID

Depends on Site. Both fields always added together.

> **`siteId` has `fieldType: "TEXT"`** — intentional. Field does not exist in the trigger schema.

```json
"siteId": {
  "fieldType": "TEXT",
  "type": "LOOKUP",
  "data": {
    "labelPath": "name",
    "keyPath": "id",
    "functionName": "getAllSites",
    "componentId": "697b929da46ef17ed72c328c",
    "inputParameters": "{}",
    "parameterName": "Select SharePoint Site"
  }
},
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "name",
    "keyPath": "id",
    "functionName": "getDrivesBySiteId",
    "componentId": "697b929da46ef17ed72c328c",
    "inputParameters": "{\"siteId\":\"##REFERENCE:STEP_ID:siteId##\"}",
    "parameterName": "Select Drive ID"
  }
}
```

> Replace `STEP_ID` with the step ID containing the `siteId` lookup.

**Known usages:** `getDriveChanges` → `siteId` + `FIELD_KEY = "driveId"` (both required)

---

## Typeform

### Form

Standalone.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "title",
    "keyPath": "id",
    "functionName": "getForms",
    "componentId": "67a5bf29eeec84063116b446",
    "inputParameters": "{\"search\":\"\",\"page\":\"\",\"page_size\":\"\",\"workspace_id\":\"\",\"sort_by\":\"\",\"order_by\":\"asc\"}",
    "parameterName": "Select Form"
  }
}
```

**Known usages:** `getFormResponses` → `FIELD_KEY = "form_id"` (required)

---

### Form Fields

Depends on Form.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "useAsJsonata": true,
    "labelPath": "title",
    "keyPath": "id",
    "functionName": "getFormFieldsByFormId",
    "componentId": "67a5bf29eeec84063116b446",
    "inputParameters": "{\"form_id\":\"##REFERENCE:STEP_ID:form_id##\"}",
    "parameterName": "Select form field",
    "jsonataExpression": "data.answers[field.id='#RESPONSE#'].value",
    "value": "[lookup]-getFormFieldsByFormId"
  }
}
```

> Replace `STEP_ID` with the step ID containing the Form lookup.

---

## Google Forms

### Form

Standalone.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "name",
    "keyPath": "id",
    "functionName": "listForms",
    "componentId": "65e1de93f8030eb58c2c5ef8",
    "inputParameters": "{}",
    "parameterName": "Select Google Form"
  }
}
```

**Known usages:** `getFormConvertedResponses` → `FIELD_KEY = "formId"` (required)

---

### Form Fields

Depends on Form.

> Both `keyPath` and `labelPath` are `title` — intentional, specific to Google Forms connector.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "title",
    "keyPath": "title",
    "functionName": "listQuestionsInForm",
    "componentId": "65e1de93f8030eb58c2c5ef8",
    "inputParameters": "{\"formId\":\"##REFERENCE:STEP_ID:formId##\"}",
    "parameterName": "Select form field"
  }
}
```

> Replace `STEP_ID` with the step ID containing the Form lookup.

# Lookup Snippets — CRM

## HubSpot

### Pipeline

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "label",
    "keyPath": "id",
    "functionName": "listPipelines",
    "componentId": "66266abcd91d2c147baca859",
    "inputParameters": "{\"objectType\":\"deals\"}",
    "parameterName": "Pipeline"
  }
}
```

**Known usages:** `createDealWithAssociations` → `FIELD_KEY = "pipeline"` (required)

---

### Deal Stage

Depends on Pipeline. Requires a Pipeline lookup on the same step.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "label",
    "keyPath": "id",
    "functionName": "listAllStagesOfPipeline",
    "componentId": "66266abcd91d2c147baca859",
    "inputParameters": "{\"objectType\":\"deals\",\"pipelineId\":\"##REFERENCE:STEP_ID:pipeline##\"}",
    "parameterName": "dealstage"
  }
}
```

> Replace `STEP_ID` with the step ID containing the Pipeline lookup.

**Known usages:** `createDealWithAssociations` → `FIELD_KEY = "dealstage"` (required)

---

### Field Selection

Standalone. User selects a HubSpot property by object type. Use `onlyCustom: "true"` to restrict to user-created fields only.

> **`keyPath` is `name`** — HubSpot identifies properties by name, not numeric ID.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "label",
    "keyPath": "name",
    "functionName": "readAllProperties",
    "componentId": "66266abcd91d2c147baca859",
    "inputParameters": "{\"objectType\":\"contacts\",\"archived\":\"\",\"properties\":\"\",\"onlyCustom\":\"true\"}",
    "parameterName": "Select Property"
  }
}
```

| `objectType` | Object |
|---|---|
| `contacts` | Contacts |
| `companies` | Companies |
| `deals` | Deals |

**Known usages:** Independent

---

## Pipedrive

### Pipeline

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "data.name",
    "keyPath": "data.id",
    "functionName": "getPipelines",
    "componentId": "616d5ab4347de3001dd913b6",
    "inputParameters": "{}",
    "parameterName": "Select Pipeline"
  }
}
```

**Known usages:** `getPipelineDeals_trigger`, `addDeal` → `FIELD_KEY = "pipeline_id"` (required)

---

### Stage

Optional dependency on Pipeline. With pipeline reference (recommended):

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "data.name",
    "keyPath": "data.id",
    "functionName": "getStages",
    "componentId": "616d5ab4347de3001dd913b6",
    "inputParameters": "{\"pipeline_id\":\"##REFERENCE:STEP_ID:pipeline_id##\",\"start\":\"\",\"limit\":\"\"}",
    "parameterName": "Deal Stage"
  }
}
```

Without pipeline reference (shows all stages) — omit `pipeline_id` from `inputParameters`.

> Replace `STEP_ID` with the step ID containing the Pipeline lookup.

**Known usages:** `addDeal` → `FIELD_KEY = "stage_id"` (required)

---

### Field Selection

| Object | `functionName` | `parameterName` |
|---|---|---|
| Activity | `getActivityFields` | Activity Fields |
| Deal | `getDealFields` | Deal Fields |
| Lead | `getLeadFields` | Lead Fields |
| Note | `getNoteFields` | Note Fields |
| Organization | `getOrganizationFields` | Organization Fields |
| Person | `getPersonFields` | Person Fields |
| Product | `getProductFields` | Product Fields |

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "data.name",
    "keyPath": "data.id",
    "functionName": "FUNCTION_NAME",
    "componentId": "616d5ab4347de3001dd913b6",
    "inputParameters": "{\"start\":\"\",\"limit\":\"\"}",
    "parameterName": "PARAMETER_NAME"
  }
}
```

**Known usages:** Independent

---

## Salesforce

### Field Selection

> **`fieldType` is `TEXT`** — intentional. The field does not exist in the schema and is added manually.
> **`keyPath` is `name`** — Salesforce identifies fields by API name, not label.

```json
"FIELD_KEY": {
  "fieldType": "TEXT",
  "type": "LOOKUP",
  "data": {
    "labelPath": "label",
    "keyPath": "name",
    "functionName": "getCustomFields",
    "componentId": "659c0b82109d679b4db428d7",
    "inputParameters": "{\"objectType\":\"Account\"}",
    "parameterName": "Select Account Fields"
  }
}
```

| Object | `objectType` | `parameterName` |
|---|---|---|
| Account | `Account` | Select Account Fields |
| Contact | `Contact` | Select Contact Fields |
| Lead | `Lead` | Select Lead Fields |
| Opportunity | `Opportunity` | Select Opportunity Fields |

**Known usages:** Independent

---

### Opportunity Stage

Depends on Record Type. Both fields always added together.

> **`RecordTypeId` has `fieldType: "TEXT"`** — intentional.

```json
"RecordTypeId": {
  "fieldType": "TEXT",
  "type": "LOOKUP",
  "data": {
    "labelPath": "Name",
    "keyPath": "Id",
    "functionName": "getRecordTypes",
    "componentId": "659c0b82109d679b4db428d7",
    "inputParameters": "{\"objectType\":\"Opportunity\"}",
    "parameterName": "Select RecordType"
  }
},
"StageName": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "label",
    "keyPath": "value",
    "functionName": "getStageNames",
    "componentId": "659c0b82109d679b4db428d7",
    "inputParameters": "{\"recordTypeId\":\"##REFERENCE:STEP_ID:RecordTypeId##\"}",
    "parameterName": "Select Stage"
  }
}
```

> Replace `STEP_ID` with the step ID containing the `RecordTypeId` lookup.

**Known usages:** `createOpportunity` → both fields required

---

## MAPPING_TABLE Snippets

### HubSpot — Map all Deal Stages from source system

```json
"dealstage": {
  "fieldType": "OUTPUT_FIELD",
  "type": "MAPPING_TABLE",
  "data": {
    "sourceLookupOptions": {
      "keyPath": "REPLACE_WITH_SOURCE_KEY_PATH",
      "labelPath": "REPLACE_WITH_SOURCE_LABEL_PATH",
      "componentId": "REPLACE_WITH_SOURCE_COMPONENT_ID",
      "functionName": "REPLACE_WITH_SOURCE_FUNCTION",
      "inputParameters": "{}"
    },
    "targetLookupOptions": {
      "keyPath": "id",
      "labelPath": "label",
      "componentId": "66266abcd91d2c147baca859",
      "functionName": "listAllStagesOfPipeline",
      "inputParameters": "{\"objectType\":\"deals\",\"pipelineId\":\"##REFERENCE:STEP_ID:pipeline##\"}"
    },
    "showInIC": true,
    "path": "REPLACE_WITH_SOURCE_FIELD_PATH",
    "parameterName": "Map deal stages from [Source] to HubSpot",
    "mappings": [{ "input": "", "output": "" }],
    "targetComponentName": "HubSpot",
    "sourceComponentName": "REPLACE_WITH_SOURCE_NAME",
    "targetLookup": true
  }
}
```

# Lookup Snippets — Communication

## Slack

### Channel

Standalone. User selects a Slack channel.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "channels.name",
    "keyPath": "channels.id",
    "functionName": "conversations_list",
    "componentId": "64490fbbffb1e6008d33caf4",
    "inputParameters": "{\"token\":\"\",\"exclude_archived\":\"\",\"types\":\"public_channel\",\"limit\":\"\",\"cursor\":\"\"}",
    "parameterName": "Slack Channel"
  }
}
```

> Available `types` values: `public_channel`, `private_channel`, `mpim`, `im`. Comma-separate multiple values.

**Known usages:** `chat_postMessage` → `FIELD_KEY = "channel"` (required)

---

## Microsoft Teams

### Send to Channel

Depends on Team. Both fields always added together.

```json
"FIELD_KEY_team": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "value.displayName",
    "keyPath": "value.id",
    "functionName": "getMeJoinedTeams",
    "componentId": "65a69b024dbfa0acdf58c617",
    "inputParameters": "{}",
    "parameterName": "Select Team"
  }
},
"FIELD_KEY_channel": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "value.displayName",
    "keyPath": "value.id",
    "functionName": "getAllChannels",
    "componentId": "65a69b024dbfa0acdf58c617",
    "inputParameters": "{\"teamId\":\"##REFERENCE:STEP_ID:teamId##\"}",
    "parameterName": "Select Channel"
  }
}
```

> Replace `STEP_ID` with the step ID containing the Team lookup.

**Known usages:** `sendMessageInChannel` → `teamId` + `channelId` (both required)

---

### Send to Chat

Standalone.

```json
"FIELD_KEY": {
  "fieldType": "OUTPUT_FIELD",
  "type": "LOOKUP",
  "data": {
    "labelPath": "value.chatDisplayName",
    "keyPath": "value.id",
    "functionName": "listChats",
    "componentId": "65a69b024dbfa0acdf58c617",
    "inputParameters": "{}",
    "parameterName": "Select Chat"
  }
}
```

**Known usages:** `sendMessageInChat` → `FIELD_KEY = "chatId"` (required)
