# HubSpot Agent Tools

These are the tools the LangGraph agent calls to work with HubSpot (managing tasks, looking up contacts) and to send email (via nodemailer). Each tool is a **plain-TypeScript function** exported from `lib/hubspot/` or `lib/mailer/` — the agent binds them at model level via `bindTools()`. There is no HTTP surface for these — every call happens in-process from the agent runtime.

## Contents

- [Setup](#setup)
- [Shared conventions](#shared-conventions)
- Task tools
  - [`create_task`](#create_task)
  - [`get_task`](#get_task)
  - [`list_tasks`](#list_tasks)
  - [`search_tasks`](#search_tasks)
  - [`update_task`](#update_task)
  - [`delete_task`](#delete_task)
- Contact tools
  - [`list_contacts`](#list_contacts)
  - [`search_contacts`](#search_contacts)
- Email tool
  - [`send_email`](#send_email)
- [Error shape](#error-shape)
- [Notes for the agent implementer](#notes-for-the-agent-implementer)

---

## Setup

Every HubSpot tool needs a private-app access token. The agent resolves it once per turn via `getChatAccessToken(chatId)` (in `lib/agent/credentials.ts`) which:

1. Reads the chat's `credential_id` from Postgres, if set.
2. Falls back to the most-recent credential row managed by the Settings page.
3. Decrypts the token from the `credentials` table (AES-256-GCM) and injects it into the LangGraph `config.configurable.accessToken`.

Tools pull the token off the runnable config — nothing else does.

The `send_email` tool is independent of HubSpot: it uses nodemailer over the SMTP creds you set in `.env` (see `.env.example` for the `SMTP_*` block).

---

## Shared conventions

- **Module path:** `import { createTask, ... } from "@/lib/hubspot"`.
- **Base URL:** `https://api.hubapi.com` — set in `lib/hubspot/client.ts`.
- **Association type ID for tasks → contacts is fixed at `204` with category `HUBSPOT_DEFINED`**, per project spec. If you set `contact_id` on `create_task`, the tool wires up this association automatically — the agent does not need to think about it.
- **Property naming:** the tool functions accept ergonomic camelCase names (`dueDate`, `ownerId`, …) and translate to HubSpot's `hs_*` properties internally. The agent-facing schema exposes snake_case aliases (`due_date`, `owner_id`, …) that Gemini function-calls with.
- **Dates:** `dueDate`/`due_date` accepts ISO 8601 UTC (`"2026-08-15T09:00:00.000Z"`) or Unix ms as a string (`"1755255600000"`). HubSpot accepts both. `reminder_at` is Unix ms **only** (HubSpot rejects ISO for that field).
- **Task status values:** `NOT_STARTED` | `IN_PROGRESS` | `WAITING` | `COMPLETED` | `DEFERRED`.
- **Task priority values:** `LOW` | `MEDIUM` | `HIGH`.
- **Task type values:** `TODO` | `CALL` | `EMAIL`.

---

## `create_task`

Creates a task in HubSpot and optionally links it to a contact.

**Function:** `createTask(input)` in `lib/hubspot/tasks.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | HubSpot bearer token. |
| `dueDate` | string | ✅ | ISO 8601 UTC or Unix ms as string. Maps to `hs_timestamp`. |
| `subject` | string | – | Task title. Recommended — without it the task shows blank in the UI. |
| `body` | string | – | Notes / description. Accepts HTML. |
| `ownerId` | string | – | HubSpot owner ID. |
| `status` | `TaskStatus` | – | Defaults to `NOT_STARTED` in HubSpot. |
| `priority` | `TaskPriority` | – | |
| `type` | `TaskType` | – | Defaults to `TODO`. |
| `reminderAt` | string | – | Unix ms only. |
| `queueMembershipIds` | string | – | Comma-separated task queue IDs. |
| `contactId` | string \| number | – | If set, task is auto-associated to this contact via `HUBSPOT_DEFINED / 204`. |
| `extraAssociations` | array | – | Escape hatch for linking to companies/deals/tickets. Each: `{ toId, associationCategory?, associationTypeId }`. |

**Returns:** the created HubSpot task object (`{ id, properties, createdAt, updatedAt, archived }`). Keep `id` — that's the task's HubSpot ID.

---

## `get_task`

Retrieves one task with associations.

**Function:** `getTask(input)` in `lib/hubspot/tasks.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | |
| `taskId` | string | ✅ | HubSpot task ID. |
| `properties` | string[] | – | Default: full task property set (see `DEFAULT_TASK_PROPERTIES`). |
| `associations` | string[] | – | Default: `["contacts", "companies", "deals", "tickets"]`. |
| `archived` | boolean | – | Set `true` to fetch a soft-deleted task. |

**Returns:** the task object, including an `associations` map when the linked records exist.

---

## `list_tasks`

Lists tasks without any filter. Use `search_tasks` if you need filtering — it's what you'll usually want.

**Function:** `listTasks(input)` in `lib/hubspot/tasks.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | |
| `limit` | number | – | Default 100, max 100 for list endpoints. |
| `after` | string | – | Paging cursor from `paging.next.after`. |
| `properties` | string[] | – | Default: full task property set. |
| `associations` | string[] | – | Default: `["contacts"]`. |
| `archived` | boolean | – | |

**Returns:** `{ results: HubSpotTask[], paging?: { next?: { after, link? } } }`.

---

## `search_tasks`

Filter, sort, and paginate tasks. This is the main read-side tool for the agent.

**Function:** `searchTasks(input)` in `lib/hubspot/tasks.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | |
| `filterGroups` | array | – | `[{ filters: SearchFilter[] }]`. Groups OR'd, filters within a group AND'd. Max 5 groups × 6 filters = 18 filters total. |
| `query` | string | – | Free-text across default task-searchable properties (`hs_task_body`, `hs_task_subject`). Max 3,000 chars. |
| `properties` | string[] | – | Default: full task property set. Search does **not** return associations — call `get_task` afterwards if you need them. |
| `sorts` | array | – | Exactly **one** sort rule allowed by HubSpot: `[{ propertyName, direction }]`. |
| `limit` | number | – | Default 100, max 200. |
| `after` | string | – | Paging cursor (integer as string). |

**`SearchFilter` shape:**

```ts
type SearchFilter = {
  propertyName: string
  operator:
    | "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE"
    | "BETWEEN"            // needs value + highValue
    | "IN" | "NOT_IN"      // needs values[]; string values must be lowercase
    | "HAS_PROPERTY" | "NOT_HAS_PROPERTY"
    | "CONTAINS_TOKEN" | "NOT_CONTAINS_TOKEN"  // supports * wildcard
  value?: string
  highValue?: string
  values?: string[]
}
```

**Special properties:**

- `associations.contact` — filter tasks by associated contact ID.
  ```json
  { "propertyName": "associations.contact", "operator": "EQ", "value": "104901" }
  ```

**Returns:** `{ total, results: HubSpotTask[], paging?: { next?: { after } } }`.

---

## `update_task`

Partial update. Only include fields you want to change. To clear a value, send `""` for that field via the `properties` passthrough.

**Function:** `updateTask(input)` in `lib/hubspot/tasks.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | |
| `taskId` | string | ✅ | |
| `subject`, `body`, `dueDate`, `ownerId`, `status`, `priority`, `type`, `reminderAt`, `queueMembershipIds` | | – | Same semantics as `create_task`. |
| `properties` | `Record<string, string \| null>` | – | Passthrough for custom / less-common HubSpot fields. Merged first, then overridden by the named fields above. |

Changing associations is **not** supported via update — use a dedicated association endpoint (not exposed yet; add if the agent needs it).

**Returns:** the updated task object.

---

## `delete_task`

Soft delete — the task moves to HubSpot's recycling bin (restorable for 30 days).

**Function:** `deleteTask(input)` in `lib/hubspot/tasks.ts`

**Input:**

| Field | Type | Required |
|---|---|---|
| `accessToken` | string | ✅ |
| `taskId` | string | ✅ |

**Returns:** `{ archived: true, id: string }`.

---

## `list_contacts`

Lists contacts. Use `search_contacts` if you need to look up by email — that's far more common.

**Function:** `listContacts(input)` in `lib/hubspot/contacts.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | |
| `limit` | number | – | Default 100. |
| `after` | string | – | |
| `properties` | string[] | – | Default: `email, firstname, lastname, phone, company, hubspot_owner_id, lifecyclestage, createdate, lastmodifieddate, hs_object_id`. |
| `archived` | boolean | – | |

**Returns:** `{ results: HubSpotContact[], paging? }`.

---

## `search_contacts`

Filter/sort/paginate contacts. Same shape as `search_tasks`.

**Function:** `searchContacts(input)` in `lib/hubspot/contacts.ts`

**Special properties:**

- `associations.company` — filter contacts by associated company ID.

**Common recipes:**

Look up by exact email:

```json
{
  "filter_groups": [
    { "filters": [ { "propertyName": "email", "operator": "EQ", "value": "jane@example.com" } ] }
  ],
  "properties": ["email", "firstname", "lastname", "phone", "company"],
  "limit": 1
}
```

Free-text search:

```json
{ "query": "ahson", "properties": ["email","firstname","lastname"], "limit": 20 }
```

Domain wildcard:

```json
{
  "filter_groups": [
    { "filters": [ { "propertyName": "email", "operator": "CONTAINS_TOKEN", "value": "*@gmail.com" } ] }
  ]
}
```

**Returns:** `{ total, results: HubSpotContact[], paging? }`.

---

## `send_email`

Sends a HubFlow-branded HTML email via **nodemailer** over SMTP. Independent of HubSpot — uses your own SMTP provider (Gmail, Outlook 365, Mailtrap, SES, Postmark, anything with SMTP creds).

**Prerequisites:**

1. SMTP credentials from your provider.
2. The following env vars in `.env` — see `.env.example` for presets:
   - `SMTP_HOST` — e.g. `smtp.gmail.com`
   - `SMTP_PORT` — usually `587` (STARTTLS) or `465` (direct TLS)
   - `SMTP_SECURE` — `true` for 465, `false` for 587/25 (auto-derived when omitted)
   - `SMTP_USER` — SMTP username / mailbox address
   - `SMTP_PASS` — SMTP password or app password
   - `SMTP_FROM` — default From address, `"Display Name <address@domain.com>"`. Falls back to `SMTP_USER`.

**Function:** `sendMail(input)` in `lib/mailer/send.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string \| string[] | ✅ | Recipient(s). |
| `subject` | string | ✅ | |
| `body` | string | ✅ | Plain-text body. Rendered into the HubFlow HTML template — blank lines become paragraphs, single newlines become `<br/>`. HTML in `body` is escaped, not injected. |
| `heading` | string | – | Big heading line rendered above the body. |
| `ctaLabel` + `ctaUrl` | string | – | Both required together to render a gradient CTA button under the body. |
| `preheader` | string | – | Inbox preview text (~120 chars max). Hidden in the rendered email. |
| `from` | string | – | Override `SMTP_FROM`. Same `"Name <addr>"` format. |
| `cc` | string \| string[] | – | |
| `bcc` | string \| string[] | – | |
| `replyTo` | string | – | |

Every input value is HTML-escaped before it hits the template, so it's safe to pass user-provided text through directly.

**Returns:**

```json
{
  "messageId": "<abcd@smtp-relay>",
  "accepted": ["jane@example.com"],
  "rejected": [],
  "response": "250 2.0.0 Ok: queued",
  "from": "HubFlow <no-reply@example.com>",
  "to": ["jane@example.com"],
  "subject": "Welcome to HubFlow"
}
```

---

## Error shape

Every route returns errors in the same shape:

```json
{
  "error": "human-readable message",
  "status": 404,
  "correlationId": "aeb5f871-…",
  "hubspot": { "…HubSpot's raw error envelope…": "" }
}
```

HubSpot's HTTP status is preserved on the `HubSpotError` thrown by the tool functions (400/401/403/404/429/500…). Always log `correlationId` — it's what HubSpot support asks for.

Tool functions throw `HubSpotError` (exported from `@/lib/hubspot`), with `status`, `body`, and `correlationId` fields. The agent's tool runtime catches these and turns them into a `ToolMessage` string the LLM can reason about — no silent retries — except on `429` and `5xx`, which are worth retrying with backoff.

---

## Notes for the agent implementer

- **Import from `@/lib/hubspot` and `@/lib/mailer`.** All tool functions live under `lib/`; no HTTP endpoints exist for them.
- **Access token flow.** `getChatAccessToken(chatId)` in `lib/agent/credentials.ts` resolves the token from the chat's bound credential (or the default set in Settings) and the runner injects it into `config.configurable.accessToken`. Tools read it off the runnable config.
- **Look up contact IDs before creating tasks.** Given a name or email from the user, call `search_contacts` first, then pass `contact_id` into `create_task`. The task→contact association is wired up automatically with type ID `204`.
- **For "show me my open tasks" queries, use `search_tasks`** with a filter on `hs_task_status NEQ COMPLETED`, sorted by `hs_timestamp ASCENDING`, not `list_tasks`.
- **Search rate limit is 5 req/s per portal.** If the agent chains contact search → task search, add a small delay or handle the `429`.
