import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const sql = readFileSync(join(__dirname, "..", "schema.sql"), "utf8");

describe("supabase/schema.sql", () => {
  test("creates every expected table", () => {
    for (const table of [
      "public.users",
      "public.conversations",
      "public.messages",
      "public.user_settings",
      "public.knowledge_nodes",
      "public.knowledge_node_positions",
    ]) {
      expect(sql).toContain(`create table ${table}`);
    }
  });

  test("creates both enums", () => {
    expect(sql).toContain("create type role as enum ('user', 'admin')");
    expect(sql).toContain("create type theme as enum ('system', 'light', 'dark')");
  });

  test("enables row level security on every table", () => {
    for (const table of [
      "public.users",
      "public.conversations",
      "public.messages",
      "public.user_settings",
      "public.knowledge_nodes",
      "public.knowledge_node_positions",
    ]) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
  });

  test("knowledge_nodes is unique per user per normalized topic, and cascades from its parent", () => {
    expect(sql).toContain("unique (user_id, topic_key)");
    expect(sql).toMatch(/parent_id uuid references public\.knowledge_nodes \(id\) on delete cascade/);
  });

  test("role defaults to \"user\" and is never client-settable", () => {
    expect(sql).toMatch(/role\s+role\s+not null default 'user'/);
    // `public.users` must have a select policy for a user to read their own
    // row, but no insert/update/delete policy — rows are only ever written
    // by the security-definer trigger, never directly by a client. Asserting
    // the absence guards against a future edit accidentally opening a
    // client-writable path to `role`.
    expect(sql).toMatch(/on public\.users for select/);
    expect(sql).not.toMatch(/on public\.users for insert/);
    expect(sql).not.toMatch(/on public\.users for update/);
    expect(sql).not.toMatch(/on public\.users for delete/);
  });

  test("knowledge_node_positions cascades from both its node and its user", () => {
    expect(sql).toMatch(
      /node_id uuid primary key references public\.knowledge_nodes \(id\) on delete cascade/,
    );
    expect(sql).toMatch(
      /user_id uuid not null references public\.users \(id\) on delete cascade/,
    );
  });

  test("knowledge_node_positions can only be inserted for a node the caller actually owns", () => {
    // Not just `auth.uid() = user_id` on the new row (a client could set
    // user_id to its own id while pointing node_id at someone else's node) —
    // the insert policy must also check the referenced node's own ownership.
    const insertPolicyMatch = sql.match(
      /create policy "Users can insert own node positions"[\s\S]*?with check \(([\s\S]*?)\);/,
    );
    expect(insertPolicyMatch).not.toBeNull();
    const withCheck = insertPolicyMatch![1];
    expect(withCheck).toMatch(/auth\.uid\(\) = user_id/);
    expect(withCheck).toMatch(/from public\.knowledge_nodes/);
    expect(withCheck).toMatch(/id = node_id/);
  });

  test("never contains a real admin email address", () => {
    expect(sql).not.toMatch(/amoiz2082/);
  });

  test("does not create a session or verification_token table", () => {
    expect(sql).not.toMatch(/create table\s+public\.sessions?\b/);
    expect(sql).not.toMatch(/create table\s+public\.verification_tokens?\b/);
  });
});
