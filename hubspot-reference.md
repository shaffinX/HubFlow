# HubSpot API — Practical Reference

Covers: create / read / list / update / delete tasks, search contacts, and sending email (both "real email out" and "message into the HubSpot Inbox").

Sourced from HubSpot developer docs (docs last modified March–April 2026). Where a value is community-sourced rather than documented, it is flagged.

---

## 0. Setup — things you need before any call

### 0.1 Base URL

```
https://api.hubapi.com
```

(`https://api.hubspot.com` also resolves and is used in some official examples — same API.)

### 0.2 Authentication

Every request needs:

```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

Two ways to get a token:

| Method | How to get it | When to use |
|---|---|---|
| **Private app access token** | HubSpot account → Settings → Integrations → Private Apps → Create private app → tick scopes → copy token | Single HubSpot account, server-to-server. Simplest. Token does not expire. |
| **OAuth 2.0 app** | Create app in developer account → user installs → exchange code at `POST https://api.hubapi.com/oauth/v1/token` → get `access_token` (expires ~30 min) + `refresh_token` | Multi-account / marketplace apps, or when you need actions attributed per-user |

OAuth endpoints:
- Authorize: `https://app.hubspot.com/oauth/authorize`
- Token: `https://api.hubapi.com/oauth/v1/token`

### 0.3 Scopes required (per feature)

| What you want to do | Scope(s) |
|---|---|
| Read tasks | `crm.objects.tasks.read` |
| Create / update / delete tasks | `crm.objects.tasks.write` |
| Read contacts (also needed by task reads in some versions) | `crm.objects.contacts.read` |
| Search contacts | `crm.objects.contacts.read` |
| Write associations | `crm.objects.contacts.write` (or the write scope of the target object) |
| Read owners (to get `hubspot_owner_id`) | `crm.objects.owners.read` |
| Send transactional email (single-send) | `transactional-email` |
| Read conversations inbox | `conversations.read` |
| Send message / comment into inbox | `conversations.write` |

If a scope is missing you get a `403` with `context.requiredScopes` listing what's needed.

### 0.4 API versions — important

HubSpot now has two parallel path styles that do the same thing:

| Style | Path shape | Status |
|---|---|---|
| Legacy v3 | `/crm/v3/objects/tasks/{taskId}` | Still fully supported, most examples online use this |
| Dated | `/crm/objects/2026-03/tasks/{taskId}` | Current "latest". Same request/response shapes. |

**Recommendation:** use `v3` unless you have a reason not to — it's stable, widely documented, and every SDK defaults to it. This doc uses v3 paths and notes the dated equivalent where relevant.

### 0.5 Global limits worth knowing

- Search endpoints: **5 requests/second per account**
- Search: max **200** results per page, max **10,000** total results per query, request body max **3,000 characters**
- Search filters: max **5 filterGroups**, max **6 filters** per group, **18 filters** total
- Newly created/updated records take a few moments to show up in search results
- Archived records never appear in search results

---

## 1. Create a task

### Endpoint

```
POST /crm/v3/objects/tasks
```

Dated equivalent: `POST /crm/objects/2026-03/tasks`

### Request body shape

```json
{
  "properties": { ... },
  "associations": [ ... ]
}
```

### Properties — required vs optional

| Field | Required? | Type | Notes |
|---|---|---|---|
| `hs_timestamp` | **REQUIRED** | string | The task **due date**. Unix ms (`"1730259017883"`) or ISO 8601 UTC (`"2019-10-30T03:30:17.883Z"`). This is the only mandatory field. |
| `hs_task_subject` | Optional | string | Title of the task. Practically required — without it the task shows blank in the UI. |
| `hs_task_body` | Optional | string | Task notes / description. Accepts HTML. |
| `hubspot_owner_id` | Optional | string | Owner ID of the assigned user. See §7.1 for how to get it. Unassigned if omitted. |
| `hs_task_status` | Optional | enum | `NOT_STARTED`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `DEFERRED`. Docs formally list `COMPLETED` and `NOT_STARTED`; the others are valid in practice and appear in HubSpot's own example. Defaults to `NOT_STARTED`. |
| `hs_task_priority` | Optional | enum | `LOW`, `MEDIUM`, `HIGH`. |
| `hs_task_type` | Optional | enum | `TODO`, `CALL`, `EMAIL`. Defaults to `TODO`. |
| `hs_task_reminders` | Optional | string | Unix **milliseconds only** (ISO not accepted here). When to fire the reminder. |
| `hs_queue_membership_ids` | Optional | string | Comma-separated task queue IDs, if you use queues. |

Anything else you pass that is read-only or non-existent is silently ignored.

### Associations (optional block)

