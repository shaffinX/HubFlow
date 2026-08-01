-- HubFlow core schema.
--
-- Design notes captured in the schema:
--   * messages order by sequence, not timestamp — two rows written in the same
--     millisecond during streaming would otherwise render arbitrarily.
--   * messages.client_uuid is unique so client retries are idempotent.
--   * messages.payload (jsonb) holds approval cards and task confirmations so a
--     reload re-renders them properly.
--   * chats.credential_id is nullable — a conversation is bound to a portal so
--     tools know which key to use, but a chat without a portal is still valid.
--   * audit_log is cheap and append-only; it's the panel that proves the writes
--     were real.
--
-- Security notes:
--   * RLS is enabled on all four tables with NO policies. The server connects
--     with the service role and bypasses RLS, so nothing breaks. PostgREST
--     (Supabase's REST layer) sees the public schema, so RLS-with-no-policies
--     is what prevents leaks via the anon key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- credentials — one row per person testing.
-- ---------------------------------------------------------------------------
create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  encrypted_token text not null,
  created_at timestamptz not null default now()
);

alter table public.credentials enable row level security;

-- ---------------------------------------------------------------------------
-- chats — conversations, optionally bound to a credential (portal).
-- ---------------------------------------------------------------------------
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credential_id uuid references public.credentials(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_credential_id_idx on public.chats(credential_id);
create index if not exists chats_updated_at_idx on public.chats(updated_at desc);

alter table public.chats enable row level security;

-- ---------------------------------------------------------------------------
-- messages — ordered by sequence, not timestamp.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sequence integer not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  payload jsonb,
  client_uuid uuid not null unique,
  status text not null default 'complete',
  created_at timestamptz not null default now(),
  unique (chat_id, sequence)
);

create index if not exists messages_chat_seq_idx on public.messages(chat_id, sequence);

alter table public.messages enable row level security;

-- ---------------------------------------------------------------------------
-- audit_log — cheap append-only trace of tool calls.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  tool text not null,
  args jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_chat_id_idx on public.audit_log(chat_id, created_at desc);

alter table public.audit_log enable row level security;
