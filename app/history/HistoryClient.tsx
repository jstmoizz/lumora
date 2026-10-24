"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { HistoryIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConversationRowActions from "@/app/components/conversations/ConversationRowActions";
import RenameConversationForm from "@/app/components/conversations/RenameConversationForm";
import ConfirmDialog from "@/app/explore/components/ConfirmDialog";
import {
  readActiveConversationId,
  writeActiveConversationId,
} from "@/app/generate/activeConversationStorage";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { normalizeConversationTitle } from "@/lib/conversationTitle";
import {
  deleteConversation,
  renameConversation,
} from "@/lib/supabase/conversation-actions";
import type { ConversationSummary } from "@/lib/supabase/conversations";
import HistoryParticlesBackground from "./HistoryParticlesBackground";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const RENAME_FAILED = "Couldn't rename this conversation. Please try again.";
const DELETE_FAILED = "Couldn't delete this conversation. Please try again.";

function ConversationRow({
  conversation,
  isRenaming,
  onStartRename,
  onCancelRename,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  isRenaming: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onRename: (title: string) => Promise<string | null>;
  onDelete: () => void;
}) {
  const titleId = `history-title-${conversation.id}`;

  if (isRenaming) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <RenameConversationForm
          initialTitle={conversation.title}
          onSave={onRename}
          onCancel={onCancelRename}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 rounded-lg border border-transparent pr-2 transition-colors duration-150 ease-out focus-within:border-border hover:border-border hover:bg-card">
      <Link
        href={`/generate?conversationId=${conversation.id}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-1 shrink-0 rounded-full bg-border transition-colors duration-150 ease-out group-hover:bg-primary"
          />
          <span
            id={titleId}
            className="min-w-0 truncate text-sm font-medium text-foreground"
          >
            {conversation.title}
          </span>
        </span>
        {/*
          The formatted string depends on the current time, not just
          `conversation.updatedAt` — a client/server render a few seconds
          apart can legitimately disagree ("2 minutes ago" vs "3 minutes
          ago"). That's expected here, not a real mismatch to fix, so it's
          suppressed rather than worked around the way app/generate's random
          example prompts are.
        */}
        <span
          suppressHydrationWarning
          className="shrink-0 text-xs text-muted-foreground"
        >
          {formatRelativeTime(conversation.updatedAt)}
        </span>
      </Link>
      <ConversationRowActions
        titleId={titleId}
        onRename={onStartRename}
        onDelete={onDelete}
      />
    </div>
  );
}

export default function HistoryClient({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const emptyDescriptionRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Seeded from the server render, then kept in sync locally after a
  // rename/delete — no refetch needed for changes this page made itself.
  const [items, setItems] = useState(conversations);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isEmpty = items.length === 0;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? items.filter((item) => item.title.toLowerCase().includes(normalizedQuery))
    : items;

  async function handleRename(id: string, title: string): Promise<string | null> {
    try {
      const result = await renameConversation(id, title);
      if (!result.ok) return result.error ?? RENAME_FAILED;
    } catch {
      return RENAME_FAILED;
    }
    const normalized = normalizeConversationTitle(title);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: normalized } : item)),
    );
    setRenamingId(null);
    setActionError(null);
    return null;
  }

  async function handleConfirmDelete(conversation: ConversationSummary) {
    setIsDeleting(true);
    setActionError(null);
    try {
      const result = await deleteConversation(conversation.id);
      if (!result.ok) {
        setActionError(DELETE_FAILED);
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== conversation.id));
      // Generate restores this tab's last-active conversation on its next
      // visit — don't point it at one that no longer exists.
      if (readActiveConversationId() === conversation.id) {
        writeActiveConversationId(null);
      }
    } catch {
      setActionError(DELETE_FAILED);
    } finally {
      setIsDeleting(false);
    }
  }

  // One-time cascading entrance: page title -> subtitle -> (empty-state
  // icon/heading/description/CTA, or the conversation list). Same short
  // fade + upward-move recipe as Home's hero and Generate's empty state,
  // with `clearProps` so GSAP's inline transforms don't linger and block
  // the CTA's/rows' CSS hover transforms afterward.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (!titleRef.current || !subtitleRef.current) return;

      const timeline = gsap.timeline({
        defaults: { ease: "power2.out", duration: 0.45, clearProps: "all" },
      });
      timeline
        .from(titleRef.current, { opacity: 0, y: 12 })
        .from(subtitleRef.current, { opacity: 0, y: 10 }, "-=0.3");

      if (
        isEmpty &&
        iconRef.current &&
        emptyHeadingRef.current &&
        emptyDescriptionRef.current &&
        ctaRef.current
      ) {
        timeline
          .from(iconRef.current, { opacity: 0, y: 14, scale: 0.94 }, "-=0.22")
          .from(emptyHeadingRef.current, { opacity: 0, y: 10 }, "-=0.26")
          .from(emptyDescriptionRef.current, { opacity: 0, y: 8 }, "-=0.28")
          .from(ctaRef.current, { opacity: 0, y: 8 }, "-=0.26");
      } else if (listRef.current) {
        timeline.from(
          listRef.current.children,
          { opacity: 0, y: 8, stagger: 0.04 },
          "-=0.22",
        );
      }
    },
    { scope: pageRef, dependencies: [isEmpty] },
  );

  return (
    <main
      ref={pageRef}
      className="relative flex flex-1 flex-col items-center px-6 py-16 pb-24 sm:py-20"
    >
      <HistoryParticlesBackground />

      <div className="flex w-full max-w-2xl flex-col items-center gap-2 text-center">
        <h1
          ref={titleRef}
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          History
        </h1>
        <p
          ref={subtitleRef}
          className="text-sm text-muted-foreground"
        >
          Your study sessions, all in one place.
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
          <div
            ref={iconRef}
            className="relative flex size-32 items-center justify-center"
          >
            {/*
              Small, static-position ambient glow behind the icon, reusing
              the same aurora-drift keyframes as the global atmosphere for a
              consistent (but much smaller/calmer) ambient treatment.
              Purely decorative.
            */}
            <div
              aria-hidden="true"
              className="aurora-blob absolute inset-0 rounded-full bg-primary/15 blur-2xl"
            />
            <div className="relative z-10 flex size-16 items-center justify-center rounded-xl border border-border bg-card text-foreground">
              <HistoryIcon aria-hidden="true" className="size-7" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <h2
              ref={emptyHeadingRef}
              className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              No study sessions yet
            </h2>
            <p
              ref={emptyDescriptionRef}
              className="max-w-sm text-sm text-muted-foreground"
            >
              Once you start studying with Lumora, your sessions will show up
              here so you can pick up where you left off.
            </p>
          </div>

          <div ref={ctaRef}>
            <Button
              asChild
              size="lg"
              className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
            >
              <Link href="/generate">Start studying</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex w-full max-w-2xl flex-col gap-3">
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="h-10 pl-9 text-sm"
            />
          </div>

          {actionError && (
            <p role="alert" className="text-xs text-destructive">
              {actionError}
            </p>
          )}

          {visibleItems.length === 0 ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              No conversations match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div
              ref={listRef}
              role="list"
              aria-label="Study sessions"
              className="flex flex-col gap-2"
            >
              {visibleItems.map((conversation) => (
                <div role="listitem" key={conversation.id}>
                  <ConversationRow
                    conversation={conversation}
                    isRenaming={renamingId === conversation.id}
                    onStartRename={() => {
                      setActionError(null);
                      setRenamingId(conversation.id);
                    }}
                    onCancelRename={() => setRenamingId(null)}
                    onRename={(title) => handleRename(conversation.id, title)}
                    onDelete={() => {
                      setActionError(null);
                      setPendingDelete(conversation);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this conversation?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" and everything in it — messages, quizzes, and saved scores — will be permanently deleted. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        confirmDisabled={isDeleting}
        onConfirm={() => {
          if (pendingDelete) void handleConfirmDelete(pendingDelete);
        }}
      />
    </main>
  );
}