| Field | Description |
|---|---|
| `to.id` | The record ID you're linking to (contact ID, deal ID, etc.) |
| `types[].associationCategory` | `HUBSPOT_DEFINED` for standard, `USER_DEFINED` for custom labels |
| `types[].associationTypeId` | Numeric direction-specific ID — see §7.2 |

### Full example

```bash
curl https://api.hubapi.com/crm/v3/objects/tasks \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer $TOKEN" \
  --data '{
    "properties": {
      "hs_timestamp": "2026-08-15T09:00:00.000Z",
      "hs_task_subject": "Follow-up for Brian Buyer",
      "hs_task_body": "Send proposal",
      "hubspot_owner_id": "64492917",
      "hs_task_status": "NOT_STARTED",
      "hs_task_priority": "HIGH",
      "hs_task_type": "CALL"
    },
    "associations": [
      {
        "to": { "id": 101 },
        "types": [
          { "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 204 }
        ]
      }
    ]
  }'
```

### Response (`201`)

```json
{
  "id": "17687016786",
  "properties": {
    "hs_createdate": "2026-08-02T10:00:00.000Z",
    "hs_object_id": "17687016786",
    "hs_task_subject": "Follow-up for Brian Buyer",
    "hs_timestamp": "2026-08-15T09:00:00.000Z"
  },
  "createdAt": "2026-08-02T10:00:00.000Z",
  "updatedAt": "2026-08-02T10:00:00.000Z",
  "archived": false
}
```

Keep `id` — that's your `taskId` for everything else.

### Batch create

```
POST /crm/v3/objects/tasks/batch/create
```

Body: `{ "inputs": [ { "properties": {...}, "associations": [...] }, ... ] }` — max 100 per call.

---

## 2. Retrieve one task with all its details

### Endpoint

```
GET /crm/v3/objects/tasks/{taskId}
```

### Path params

| Param | Required | Notes |
|---|---|---|
| `taskId` | Yes | The numeric task ID. By default this is the internal object ID; can be any unique property value if you also pass `idProperty`. |

### Query params (all optional)

| Param | Type | Description |
|---|---|---|
| `properties` | comma-separated list | Properties to return. **If you don't pass this you only get 3 fields** (`hs_createdate`, `hs_lastmodifieddate`, `hs_object_id`). Undefined properties are ignored; defined-but-empty come back as `null`. |
| `propertiesWithHistory` | comma-separated list | Same, but each value also comes with its change history (`value`, `timestamp`, `sourceType`, `updatedByUserId`). Note: this makes responses much bigger and counts against the same limits. |
| `associations` | comma-separated list | Object types to return associated IDs for, e.g. `contacts,companies,deals,tickets`. Non-existent associations are silently skipped. |
| `archived` | boolean | Default `false`. Set `true` to fetch a deleted (recycle-bin) task. |
| `idProperty` | string | Name of a unique property to use instead of the object ID for lookup. |

### "All details" call

```bash
curl -G "https://api.hubapi.com/crm/v3/objects/tasks/17687016786" \
  --header "Authorization: Bearer $TOKEN" \
  --data-urlencode "properties=hs_timestamp,hs_task_subject,hs_task_body,hs_task_status,hs_task_priority,hs_task_type,hs_task_reminders,hubspot_owner_id,hs_created_by_user_id,hs_createdate,hs_lastmodifieddate,hs_object_id,hs_queue_membership_ids,hs_task_completion_date,hs_task_is_completed,hs_body_preview" \
  --data-urlencode "associations=contacts,companies,deals,tickets"
```

### Response shape

```json
{
  "id": "17687016786",
  "properties": { "...": "..." },
  "propertiesWithHistory": { "...": [] },
  "associations": {
    "contacts": {
      "results": [ { "id": "104901", "type": "task_to_contact" } ]
    }
  },
  "createdAt": "2026-08-02T10:00:00.000Z",
  "updatedAt": "2026-08-02T10:05:00.000Z",
  "archived": false,
  "archivedAt": null
}
```

Required/guaranteed response fields: `id`, `properties`, `createdAt`, `updatedAt`, `archived`.

### How to discover every available property

You don't have to guess property names:

```
GET /crm/v3/properties/tasks
```

Returns every task property in the portal (standard + custom), with `name`, `label`, `type`, `fieldType`, and for enums the full `options` list. **Do this once and cache it** — it's the authoritative list for your portal and it includes any custom task properties gmail has added.

### Batch read

```
POST /crm/v3/objects/tasks/batch/read
```

```json
{
  "properties": ["hs_task_subject", "hs_task_status"],
  "inputs": [{ "id": "17687016786" }, { "id": "17687016787" }]
}
```

