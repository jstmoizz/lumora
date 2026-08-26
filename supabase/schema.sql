-- Lumora — Supabase database setup.
--
-- Paste this whole file into the Supabase SQL Editor and run it once,
-- against a fresh project with no existing Lumora data. It creates every
-- table, enum, trigger, and Row Level Security policy Lumora needs.
--
-- No hand-rolled `session`/`verification_token` table: Supabase Auth
-- (GoTrue) manages sessions and email verification in its own `auth`
-- schema. `public.users` is a profile table, not the identity table —
-- `auth.users` is the identity table, and `public.users.id` is a foreign
-- key to it, kept in sync by the trigger below.
--
-- IMPORTANT — admin bootstrap is NOT done here: every new profile defaults
-- to role = 'user', and this file never contains the real admin email.
-- Promotion to 'admin' happens in server-side application code, which
-- reads the server-only ADMIN_EMAIL env var and updates that one row's
-- role — the client never sends or chooses a role.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Enums
-- ============================================================================

create type role as enum ('user', 'admin');
create type theme as enum ('system', 'light', 'dark');

-- ============================================================================
-- users — profile table, one row per auth.users row.
-- ============================================================================

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text,
  role role not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

-- No insert/update/delete policy for authenticated users — rows are
-- created only by the trigger below, so `role` is never client-writable.

-- Creates a matching `public.users` row on signup. `security definer` +
-- a pinned `search_path` lets the trigger write to `public.users`
-- regardless of the RLS policy above.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- conversations — one row per /generate conversation.
-- ============================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- messages — one row per chat turn. `parts` holds the AI SDK message's
-- structured `parts` array as-is (text parts, tool-createQuiz parts, etc.)
-- — deliberately not normalized into separate tables.
-- ============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null,
  content text,
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Users can view own messages"
  on public.messages for select
  using (
    conversation_id in (
      select id from public.conversations where user_id = auth.uid()
    )
  );

create policy "Users can insert own messages"
  on public.messages for insert
  with check (
    conversation_id in (
      select id from public.conversations where user_id = auth.uid()
    )
  );

-- No update/delete policy: messages are append-only. A message only
-- disappears via its conversation being deleted (cascades).

-- ============================================================================
-- user_settings — one row per user (1:1). Defaults mirror the placeholder
-- copy already shown on the Settings page today.
-- ============================================================================

create table public.user_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  theme theme not null default 'system',
  response_style text not null default 'Clear and concise',
  explanation_depth text not null default 'Detailed',
  learning_focus text not null default 'General',
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can view own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- knowledge_nodes — each user's personal knowledge graph (Explore). One row
-- per topic they've actually studied. The graph's root, "Lumora Core", is
-- never a row here — it's virtual, like the app's own CENTRAL_NODE
-- constant. A node with parent_id null is attached directly under Core.
--
-- topic_key is a normalized form of `label`, used only for per-user dedup —
-- not a foreign key, since topics are free text, not a fixed vocabulary.
--
-- Holds knowledge/activity facts only. Never store Three.js/R3F rendering
-- data here (position, rotation, scale, camera state) — the visual graph
-- derives its layout from this data instead of storing it.
-- ============================================================================

create table public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  topic_key text not null,
  label text not null,
  summary text,
  parent_id uuid references public.knowledge_nodes (id) on delete cascade,
  related_labels text[] not null default '{}',
  activity_count integer not null default 0,
  quiz_count integer not null default 0,
  flashcard_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_studied_at timestamptz not null default now(),
  unique (user_id, topic_key)
);

alter table public.knowledge_nodes enable row level security;

create policy "Users can view own knowledge nodes"
  on public.knowledge_nodes for select
  using (auth.uid() = user_id);

create policy "Users can insert own knowledge nodes"
  on public.knowledge_nodes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own knowledge nodes"
  on public.knowledge_nodes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own knowledge nodes"
  on public.knowledge_nodes for delete
  using (auth.uid() = user_id);

create index knowledge_nodes_user_id_idx on public.knowledge_nodes (user_id);

-- ============================================================================
-- knowledge_node_positions — manual 3D overrides for Explore's graph. A
-- separate table, not columns on knowledge_nodes (see its own comment
-- above) — one row per node the user has actually dragged, not one per node.
-- ============================================================================

create table public.knowledge_node_positions (
  node_id uuid primary key references public.knowledge_nodes (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  position_x double precision not null,
  position_y double precision not null,
  position_z double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.knowledge_node_positions enable row level security;

create policy "Users can view own node positions"
  on public.knowledge_node_positions for select
  using (auth.uid() = user_id);

create policy "Users can insert own node positions"
  on public.knowledge_node_positions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.knowledge_nodes
      where id = node_id
        and user_id = auth.uid()
    )
  );

create policy "Users can update own node positions"
  on public.knowledge_node_positions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own node positions"
  on public.knowledge_node_positions for delete
  using (auth.uid() = user_id);

create index knowledge_node_positions_user_id_idx
  on public.knowledge_node_positions (user_id);
