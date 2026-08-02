# HubSpot Agent Tools

These are the tools the assistant will call to work with HubSpot: managing tasks, looking up contacts, and sending email. Each tool has:

1. A **plain-TypeScript function** in `lib/hubspot/` — this is what the agent will import and call directly.
2. A **temporary REST endpoint** under `/api/hubspot/*` — a thin wrapper so you can test each tool with cURL / Postman right now. Once the agent is wired up these endpoints will be deleted; do **not** document them in `api_reference.md`.

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

Every tool needs a HubSpot private-app access token. Two ways to provide it:

| Consumer | How the token is provided |
|---|---|
| **Agent (final wiring)** | Pass the token directly via `accessToken` on every tool call. |
| **Test endpoints (now)** | Store the token via `POST /api/credentials`, then reference the returned `id` on every call. |

For test endpoints, `credential_id` can be supplied three ways (precedence in this order):

1. `x-credential-id` header — cleanest, keeps IDs out of URLs.
2. `?credential_id=<uuid>` query string — handy for `GET`.
3. `"credential_id": "<uuid>"` in the JSON body.

The route helper decrypts the stored token per request; the tool functions never touch the DB themselves.

---

## Shared conventions

- **Module path:** `import { createTask, ... } from "@/lib/hubspot"`.
- **Base URL:** `https://api.hubapi.com` — set in `lib/hubspot/client.ts`.
- **Association type ID for tasks → contacts is fixed at `204` with category `HUBSPOT_DEFINED`**, per project spec. If you set `contact_id` on `create_task`, the tool wires up this association automatically — the agent does not need to think about it.
- **Property naming:** the tool functions accept ergonomic camelCase names (`dueDate`, `ownerId`, …) and translate to HubSpot's `hs_*` properties internally. The REST endpoints accept snake_case in JSON (`due_date`, `owner_id`, …).
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

**Test endpoint:** `POST /api/hubspot/tasks`

Body (snake_case):

```json
{
  "credential_id": "uuid",
  "due_date": "2026-08-15T09:00:00.000Z",
  "subject": "Follow up with Brian",
  "body": "Send the proposal",
  "owner_id": "64492917",
  "status": "NOT_STARTED",
  "priority": "HIGH",
  "type": "CALL",
  "contact_id": 101
}
```

`201` on success.

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

**Test endpoint:** `GET /api/hubspot/tasks/:id`

Query params (optional): `properties=csv`, `associations=csv`, `archived=true`.

Example:

```
GET /api/hubspot/tasks/17687016786?credential_id=<uuid>&associations=contacts
```

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

**Test endpoint:** `GET /api/hubspot/tasks`

Query params: `limit`, `after`, `properties=csv`, `associations=csv`, `archived=true`.

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

**Test endpoint:** `POST /api/hubspot/tasks/search`

Body:

```json
{
  "credential_id": "uuid",
  "filter_groups": [
    {
      "filters": [
        { "propertyName": "hs_task_status", "operator": "NEQ", "value": "COMPLETED" },
        { "propertyName": "hs_task_priority", "operator": "EQ", "value": "HIGH" },
        { "propertyName": "hubspot_owner_id", "operator": "EQ", "value": "64492917" }
      ]
    }
  ],
  "sorts": [{ "propertyName": "hs_timestamp", "direction": "ASCENDING" }],
  "limit": 100
}
```

**Gotchas:**
- Search is rate-limited to 5 req/sec per account.
- Filter values are case-insensitive except enums (case-sensitive) and string `IN`/`NOT_IN` (must be lowercase).
- Hard ceiling of 10,000 results per query — for full syncs, page by `hs_lastmodifieddate` in windows.

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

**Test endpoint:** `PATCH /api/hubspot/tasks/:id`

Body:

```json
{
  "credential_id": "uuid",
  "status": "COMPLETED",
  "subject": "Close deal"
}
```

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

**Test endpoint:** `DELETE /api/hubspot/tasks/:id`

Credential via header/query only (no body on `DELETE`).

Example:

```
DELETE /api/hubspot/tasks/17687016786?credential_id=<uuid>
```

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

**Test endpoint:** `GET /api/hubspot/contacts`

Query params: `limit`, `after`, `properties=csv`, `archived=true`.

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