Max 100 IDs. Note: batch read does **not** return associations.

---

## 3. Retrieve many tasks with all details

You have two options, and they behave very differently.

### 3a. List (no filtering)

```
GET /crm/v3/objects/tasks
```

| Param | Type | Description |
|---|---|---|
| `limit` | int | Results per page. Default 10, max **100** for list endpoints. |
| `after` | string | Paging cursor from `paging.next.after` of the previous response. |
| `properties` | list | Same as single read — pass it or you get 3 fields. |
| `propertiesWithHistory` | list | Same as single read. Reduces max page size. |
| `associations` | list | Same as single read. |
| `archived` | boolean | Default `false`. |

```bash
curl -G "https://api.hubapi.com/crm/v3/objects/tasks" \
  --header "Authorization: Bearer $TOKEN" \
  --data-urlencode "limit=100" \
  --data-urlencode "properties=hs_task_subject,hs_task_status,hs_task_priority,hs_timestamp,hubspot_owner_id" \
  --data-urlencode "associations=contacts,deals"
```

Response:

```json
{
  "results": [ { "id": "...", "properties": {}, "associations": {} } ],
  "paging": { "next": { "after": "100", "link": "..." } }
}
```

Loop while `paging.next.after` exists.

### 3b. Search (filtering, sorting — what you'll actually use)

```
POST /crm/v3/objects/tasks/search
```

Body fields:

| Field | Required | Description |
|---|---|---|
| `filterGroups` | No | Array of filter groups. Groups are OR'd together; filters inside a group are AND'd. Max 5 groups × 6 filters, 18 total. |
| `query` | No | Free-text across default searchable properties. For tasks those are `hs_task_body` and `hs_task_subject`. Max 3,000 chars. |
| `properties` | No | Array of property names to return. **Default for tasks is only `hs_createdate`, `hs_lastmodifieddate`, `hs_object_id`.** |
| `sorts` | No | `[{ "propertyName": "hs_timestamp", "direction": "DESCENDING" }]` — only **one** sort rule allowed. |
| `limit` | No | Default 10, max **200**. |
| `after` | No | Paging cursor (an integer as a string). |

Filter operators:

| Operator | Meaning |
|---|---|
| `EQ` / `NEQ` | Equal / not equal |
| `LT` / `LTE` / `GT` / `GTE` | Comparisons |
| `BETWEEN` | Needs both `value` (low) and `highValue` |
| `IN` / `NOT_IN` | Needs `values` array. **String values must be lowercase.** |
| `HAS_PROPERTY` / `NOT_HAS_PROPERTY` | Value present / absent (no `value` needed) |
| `CONTAINS_TOKEN` / `NOT_CONTAINS_TOKEN` | Token match, supports `*` wildcard |

Case rules: filter values are case-insensitive **except** enumeration properties (case-sensitive) and `IN`/`NOT_IN` on strings (must be lowercase).

Example — all open high-priority tasks for one owner, due in a window:

```bash
curl https://api.hubapi.com/crm/v3/objects/tasks/search \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer $TOKEN" \
  --data '{
    "filterGroups": [
      {
        "filters": [
          { "propertyName": "hs_task_status", "operator": "NEQ", "value": "COMPLETED" },
          { "propertyName": "hs_task_priority", "operator": "EQ", "value": "HIGH" },
          { "propertyName": "hubspot_owner_id", "operator": "EQ", "value": "64492917" },
          { "propertyName": "hs_timestamp", "operator": "BETWEEN",
            "value": "1754092800000", "highValue": "1756771200000" }
        ]
      }
    ],
    "properties": ["hs_task_subject","hs_task_body","hs_task_status","hs_task_priority","hs_task_type","hs_timestamp","hubspot_owner_id"],
    "sorts": [{ "propertyName": "hs_timestamp", "direction": "ASCENDING" }],
    "limit": 100
  }'
```

Tasks for a specific contact — use the pseudo-property `associations.contact`:

```json
{
  "filters": [
    { "propertyName": "associations.contact", "operator": "EQ", "value": "104901" }
  ]
}
```

**Gotchas with search:**
- Search does **not** return an `associations` object. If you need associations, search to get IDs then batch-read, or call the associations API.
- `hs_body_preview_html` is **not supported** as a filter property on tasks/notes/calls/meetings/emails.
- Hard ceiling of 10,000 results per query — for full syncs, page by `hs_lastmodifieddate` in windows instead of paging past 10k.

---

## 4. Update a task

### Endpoint

```
PATCH /crm/v3/objects/tasks/{taskId}
```

### Rules

- Only include the properties you want to change — it's a partial update.
- Read-only and non-existent properties are ignored, not errored.
- To **clear** a value, pass an empty string `""`.
- You cannot change associations with PATCH — use the associations endpoints (§4.1).

