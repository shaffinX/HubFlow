# HubFlow API Reference

All routes live under `/api/*`, run on the Node.js runtime, and return
JSON. Errors always look like `{ "error": "<message>" }` with an
appropriate HTTP status. Success payloads use resource names as keys.

Chat and message IDs are Postgres UUIDs (`uuid`, `default gen_random_uuid()`).

---

## Chats

### `GET /api/chats`

List every chat, most-recently-updated first.

- **Auth**: none (server currently uses the service-role Postgres connection).
- **Query params**: none.
- **Response 200**:
  ```json
  {
    "chats": [
      {
        "id": "uuid",
        "name": "Q4 Pipeline Review",
        "credential_id": "uuid | null",
        "created_at": "2026-08-01T09:12:00.000Z",
        "updated_at": "2026-08-01T09:12:00.000Z"
      }
    ]
  }
  ```
- **Errors**: `500` on database failure.

### `POST /api/chats`

Create a new chat.

- **Request body**:
  ```json
  {
    "name": "Q4 Pipeline Review",
    "credential_id": "uuid | null"
  }
  ```
  `credential_id` is optional; when omitted or `null`, the chat is
  created unbound.
- **Response 201**: `{ "chat": Chat }` — same shape as list rows.
- **Errors**:
  - `400` when `name` is missing or empty.
  - `500` on database failure.

### `GET /api/chats/:id`

Fetch a single chat by id.

- **Response 200**: `{ "chat": Chat }`
- **Errors**: `404` when not found, `500` on database failure.

### `PATCH /api/chats/:id`

Update a chat. Both fields are independently optional; send only what
you want to change.

- **Request body**:
  ```json
  {
    "name": "New name",
    "credential_id": "uuid | null"
  }
  ```
- **Response 200**: `{ "chat": Chat }`
- **Errors**:
  - `400` when the body has no updatable field.
  - `500` on database failure.

### `DELETE /api/chats/:id`

Delete a chat. Cascades to its messages and audit rows.

- **Response 200**: `{ "ok": true }`
- **Errors**: `500` on database failure.

---

## Messages

Messages are **ordered by `sequence` per chat, not by timestamp** — two
rows written in the same millisecond during streaming would otherwise
render arbitrarily. `sequence` is computed atomically on the server
inside a transaction (`MAX(sequence) + 1`) and is unique per chat.

`client_uuid` is a **client-supplied idempotency key**, unique across
the whole table: retrying the same POST is a no-op that returns the
already-stored row instead of inserting a duplicate.

`payload` (jsonb) holds approval cards and task confirmations so a
reload re-renders them intact.

### `GET /api/chats/:id/messages`

List all messages in a chat, ordered by `sequence` ascending.

- **Response 200**:
  ```json
  {
    "messages": [
      {
        "id": "uuid",
        "chat_id": "uuid",
        "sequence": 1,
        "role": "user | assistant",
        "content": "Hello",
        "payload": null,
        "client_uuid": "uuid",
        "status": "pending | streaming | complete | error",
        "created_at": "2026-08-01T09:12:00.000Z"
      }
    ]
  }
  ```
- **Errors**: `500` on database failure.

### `POST /api/chats/:id/messages`

Append a message. Idempotent by `client_uuid`.

- **Request body**:
  ```json
  {
    "role": "user | assistant",
    "content": "Hello",
    "payload": {},
    "client_uuid": "uuid",
    "status": "complete"
  }
  ```
  `content` defaults to `""`, `status` to `"complete"`, `payload` to `null`.
- **Response 201**: `{ "message": Message }`. When the same
  `client_uuid` has been used before, returns that row unchanged (still
  `201` for now).
- **Side effect**: bumps the chat's `updated_at`.
- **Errors**:
  - `400` when `role` is not `user`/`assistant` or `client_uuid` is missing.
  - `500` on database failure.

---

## Credentials

Portal tokens are stored encrypted at rest with AES-256-GCM using
`ENCRYPTION_KEY`. The list endpoint **never returns** `encrypted_token`.

### `GET /api/credentials`

List credentials (safe view).

- **Response 200**:
  ```json
  {
    "credentials": [
      { "id": "uuid", "label": "Acme HubSpot", "created_at": "…" }
    ]
  }
  ```
- **Errors**: `500` on database failure.

### `POST /api/credentials`

Create a credential. Token is encrypted before being stored.

- **Request body**:
  ```json
  { "label": "Acme HubSpot", "token": "raw-hubspot-token" }
  ```
- **Response 201**:
  ```json
  { "credential": { "id": "uuid", "label": "Acme HubSpot", "created_at": "…" } }
  ```
  The raw token is intentionally not echoed back.
- **Errors**:
  - `400` when `label` or `token` is missing.
  - `500` on database failure (including missing/invalid `ENCRYPTION_KEY`).

### `GET /api/credentials/:id`

Fetch a single credential (safe view).

- **Response 200**:
  ```json
  { "credential": { "id": "uuid", "label": "Acme HubSpot", "created_at": "…" } }
  ```
  The encrypted token is intentionally never returned.
- **Errors**: `404` when not found, `500` on database failure.

### `PATCH /api/credentials/:id`

Rotate the stored token in place. The credential's `id` is preserved, so any
chats already bound to it keep working — the same UUID now points at the new
token. Used by the Settings page's **Replace token** flow.

- **Request body**:
  ```json
  { "token": "new-raw-hubspot-token" }
  ```
- **Response 200**:
  ```json
  { "credential": { "id": "uuid", "label": "Acme HubSpot", "created_at": "…" } }
  ```
  The raw token is intentionally not echoed back.
- **Errors**:
  - `400` when `token` is missing.
  - `404` when the credential doesn't exist.
  - `500` on database failure (including missing/invalid `ENCRYPTION_KEY`).

### `DELETE /api/credentials/:id`

Remove a stored credential. Chats whose `credential_id` referenced this row
have their `credential_id` set to `null` (via `ON DELETE SET NULL`) so the
chat itself is preserved.

- **Response 200**: `{ "ok": true }`
- **Errors**: `500` on database failure.

---

## Audit log

Append-only trace of tool calls. Cheap; the panel that proves the
writes were real.

### `GET /api/audit?chat_id=:uuid`

List audit entries for a chat, newest first.

- **Query params**: `chat_id` (required, uuid).
- **Response 200**:
  ```json
  {
    "entries": [
      {
        "id": "uuid",
        "chat_id": "uuid",
        "tool": "hubspot.deals.update",
        "args": { "dealId": "…", "fields": { "stage": "closed_won" } },
        "result": { "ok": true },
        "created_at": "…"
      }
    ]
  }
  ```
- **Errors**: `400` when `chat_id` is missing, `500` on database failure.

### `POST /api/audit`

Record an audit entry.

- **Request body**:
  ```json
  {
    "chat_id": "uuid",
    "tool": "hubspot.deals.update",
    "args": {},
    "result": {}
  }
  ```
- **Response 201**: `{ "entry": AuditLogEntry }`
- **Errors**:
  - `400` when `chat_id` or `tool` is missing.
  - `500` on database failure.

---

## Conventions

- **IDs**: uuid, generated by Postgres (`gen_random_uuid()`).
- **Timestamps**: `timestamptz`, ISO 8601 strings on the wire.
- **Errors**: `{ "error": "<message>" }` with a 4xx/5xx status.
- **Empty bodies**: send `{}`; the routes tolerate missing optional keys.
- **Runtime**: all routes declare `export const runtime = "nodejs"` because
  `postgres.js` and `node:crypto` are not available on the Edge runtime.
