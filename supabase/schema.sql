-- Lumora — Supabase database setup.
--
-- Paste this whole file into the Supabase SQL Editor (Project -> SQL Editor
-- -> New query) and run it once, against a fresh project with no existing
-- Lumora data. It creates every table, enum, trigger, and Row Level
-- Security policy Lumora's data model needs.
--
-- This replaces the earlier Neon + Drizzle schema. The conceptual model is
-- unchanged (same tables, same relationships, same cascade behavior), with
-- two deliberate differences now that Supabase Auth is the auth system:
--
--   1. There is no hand-rolled `session` or `verification_token` table
--      anymore. Supabase Auth (GoTrue) manages sessions (as JWTs) and email
--      verification internally, in its own `auth` schema — duplicating
--      that here would just be two sources of truth for the same thing.
--
--   2. `public.users` is a *profile* table, not the identity table itself.
--      Supabase's own `auth.users` (which you never write to directly) is
--      the identity table; `public.users.id` is a foreign key to it, kept
--      in sync by the trigger below. This is Supabase's standard pattern.
--
-- IMPORTANT — admin bootstrap is NOT done here:
-- Every new profile row defaults to role = 'user'. The trigger below never
-- compares the signing-up user's email against an admin address, and this
-- file never contains the real admin email — putting it in a tracked SQL
-- file would be the same mistake as hardcoding it in application source.
-- Promotion to 'admin' happens in Phase 2's server-side application code:
-- after a user authenticates and their email is verified, server-side code
-- reads the server-only ADMIN_EMAIL env var and — only if it matches —
-- updates that one row's role to 'admin'. The client never sends or
-- chooses a role, and nothing in this file can be used to self-promote.

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

-- Deliberately no insert/update/delete policy for authenticated users here.
-- Rows are created only by the trigger below (which runs with elevated
-- privileges as `security definer`, so it isn't blocked by RLS); `role` is
-- never writable by a client under any policy, in this file or later ones —
-- that's what makes "clients can never set their own role" actually true
-- rather than just a convention.

-- Creates a matching `public.users` row whenever someone signs up via
-- Supabase Auth. `security definer` + a pinned `search_path` is the
-- standard, documented Supabase pattern for this — it lets the trigger
-- write to `public.users` regardless of the RLS policy above, since the
-- function runs as its owner rather than as the newly-created auth user.
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

-- No update/delete policy: messages are append-only in how the app actually
-- uses them (nothing edits or deletes an individual message once sent) —
-- the only way a message disappears is its conversation being deleted,
-- which cascades regardless of these policies.

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
-- topic_progress — per-user, per-topic study activity; the foundation for a
-- future personalized Knowledge Universe. `topic_id` is a plain string that
-- matches the existing static topic ids in app/explore/data.ts
-- (KNOWLEDGE_NODES: "ai", "algorithms", "data-structures", "databases",
-- "networks", "software-engineering", "mathematics") — there's no `topics`
-- table yet, so this is a loose reference by id, not a foreign key.
--
-- Holds knowledge/activity facts only. Never store Three.js/R3F rendering
-- data here (position, rotation, scale, color, camera state, animation
-- state) — the visual Knowledge Universe is expected to derive its layout
-- from this data later, not store the layout itself.
-- ============================================================================

create table public.topic_progress (
  user_id uuid not null references public.users (id) on delete cascade,
  topic_id text not null,
  last_studied_at timestamptz,
  study_count integer not null default 0,
  primary key (user_id, topic_id)
);

alter table public.topic_progress enable row level security;

create policy "Users can view own topic progress"
  on public.topic_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own topic progress"
  on public.topic_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own topic progress"
  on public.topic_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