```bash
curl https://api.hubapi.com/crm/v3/objects/tasks/17687016786 \
  --request PATCH \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer $TOKEN" \
  --data '{
    "properties": {
      "hs_task_status": "COMPLETED",
      "hs_task_subject": "Close deal",
      "hs_task_body": ""
    }
  }'
```

Returns `200` with the updated object.

Optional query param: `idProperty` (update by a unique property instead of object ID).

### Batch update

```
POST /crm/v3/objects/tasks/batch/update
```

```json
{ "inputs": [ { "id": "17687016786", "properties": { "hs_task_status": "COMPLETED" } } ] }
```

### 4.1 Associate an existing task with a record

```
PUT /crm/v3/objects/tasks/{taskId}/associations/{toObjectType}/{toObjectId}/{associationTypeId}
```

| Field | Description |
|---|---|
| `taskId` | Task ID |
| `toObjectType` | `contacts`, `companies`, `deals`, `tickets`, or an object type ID |
| `toObjectId` | ID of the record |
| `associationTypeId` | Numeric, or snake_case (`task_to_contact`) |

Example: `PUT /crm/v3/objects/tasks/17687016786/associations/contacts/104901/204`

Remove it: same URL with `DELETE`.

v4 equivalent (preferred for new work):

```
PUT /crm/v4/objects/task/{taskId}/associations/default/contact/{contactId}
```

### 4.2 Pin a task on a record

Not a task-API call. Set `hs_pinned_engagement_id` to the task ID when creating/updating the **contact/company/deal/ticket**. The task must already be associated. One pinned activity per record.

---

## 5. Delete a task

### Endpoint

```
DELETE /crm/v3/objects/tasks/{taskId}
```

- No request body.
- Returns `204 No Content`.
- This is a **soft delete** — the task goes to the HubSpot recycling bin and can be restored from the record timeline in the UI.
- Deleted tasks won't appear in list/search results (you can still `GET` them with `?archived=true`).

### Batch delete (archive)

```
POST /crm/v3/objects/tasks/batch/archive
```

```json
{ "inputs": [ { "id": "17687016786" }, { "id": "17687016787" } ] }
```

Returns `204`. Max 100 per call.

---

## 6. Search contacts

### Endpoint

```
POST /crm/v3/objects/contacts/search
```

Same body structure, operators, and limits as §3b.

### Contact-specific defaults

**Returned by default** (if you omit `properties`):
`firstname`, `lastname`, `email`, `lastmodifieddate`, `hs_object_id`, `createdate`

**Searched by default** (when you use `query` instead of `filterGroups`):
`firstname`, `lastname`, `email`, `phone`, `hs_additional_emails`, `fax`, `mobilephone`, `company`, `hs_marketable_until_renewal`

### Example A — find contact by exact email (the most common lookup)

```bash
curl https://api.hubapi.com/crm/v3/objects/contacts/search \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer $TOKEN" \
  --data '{
    "filterGroups": [
      { "filters": [ { "propertyName": "email", "operator": "EQ", "value": "jane@example.com" } ] }
    ],
    "properties": ["email","firstname","lastname","phone","company","hubspot_owner_id","lifecyclestage"],
    "limit": 1
  }'
```

For a straight email lookup you can skip search entirely:

```
GET /crm/v3/objects/contacts/{email}?idProperty=email
```

That's not rate-limited to 5/sec and returns immediately-consistent data — better for high-volume lookups.

### Example B — free text

```json
{ "query": "ahson", "properties": ["email","firstname","lastname"], "limit": 20 }
```

### Example C — domain match with wildcard

```json
{
  "filterGroups": [
    { "filters": [ { "propertyName": "email", "operator": "CONTAINS_TOKEN", "value": "*@gmail.com" } ] }
  ]
}
```

### Example D — AND + OR combined

Contacts named Alice whose surname isn't Smith, **OR** contacts with no email:

```json
{
  "filterGroups": [
    {
      "filters": [
        { "propertyName": "firstname", "operator": "EQ", "value": "Alice" },
        { "propertyName": "lastname", "operator": "NEQ", "value": "Smith" }
      ]
    },
    {
      "filters": [ { "propertyName": "email", "operator": "NOT_HAS_PROPERTY" } ]
    }
  ]
}
```

### Example E — contacts associated with a company

```json
{
  "filters": [
    { "propertyName": "associations.company", "operator": "EQ", "value": "2810868468" }
  ]
}
```

### Response