**Test endpoint:** `POST /api/hubspot/contacts/search` — same body shape as `search_tasks`.

**Gotcha:** phone-number search — don't include the country code; HubSpot normalises to area code + local number only.

---

## `send_email`

Sends a real templated email via HubSpot's Single-Send transactional email API. Auto-associates to a contact by email and creates one if it doesn't exist.

**Prerequisites (must be set up in HubSpot before this works):**

1. Transactional Email add-on purchased + dedicated IP set up.
2. A published email in HubSpot's email tool with subscription type = **Transactional** and send method = **Through an API**.
3. The `emailId` (content ID) — from the email details page or the editor URL: `https://app.hubspot.com/email/{PORTAL_ID}/edit/{EMAIL_ID}/settings`.
4. The private-app token has the `transactional-email` scope.

**Function:** `sendEmail(input)` in `lib/hubspot/emails.ts`

**Input:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | ✅ | |
| `emailId` | number | ✅ | Content ID of the published transactional email. |
| `to` | string | ✅ | Recipient email. |
| `from` | string | – | `"Sender Name <sender@yourdomain.com>"`. Domain must be a connected sending domain. |
| `sendId` | string | – | Idempotency key. HubSpot dedupes retries per account against this. **Set this on any send you might retry.** |
| `cc` | string[] | – | CC'd contacts are **not tracked** — the email won't appear on their timeline. |
| `bcc` | string[] | – | Useful for keeping your own copy — HubSpot does not store the sent HTML. |
| `replyTo` | string[] | – | |
| `contactProperties` | `Record<string,string>` | – | Written to the recipient's contact record during send. |
| `customProperties` | `Record<string,string>` | – | Available in the template as `{{ custom.NAME }}`. Not stored. |

**Returns:**

```json
{
  "requestedAt": "2026-08-02T10:00:00.000Z",
  "status": "PENDING | PROCESSING | CANCELED | COMPLETE",
  "sendResult": "SENT | QUEUED | INVALID_TO_ADDRESS | ..."
}
```

**Interpretation of `sendResult`:** see §8a of `hubspot-reference.md` for the full list. `SENT` and `QUEUED` are success; everything else is a delivery failure the agent should surface.

**Test endpoint:** `POST /api/hubspot/emails/send`

Body:

```json
{
  "credential_id": "uuid",
  "email_id": 4126643121,
  "to": "jane@example.com",
  "from": "Proposals <proposals@example.com>",
  "send_id": "proposal-8842",
  "bcc": ["archive@example.com"],
  "contact_properties": { "last_proposal_sent": "2026-08-02" },
  "custom_properties": { "proposalUrl": "https://example.com/p/8842" }
}
```

**Side effect to know:** every send auto-associates to a contact by the `to` address and creates a new contact if none exists. If that's undesirable, we'd need to add the SMTP API path (§8b) — not implemented yet.

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

HTTP status is passed through from HubSpot (400/401/403/404/429/500…). Always log `correlationId` — it's what HubSpot support asks for.

Tool functions throw `HubSpotError` (also exported from `@/lib/hubspot`), with `status`, `body`, and `correlationId` fields. The agent should surface those to the user rather than silently retrying — except on `429` and `5xx`, which are retryable with backoff.

---

## Notes for the agent implementer

- **Do not import from `app/api/…`** in the agent. The endpoints are test scaffolding and will be removed. Import from `@/lib/hubspot` and pass `accessToken` directly.
- **Get the access token from the chat's bound credential.** Every chat has a `credential_id`; resolve it once at the start of a turn with `resolveAccessToken(credentialId)` (exported from `@/lib/hubspot`).
- **Look up contact IDs before creating tasks.** Given a name or email from the user, call `searchContacts` first, then pass `contactId` into `createTask`. The task→contact association is wired up automatically with type ID `204`.
- **For "show me my open tasks" queries, use `searchTasks`** with a filter on `hs_task_status NEQ COMPLETED`, sorted by `hs_timestamp ASCENDING`, not `listTasks`.
- **Audit every write.** After a successful `createTask` / `updateTask` / `deleteTask` / `sendEmail`, call `recordAudit` (from `@/lib/models`) so the write shows up in the chat's audit panel.
- **Search rate limit is 5 req/s per portal.** If the agent chains contact search → task search, add a small delay or handle the `429`.