```json
{
  "total": 2,
  "results": [
    {
      "id": "100451",
      "properties": {
        "createdate": "2024-01-17T19:55:04.281Z",
        "email": "testperson@hubspot.com",
        "firstname": "Test",
        "hs_object_id": "100451",
        "lastmodifieddate": "2024-09-11T13:27:39.356Z",
        "lastname": "Person"
      },
      "createdAt": "2024-01-17T19:55:04.281Z",
      "updatedAt": "2024-09-11T13:27:39.356Z",
      "archived": false
    }
  ],
  "paging": { "next": { "after": "10" } }
}
```

`id` is the **contact ID** — that's what you feed into task associations, conversations filters, etc.

### Paging

Pass `paging.next.after` back as `after` in the next request body. If `paging` is absent, you're done. `after` must be an integer-as-string.

### Phone number caveat

HubSpot normalises phone numbers into internal `hs_searchable_calculated_*` properties using only area code + local number. **Don't include the country code** in phone search values.

---

## 7. Getting the IDs you need

### 7.1 Contact ID (`hubspot_contact_id`)

```
GET /crm/v3/owners
```

Optional query params: `email` (filter to one user), `limit`, `after`, `archived`.

```bash
curl --request GET \
  --url 'https://api.hubapi.com/crm/objects/2026-03/contacts?limit=10' \
  --header 'Authorization: Bearer <token>'
```

Response gives `id` (the owner ID — use this), plus `userId`, `firstName`, `lastName`, `email`.


### 7.2 Association type IDs

Never hardcode these blind. Get them per direction:

```
GET /crm/v4/associations/{fromObjectType}/{toObjectType}/labels
```

e.g. `GET /crm/v4/associations/task/contact/labels`

Returns `{ "results": [ { "category": "HUBSPOT_DEFINED", "typeId": 204, "label": null } ] }`

**Type IDs are directional** — `task → contact` is a different ID from `contact → task`. This is the #1 cause of `invalid from object type` errors.

Commonly used values (verify against the labels endpoint for your portal):

| From → To | typeId | snake_case |
|---|---|---|
| Task → Contact | 204 | `task_to_contact` |
| Task → Company | 192 | `task_to_company` |
| Task → Deal | 216 | `task_to_deal` |
| Task → Ticket | 228 | `task_to_ticket` |

*These four are widely reported working but are not in the official reference table — check the labels endpoint before relying on them in production.*

### 7.3 Task ID

From the create response (`id`), from list/search results, or from the HubSpot UI URL when a task is open.

### 7.4 Property names

```
GET /crm/v3/properties/{objectType}
```
e.g. `/crm/v3/properties/tasks`, `/crm/v3/properties/contacts`. Authoritative per-portal list including custom properties.

### 7.5 Object type IDs

Used where paths want a numeric type: contacts `0-1`, companies `0-2`, deals `0-3`, tickets `0-5`, tasks `0-27`, notes `0-4`, emails `0-49`, meetings `0-47`, calls `0-48`.

---

## 8. Send email

"Send an email" means three different things in HubSpot. Pick the one you actually want.

| Goal | Use | Requires |
|---|---|---|
| Send a real templated email to someone's inbox, tracked in HubSpot | **Single-Send API** | Transactional Email add-on |
| Send a raw email through your own code, tracked in HubSpot | **SMTP API** | Transactional Email add-on |
| Reply inside a HubSpot Conversations Inbox thread (appears as an agent reply) | **Conversations API** | Connected email channel |
| Just log that an email happened, on a record timeline | **Emails engagement API** | `crm.objects.emails.write` |

### 8a. Single-Send API — send a templated email

```
POST /marketing/transactional/v4/single-email/send
```

Dated equivalent: `POST /marketing/transactional/2026-03/single-email/send`

**Prerequisites (non-negotiable):**
1. Transactional Email add-on purchased + dedicated IP set up.
2. An email created in HubSpot's email tool with subscription type = **Transactional** and send method = **Through an API**, then published.
3. The `emailId` — from the email details page after publishing, or from the editor URL: `https://app.hubspot.com/email/{PORTAL_ID}/edit/{EMAIL_ID}/settings`.
4. Scope `transactional-email`.

**Request body:**

| Field | Required? | Type | Notes |
|---|---|---|---|
| `emailId` | **REQUIRED** | number | Content ID of the published transactional email |
| `message` | **REQUIRED** | object | Must contain at minimum `to` |
| `message.to` | **REQUIRED** | string | Recipient address |
| `message.from` | Optional | string | Override From. Format: `"Sender Name <sender@domain.com>"`. Domain must be a connected sending domain. |
| `message.sendId` | Optional (use it) | string | Idempotency key — only one email per `sendId` per account. Prevents duplicates on retry. |
| `message.replyTo` | Optional | array | Reply-To headers |
| `message.cc` | Optional | array | CC'd contacts are **not tracked** and the email won't appear on their timeline |
| `message.bcc` | Optional | array | Useful for keeping your own copy — HubSpot does not store the sent HTML |
| `contactProperties` | Optional | object | Key/value contact properties **written to the contact record** during send |
| `customProperties` | Optional | object | Key/value available in the template as `{{ custom.NAME }}`. Not stored in HubSpot, not in the web version. Arrays only work with programmable email. Nested object access is not supported. |

```bash
curl https://api.hubapi.com/marketing/transactional/v4/single-email/send \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer $TOKEN" \
  --data '{
    "emailId": 4126643121,
    "message": {
      "to": "jane@example.com",
      "from": "gmail <proposals@gmail.com>",
      "sendId": "proposal-8842",
      "bcc": ["archive@gmail.com"]
    },
    "contactProperties": {
      "last_proposal_sent": "2026-08-02"
    },
    "customProperties": {
      "proposalUrl": "https://example.com/p/8842",
      "projectName": "Northern Rail Upgrade"
    }
  }'
```

**Response:**

```json
{ "requestedAt": "2026-08-02T10:00:00.000Z", "status": "PENDING", "sendResult": "SENT" }
```

`status`: `PENDING` | `PROCESSING` | `CANCELED` | `COMPLETE`

`sendResult` values and what they mean:

| Value | Meaning |
|---|---|
| `SENT` | Sent |
| `QUEUED` | Will send when the queue processes |
| `PORTAL_SUSPENDED` | Account email suspended for AUP violation |
| `INVALID_TO_ADDRESS` | Bad address — also fires for role prefixes: `abuse`, `no-reply`, `noreply`, `root`, `spam`, `security`, `undisclosed-recipients`, `unsubscribe`, `inoc`, `postmaster`, `privacy` |
| `BLOCKED_DOMAIN` | Domain can't receive from HubSpot right now |
| `PREVIOUSLY_BOUNCED` | Recipient bounced before; suppressed |
| `PREVIOUS_SPAM` | Recipient marked similar mail as spam |
| `INVALID_FROM_ADDRESS` | From address invalid / domain not authorised |
| `MISSING_CONTENT` | Bad `emailId`, or the email isn't set up for Single-Send |
| `MISSING_TEMPLATE_PROPERTIES` | Template expects `customProperties` you didn't send |

**Side effect to know:** every send auto-associates to a contact by email address, and **creates a new contact if none exists**. If you don't want that, use the SMTP API instead.

### 8b. SMTP API — send arbitrary email through HubSpot

Create a token:

```
POST /marketing/transactional/v4/smtp-tokens
```

| Field | Required | Notes |
|---|---|---|
| `createContact` | Yes | Whether to create contacts for recipients |
| `campaignName` | Yes | Name for the associated campaign |

Response includes `id` (SMTP username), `password` (**only shown once**), `emailCampaignId`, `createdAt`, `createdBy`, `campaignName`.

SMTP connection:

| Setting | Value |
|---|---|
| Host | `smtp.hubapi.com` (EU accounts: `smtp-eu1.hubapi.com`) |
| Port | 25 or 587 (STARTTLS), 465 (direct TLS) |
| Username | token `id` |
| Password | token `password` |

Token management:
- List: `GET /marketing/transactional/v4/smtp-tokens?campaignName=X` (or `emailCampaignId=Y`)
- Get one: `GET /marketing/transactional/v4/smtp-tokens/{tokenId}`
- Reset password: `POST /marketing/transactional/v4/smtp-tokens/{tokenId}/password-reset`
- Delete: `DELETE /marketing/transactional/v4/smtp-tokens/{tokenId}`

Tokens created via API **expire after 12 months**; tokens created in the UI don't. Tokens leaked to public GitHub repos are auto-revoked.

Supports attachments and sending without creating contacts — which Single-Send does not.

### 8c. Conversations API — send a message into an Inbox thread

This is what you want if "send email to inbox" means *reply in the HubSpot Conversations Inbox as an agent*.

```
POST /conversations/v3/conversations/threads/{threadId}/messages
```

**Body fields:**

| Field | Required? | Description |
|---|---|---|
| `type` | **REQUIRED** | `MESSAGE` (sent to the visitor) or `COMMENT` (internal note, inbox-only) |
| `text` | **REQUIRED** | Plain text body |
| `richText` | Optional | HTML body |
| `senderActorId` | **REQUIRED for MESSAGE** | Agent actor ID — `A-{hubspotUserId}` |
| `channelId` | **REQUIRED for MESSAGE** | `1000` live chat, `1001` FB Messenger, `1002` email |
| `channelAccountId` | **REQUIRED for MESSAGE** | The specific connected account. Copy from the most recent message on the thread. |
| `recipients` | Required for email | Array: `actorId`, `name`, `recipientField` (`TO`/`CC`/`BCC`), `deliveryIdentifiers` (`[{ "type": "HS_EMAIL_ADDRESS", "value": "..." }]`) |
| `subject` | Optional | Email subject. Ignored on non-email channels. |
| `attachments` | Optional | `{ "fileId": "<absolute HubSpot file URL>" }`, or quick replies for chat/Messenger |

```bash
curl https://api.hubapi.com/conversations/v3/conversations/threads/176347007/messages \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer $TOKEN" \
  --data '{
    "type": "MESSAGE",
    "text": "Hi Leslie, following up on the proposal.",
    "richText": "<p>Hi Leslie, following up on the proposal.</p>",
    "recipients": [
      {
        "actorId": "E-lknope@example.com",
        "name": "Leslie Knope",
        "recipientField": "TO",
        "deliveryIdentifiers": [
          { "type": "HS_EMAIL_ADDRESS", "value": "lknope@example.com" }
        ]
      }
    ],
    "senderActorId": "A-3892666",
    "channelId": "1002",
    "channelAccountId": "42423411",
    "subject": "Proposal follow-up"
  }'
```

Internal comment only (much simpler — no sender/channel needed):

```json
{ "type": "COMMENT", "text": "Can you follow up?", "richText": "<p>Can you follow up?</p>" }
```

⚠️ Breaking change: from **23 September 2026**, posting `COMMENT` to threads in a **HELP_DESK**-type inbox returns a `VALIDATION_ERROR`. Comments to standard `INBOX` threads are unaffected.

⚠️ WhatsApp sending via this API is not supported.

**Getting the IDs you need:**

| Need | Call |
|---|---|
| `inboxId` | `GET /conversations/v3/conversations/inboxes` — each result has `id` and `type` (`INBOX` or `HELP_DESK`) |
| `channelId` | `GET /conversations/v3/conversations/channels` |
| `channelAccountId` | `GET /conversations/v3/conversations/channel-accounts?channelId=1002&inboxId=481939` |
| `threadId` | `GET /conversations/v3/conversations/threads` — the `id` field **is** the thread ID |
| Thread for one contact | `GET /conversations/v3/conversations/threads?associatedContactId=53701&threadStatus=OPEN` |
| `senderActorId` | Agent actor = `A-` + HubSpot user ID. Look up existing messages on the thread, or `GET /conversations/v3/conversations/actors/{actorId}` |

Thread list query params: `after`, `archived`, `associatedContactId`, `associatedTicketId`, `association` (`TICKET`), `inboxId`, `latestMessageTimestampAfter`, `limit` (max **500**), `sort` (`id` default, or `latestMessageTimestamp` which requires `latestMessageTimestampAfter`).

**Actor ID prefixes:**

| Prefix | Type |
|---|---|
| `A-` | Agent (HubSpot user ID) |
| `E-` | Raw email address, unresolved |
| `I-` | Integration (app ID) |
| `L-` | Breeze Customer Agent |
| `S-` | HubSpot system (`S-hubspot`) |
| `V-` | Visitor (contact ID) |

Other thread operations:
- Update status: `PATCH /conversations/v3/conversations/threads/{threadId}` with `{ "status": "OPEN" | "CLOSED" }`
- Archive: `DELETE /conversations/v3/conversations/threads/{threadId}` (permanent after 30 days)
- Restore: `PATCH /conversations/v3/conversations/threads/{threadId}?archived=true` with `{ "archived": false }`
- Assign: `POST /conversations/v3/conversations/threads/{threadId}/assignee` with `{ "actorId": "jdoe@example.com" }`
- Unassign: `DELETE` on the same path

Webhook events available (need `conversations.read`): `conversation.creation`, `conversation.deletion`, `conversation.privacyDeletion`, `conversation.propertyChange`, `conversation.newMessage`.

### 8d. Log an email on a record (no actual sending)

```
POST /crm/v3/objects/emails
```

Same object-API pattern as tasks. Key properties:

| Property | Notes |
|---|---|
| `hs_timestamp` | **Required.** When the email occurred |
| `hs_email_direction` | `EMAIL` (sent from CRM UI), `INCOMING_EMAIL`, `FORWARDED_EMAIL` |
| `hs_email_status` | `BOUNCED`, `FAILED`, `SCHEDULED`, `SENDING`, `SENT` |
| `hs_email_subject` | Subject line |
| `hs_email_text` | Plain-text body |
| `hs_email_html` | HTML body |
| `hs_email_headers` | JSON string with `from`, `to`, `cc`, `bcc` — each an object with `email`, `firstName`, `lastName` |
| `hubspot_owner_id` | Owner |

Associate to a contact the same way as tasks (`email_to_contact` type ID — check the labels endpoint).

---

## 9. Error handling

Standard error shape:

```json
{
  "status": "error",
  "message": "Invalid input (details will vary based on the error)",
  "correlationId": "aeb5f871-7f07-4993-9211-075dc63e7cbf",
  "category": "VALIDATION_ERROR",
  "context": { "invalidPropertyName": ["propertyValue"], "missingScopes": ["scope1"] },
  "errors": [ { "message": "...", "in": "fieldName", "code": "..." } ]
}
```

Always log `correlationId` — it's what HubSpot support asks for.

| Code | Typical cause |
|---|---|
| 400 | Malformed body, too many filters, body > 3,000 chars in search, paging past 10,000 |
| 401 | Bad/expired token |
| 403 | Missing scope — check `context.missingScopes` |
| 404 | Wrong ID, or record is archived and you didn't pass `archived=true` |
| 409 | Conflict (rare, batch races) |
| 429 | Rate limited — back off. Search is 5/sec; general is typically 100–190 req/10s depending on tier |
| 500/502/503 | HubSpot side — retry with exponential backoff |

Read the `X-HubSpot-RateLimit-Remaining` and `X-HubSpot-RateLimit-Interval-Milliseconds` response headers to self-throttle.

---

## 10. Quick reference table

| Operation | Method | Path | Required in body/URL |
|---|---|---|---|
| Create task | POST | `/crm/v3/objects/tasks` | `properties.hs_timestamp` |
| Batch create tasks | POST | `/crm/v3/objects/tasks/batch/create` | `inputs[]` |
| Get task | GET | `/crm/v3/objects/tasks/{taskId}` | `taskId`; add `properties` + `associations` |
| Batch read tasks | POST | `/crm/v3/objects/tasks/batch/read` | `inputs[].id` |
| List tasks | GET | `/crm/v3/objects/tasks` | — (add `limit`, `properties`, `after`) |
| Search tasks | POST | `/crm/v3/objects/tasks/search` | — (add `filterGroups`, `properties`) |
| Update task | PATCH | `/crm/v3/objects/tasks/{taskId}` | `taskId`, `properties` |
| Batch update tasks | POST | `/crm/v3/objects/tasks/batch/update` | `inputs[].id` + `properties` |
| Delete task | DELETE | `/crm/v3/objects/tasks/{taskId}` | `taskId` |
| Batch delete tasks | POST | `/crm/v3/objects/tasks/batch/archive` | `inputs[].id` |
| Associate task | PUT | `/crm/v3/objects/tasks/{taskId}/associations/{type}/{id}/{typeId}` | all four |
| Search contacts | POST | `/crm/v3/objects/contacts/search` | — |
| Get contact by email | GET | `/crm/v3/objects/contacts/{email}?idProperty=email` | email |
| Get owners | GET | `/crm/v3/owners` | — |
| Get association type IDs | GET | `/crm/v4/associations/{from}/{to}/labels` | from, to |
| Get properties | GET | `/crm/v3/properties/{objectType}` | objectType |
| Send transactional email | POST | `/marketing/transactional/v4/single-email/send` | `emailId`, `message.to` |
| Create SMTP token | POST | `/marketing/transactional/v4/smtp-tokens` | `createContact`, `campaignName` |
| List inboxes | GET | `/conversations/v3/conversations/inboxes` | — |
| List threads | GET | `/conversations/v3/conversations/threads` | — |
| Send inbox message | POST | `/conversations/v3/conversations/threads/{threadId}/messages` | `type`, `text`, `senderActorId`, `channelId`, `channelAccountId` |
| Log email engagement | POST | `/crm/v3/objects/emails` | `properties.hs_timestamp` |

---

## 11. Source pages

- Tasks guide — `https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/tasks/guide`
- Retrieve a task (OpenAPI) — `https://developers.hubspot.com/docs/api-reference/latest/crm/activities/tasks/get-task`
- CRM search — `https://developers.hubspot.com/docs/api-reference/legacy/crm/search-the-crm`
- Transactional email guide — `https://developers.hubspot.com/docs/api-reference/latest/marketing/transactional-emails/guide`
- Conversations API — `https://developers.hubspot.com/docs/api-reference/legacy/conversations/guide`
- Associations v4 — `https://developers.hubspot.com/docs/api-reference/crm-associations-v4/guide`
- Scopes — `https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes`
- Rate limits — `https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines`
- Full docs index — `https://developers.hubspot.com/docs/llms.txt`
