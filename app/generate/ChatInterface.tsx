"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  PaperclipIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAIErrorCopy, isAIErrorCode, type AIErrorContext } from "@/lib/ai/errors";
import {
  ALLOWED_IMAGE_MEDIA_TYPES,
  CHAT_MODES,
  DEFAULT_CHAT_MODE,
  MAX_IMAGE_BYTES,
  type ChatMode,
} from "@/lib/ai/model";
import type {
  CreateFlashcardsOutput,
  CreateQuizOutput,
  LumoraUIMessage,
} from "@/lib/ai/tools";
import { ExtractionCard } from "./ExtractionCard";
import { AddKnowledgeTopicToolPart, FlashcardsToolPart, QuizToolPart } from "./PracticeToolPart";

// A single attached image, held only in this component's state — never
// uploaded until the message is sent, never persisted server-side.
interface ImageAttachment {
  mediaType: string;
  filename: string;
  dataUrl: string;
}

function validateImageFile(file: File): { ok: true } | { ok: false; message: string } {
  if (!ALLOWED_IMAGE_MEDIA_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MEDIA_TYPES)[number])) {
    return { ok: false, message: "Images must be JPEG, PNG, or WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "Image must be 3MB or smaller." };
  }
  return { ok: true };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// How close to either edge (px) counts as "at that edge" — a small
// tolerance so sub-pixel scroll positions don't falsely look "scrolled".
const NEAR_EDGE_THRESHOLD_PX = 64;

// Curated pool of study-related suggestions for the empty state. A random
// subset is picked per page mount (see pickRandomPrompts below); clicking
// one sends it via the same path as the composer.
const EXAMPLE_PROMPT_POOL = [
  "Explain photosynthesis",
  "Quiz me on data structures",
  "Explain binary search",
  "Quiz me on world history",
  "Help me understand Newton's laws of motion",
  "Explain how neural networks work",
  "Quiz me on the periodic table",
  "Break down Big-O notation for me",
  "Explain the water cycle",
  "Quiz me on grammar rules",
  "Help me understand supply and demand",
  "Explain recursion like I'm a beginner",
  "Quiz me on the solar system",
] as const;

const VISIBLE_EXAMPLE_COUNT = 3;

// Fisher-Yates shuffle + slice: picks `count` distinct prompts from `pool`
// with no duplicates, in random order.
function pickRandomPrompts(
  pool: readonly string[],
  count: number,
): string[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// Deterministic fallback for the pre-hydration snapshot, so the first
// client render matches the server's markup (Math.random() would otherwise
// cause a hydration mismatch).
const SERVER_EXAMPLE_PROMPTS = EXAMPLE_PROMPT_POOL.slice(
  0,
  VISIBLE_EXAMPLE_COUNT,
);
function getServerExamplePrompts(): string[] {
  return SERVER_EXAMPLE_PROMPTS;
}

// useSyncExternalStore requires a subscribe function even when the
// snapshot is only ever read once.
function subscribeToNothing() {
  return () => {};
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A network failure (fetch never reached the server) gets its own copy
// first. Otherwise `error.message` is checked against our known-safe
// AIErrorCode strings — the only thing the route's onError ever returns, so
// this can't accidentally match a raw provider error. Anything else falls
// back to the generic "GENERATION_FAILED" copy; `error.message` is never
// rendered directly.
function getChatErrorCopy(error: Error | undefined, context: AIErrorContext) {
  const isNetworkError =
    error instanceof TypeError && /fetch|network/i.test(error.message);
  if (isNetworkError) {
    return {
      title: "Couldn't reach Lumora",
      description: "Check your connection, then retry.",
    };
  }

  const code = error && isAIErrorCode(error.message) ? error.message : "GENERATION_FAILED";
  return getAIErrorCopy(code, context);
}

// What the current pending turn is doing, purely for loading copy — never
// for routing (the server remains the sole authority on model choice).
// `null` is an ordinary text turn ("Thinking…").
type PendingIntent = "image" | "quiz" | "flashcards" | null;

function pendingStatusText(intent: PendingIntent): string {
  switch (intent) {
    case "image":
      return "Understanding your image…";
    case "quiz":
      return "Creating your quiz…";
    case "flashcards":
      return "Creating your flashcards…";
    default:
      return "Thinking…";
  }
}

function ChatErrorCard({
  error,
  context,
  retrying,
  onRetry,
}: {
  error: Error | undefined;
  // Image extraction vs. normal chat/tool-generation, so recovery copy fits.
  context: AIErrorContext;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { title, description } = getChatErrorCopy(error, context);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      {/* role="alert" announces this card the moment it mounts mid-conversation. */}
      <div role="alert" className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="w-fit gap-1.5 rounded-xl transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] disabled:hover:translate-y-0 disabled:hover:scale-100"
      >
        <RotateCcwIcon
          aria-hidden="true"
          className={cn("size-3.5", retrying && "motion-safe:animate-spin")}
        />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}

// Mode picker for the composer. "Fast" is disabled while an image is
// attached, since fast mode doesn't support images.
function ModeSelector({
  mode,
  onModeChange,
  fastDisabled,
  disabled,
}: {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  fastDisabled: boolean;
  disabled: boolean;
}) {
  function handleSelect(next: string) {
    if (next === mode) return;
    if (next === "fast" && fastDisabled) return;
    onModeChange(next as ChatMode);
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`Mode: ${CHAT_MODES[mode].label}. Change mode.`}
          className="h-11 shrink-0 gap-1 rounded-xl px-3 text-xs font-semibold"
        >
          {CHAT_MODES[mode].label}
          <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Content
        align="start"
        sideOffset={6}
        className="z-50 min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
      >
        <DropdownMenuPrimitive.RadioGroup value={mode} onValueChange={handleSelect}>
          {(Object.keys(CHAT_MODES) as ChatMode[]).map((option) => (
            <DropdownMenuPrimitive.RadioItem
              key={option}
              value={option}
              disabled={option === "fast" && fastDisabled}
              className="flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <span className="flex-1 font-medium">{CHAT_MODES[option].label}</span>
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
              <span className="text-xs text-muted-foreground">
                {CHAT_MODES[option].description}
              </span>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuPrimitive.RadioGroup>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Root>
  );
}

export default function ChatInterface({
  initialConversationId,
  initialMessages,
  initialTopic,
  onConversationIdKnown,
  onTurnSettled,
  onQuizGenerated,
  onFlashcardsGenerated,
}: {
  /** Set when arriving from History via /generate?conversationId=... */
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
  /** Set when arriving from Explore's "Study Topic" link — prefills the
   * composer rather than auto-sending. */
  initialTopic?: string;
  /** Fired the moment conversationId becomes known, so GenerateWorkspace
   * can keep the URL and Recent Chats in sync. */
  onConversationIdKnown?: (id: string) => void;
  /** Fired whenever a turn finishes, so GenerateWorkspace can refresh
   * Recent Chats. */
  onTurnSettled?: () => void;
  /** Fired once per quiz when its tool call reaches output-available, for
   * Resources' Quizzes tab. */
  onQuizGenerated?: (quiz: CreateQuizOutput) => void;
  /** Same as onQuizGenerated, for createFlashcards and the Flashcards tab. */
  onFlashcardsGenerated?: (flashcards: CreateFlashcardsOutput) => void;
}) {
  const [input, setInput] = useState(() =>
    initialTopic ? `Teach me about ${initialTopic}` : "",
  );
  const [mode, setMode] = useState<ChatMode>(DEFAULT_CHAT_MODE);
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // Set right before each send that should show non-generic loading copy.
  // handleRetry never touches this, since it's re-attempting the same turn.
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, regenerate, status, stop, error } =
    useChat<LumoraUIMessage>({
      messages: initialMessages,
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

  // Known immediately when resuming from History, or learned mid-stream
  // once the server creates a conversation and reports it via message
  // metadata. Never chosen client-side.
  const conversationId =
    initialConversationId ??
    messages.find((message) => message.metadata?.conversationId)?.metadata
      ?.conversationId;

  // The single choke point every send path routes through. `modeOverride`
  // exists for ExtractionCard's Create Quiz/Flashcards actions, which must
  // always land on GPT-OSS regardless of the composer's current mode — if
  // the user were still on "Vision," reusing it here would route the
  // follow-up back to Qwen instead.
  function sendChatMessage(message: { text: string }, options: { modeOverride?: ChatMode } = {}) {
    const effectiveMode = options.modeOverride ?? mode;
    const body = conversationId ? { conversationId, mode: effectiveMode } : { mode: effectiveMode };
    if (!imageAttachment) {
      return sendMessage(message, { body });
    }
    return sendMessage(
      {
        ...message,
        files: [
          {
            type: "file" as const,
            mediaType: imageAttachment.mediaType,
            filename: imageAttachment.filename,
            url: imageAttachment.dataUrl,
          },
        ],
      },
      { body },
    );
  }

  useEffect(() => {
    if (conversationId) onConversationIdKnown?.(conversationId);
  }, [conversationId, onConversationIdKnown]);

  // Compares against the previous status, not just `status === "ready"`,
  // to catch real transitions rather than every re-render while idle.
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    const wasActive = previousStatus === "submitted" || previousStatus === "streaming";
    if (wasActive && status !== previousStatus) {
      onTurnSettled?.();
    }
  }, [status, onTurnSettled]);

  // Notifies once per quiz. Scans every message, not just the latest,
  // since a resumed conversation can already contain a finished quiz.
  const seenQuizIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onQuizGenerated) return;
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "tool-createQuiz" || part.state !== "output-available") {
          continue;
        }
        if (seenQuizIdsRef.current.has(part.output.quizId)) continue;
        seenQuizIdsRef.current.add(part.output.quizId);
        onQuizGenerated(part.output);
      }
    }
  }, [messages, onQuizGenerated]);

  // Same notify-once mechanism, for tool-createFlashcards parts.
  const seenFlashcardSetIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onFlashcardsGenerated) return;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type !== "tool-createFlashcards" ||
          part.state !== "output-available"
        ) {
          continue;
        }
        if (seenFlashcardSetIdsRef.current.has(part.output.flashcardSetId)) {
          continue;
        }
        seenFlashcardSetIdsRef.current.add(part.output.flashcardSetId);
        onFlashcardsGenerated(part.output);
      }
    }
  }, [messages, onFlashcardsGenerated]);

  // Randomized once per mount, cached in the ref. useSyncExternalStore's
  // server snapshot keeps this hydration-safe: the deterministic server
  // value renders first, then swaps to the real random one — Math.random()
  // never runs during render itself.
  const randomExamplePromptsRef = useRef<string[] | null>(null);
  const examplePrompts = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (randomExamplePromptsRef.current === null) {
        randomExamplePromptsRef.current = pickRandomPrompts(
          EXAMPLE_PROMPT_POOL,
          VISIBLE_EXAMPLE_COUNT,
        );
      }
      return randomExamplePromptsRef.current;
    },
    getServerExamplePrompts,
  );

  const isGenerating = status === "submitted" || status === "streaming";
  const canSend =
    (input.trim().length > 0 || imageAttachment !== null) && status === "ready";
  const isEmpty = messages.length === 0;
  const hasError = status === "error";

  // A ref, not just state, so the guard is effective the instant a second
  // click happens — state updates land too late to stop a synchronous
  // double-click from firing regenerate() twice.
  const isRetryingRef = useRef(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Same principle for the composer's submit path: canSend is derived from
  // status, so two synchronous submissions could both read it as true.
  const isSubmittingRef = useRef(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Mirrors "is the user near the bottom" without triggering a re-render;
  // only near/away transitions touch state, via showJumpToLatest below.
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // Symmetric, for the top edge — drives only the "Go to top" button.
  const isNearTopRef = useRef(true);
  const [showGoToTop, setShowGoToTop] = useState(false);

  // Refs targeted by the empty-state entrance animation below.
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const emptyDescriptionRef = useRef<HTMLParagraphElement>(null);
  const emptyExamplesRef = useRef<HTMLDivElement>(null);
  const emptyComposerRef = useRef<HTMLDivElement>(null);

  const jumpButtonWrapperRef = useRef<HTMLDivElement>(null);
  const goToTopButtonWrapperRef = useRef<HTMLDivElement>(null);

  // Message ids already animated in, so it never re-triggers while
  // streaming.
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());

  function isScrolledNearBottom() {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= NEAR_EDGE_THRESHOLD_PX;
  }

  function isScrolledNearTop() {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollTop <= NEAR_EDGE_THRESHOLD_PX;
  }

  function scrollToBottom(behavior: ScrollBehavior) {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  function scrollToTop(behavior: ScrollBehavior) {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior });
  }

  // A conversation resumed with existing history starts at the top rather
  // than jumping to the latest message. "Go to latest" is how the user
  // reaches the bottom.
  const hasAppliedInitialScrollRef = useRef(false);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || hasAppliedInitialScrollRef.current) return;
    if (!initialMessages || initialMessages.length === 0) return;
    hasAppliedInitialScrollRef.current = true;
    el.scrollTop = 0;
    const nearBottom = isScrolledNearBottom();
    isNearBottomRef.current = nearBottom;
    isNearTopRef.current = true;
    // Reflects the real post-mutation scroll position — can only be
    // measured once scrollTop above has actually been applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowJumpToLatest(!nearBottom);
    // We just forced scrollTop to 0, so this is always at the top.
    setShowGoToTop(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, the first time the scroll container exists; only `isEmpty` flipping to false makes that happen.
  }, [isEmpty]);

  // Shared by the scroll listener (user scrolling) and the auto-follow
  // effect (programmatic scrolling), so both keep the edge buttons correct.
  function updateScrollEdgeState() {
    const nearBottom = isScrolledNearBottom();
    if (nearBottom !== isNearBottomRef.current) {
      isNearBottomRef.current = nearBottom;
      setShowJumpToLatest(!nearBottom);
    }
    const nearTop = isScrolledNearTop();
    if (nearTop !== isNearTopRef.current) {
      isNearTopRef.current = nearTop;
      setShowGoToTop(!nearTop);
    }
  }

  // Passive, and only updates state on an actual near/away transition, so
  // this doesn't re-render on every pixel scrolled.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateScrollEdgeState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollEdgeState);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateScrollEdgeState is recreated every render; only isEmpty (the container mounting) should re-attach the listener.
  }, [isEmpty]);

  // Auto-follows new content, but only while not scrolled away from the
  // bottom. Instant, not smooth — this can fire once per token, and smooth
  // is reserved for the explicit "Go to latest" action.
  useEffect(() => {
    if (isNearBottomRef.current) scrollToBottom("auto");
    // Content growth never fires a native scroll event on its own, so this
    // catches the top scrolling out of view as it grows.
    updateScrollEdgeState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateScrollEdgeState is recreated every render; only new message content should re-run this.
  }, [messages]);

  // One-time cascading entrance for the empty state — there's no "clear
  // chat" affordance, so this only ever runs once on mount.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !emptyHeadingRef.current ||
        !emptyDescriptionRef.current ||
        !emptyComposerRef.current
      ) {
        return;
      }

      const prompts = emptyExamplesRef.current
        ? Array.from(emptyExamplesRef.current.children)
        : [];

      gsap
        .timeline({ defaults: { ease: "power2.out", duration: 0.35 } })
        .from(emptyHeadingRef.current, { opacity: 0, y: 14 })
        .from(emptyDescriptionRef.current, { opacity: 0, y: 10 }, "-=0.22")
        .from(prompts, { opacity: 0, y: 8, stagger: 0.06 }, "-=0.18")
        .from(emptyComposerRef.current, { opacity: 0, y: 10 }, "-=0.15");
    },
    { scope: emptyStateRef, dependencies: [] },
  );

  // Fade + scale in whenever the Jump-to-latest badge appears. No exit
  // animation — instant disappearance is fine here.
  useGSAP(
    () => {
      if (
        !showJumpToLatest ||
        prefersReducedMotion() ||
        !jumpButtonWrapperRef.current
      ) {
        return;
      }
      gsap.fromTo(
        jumpButtonWrapperRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" },
      );
    },
    { dependencies: [showJumpToLatest] },
  );

  // Same fade + scale-in, for "Go to top".
  useGSAP(
    () => {
      if (
        !showGoToTop ||
        prefersReducedMotion() ||
        !goToTopButtonWrapperRef.current
      ) {
        return;
      }
      gsap.fromTo(
        goToTopButtonWrapperRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" },
      );
    },
    { dependencies: [showGoToTop] },
  );

  // Animates a message row in only the first time it's introduced.
  // messages.length stays constant while an existing message's text
  // streams in, so this doesn't fire on every token.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const latest = messages[messages.length - 1];
      if (!latest || animatedMessageIdsRef.current.has(latest.id)) return;
      animatedMessageIdsRef.current.add(latest.id);

      const el = scrollContainerRef.current?.querySelector(
        `[data-message-id="${latest.id}"]`,
      );
      if (!el) return;

      const isUser = latest.role === "user";
      gsap.from(el, {
        opacity: 0,
        x: isUser ? 16 : 0,
        y: isUser ? 0 : 8,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    { dependencies: [messages.length] },
  );

  function handleJumpToLatest() {
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    scrollToBottom(prefersReducedMotion() ? "auto" : "smooth");
  }

  function handleGoToTop() {
    isNearTopRef.current = true;
    setShowGoToTop(false);
    scrollToTop(prefersReducedMotion() ? "auto" : "smooth");
  }

  // Released in `finally` so a failure never leaves the composer stuck.
  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (isSubmittingRef.current) return;
    if (!canSend) return;

    isSubmittingRef.current = true;
    const text = input;
    setPendingIntent(imageAttachment ? "image" : null);
    setInput("");
    setImageAttachment(null);
    setImageError(null);
    try {
      await sendChatMessage({ text });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  // Input reset immediately after reading, so selecting the same file
  // again still fires onChange.
  async function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.ok) {
      setImageError(validation.message);
      return;
    }

    setImageError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageAttachment({ mediaType: file.type, filename: file.name, dataUrl });
    } catch {
      setImageError("Couldn't read that image. Try again.");
    }
  }

  function handleRemoveImage() {
    setImageAttachment(null);
    setImageError(null);
  }

  // Kept short rather than re-dumping the full extraction, which is
  // already in history via the extraction turn's own hidden text part.
  function extractionActionText(title: string | null, kind: "quiz" | "flashcards"): string {
    const subject = title?.trim() || "the image I shared";
    return kind === "quiz"
      ? `Create a quiz based on ${subject}.`
      : `Create flashcards based on ${subject}.`;
  }

  // `modeOverride: "auto"`, not the composer's current mode, is what keeps
  // this on the GPT-OSS path — see sendChatMessage's own comment.
  async function handleExtractionAction(title: string | null, kind: "quiz" | "flashcards") {
    if (isSubmittingRef.current || status !== "ready") return;
    isSubmittingRef.current = true;
    setPendingIntent(kind);
    try {
      await sendChatMessage(
        { text: extractionActionText(title, kind) },
        { modeOverride: "auto" },
      );
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // Moves focus to the composer rather than sending anything automatically.
  function handleAskAboutThis() {
    composerTextareaRef.current?.focus();
  }

  // Same race as handleSubmit, reusing the same ref since both paths
  // funnel through sendChatMessage.
  async function handleExampleClick(prompt: string) {
    if (isSubmittingRef.current) return;
    if (status !== "ready") return;

    isSubmittingRef.current = true;
    setPendingIntent(null);
    try {
      await sendChatMessage({ text: prompt });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // Drops the failed assistant message and resends via the SDK's own
  // regenerate. A quiz/flashcards handoff retry must force mode: "auto" the
  // same way its original send did — the composer's mode state was never
  // changed by that override, so retrying with the raw (possibly "vision")
  // value would resend the handoff to Qwen instead of GPT-OSS, burning
  // quota on a request meant for GPT-OSS. An image-extraction retry is the
  // opposite: it must keep the current mode, since that's what routes the
  // resent image back to Qwen.
  async function handleRetry() {
    if (isRetryingRef.current || status !== "error") return;
    isRetryingRef.current = true;
    setIsRetrying(true);
    try {
      const effectiveMode: ChatMode =
        pendingIntent === "quiz" || pendingIntent === "flashcards" ? "auto" : mode;
      await (conversationId
        ? regenerate({ body: { conversationId, mode: effectiveMode } })
        : regenerate({ body: { mode: effectiveMode } }));
    } finally {
      isRetryingRef.current = false;
      setIsRetrying(false);
    }
  }

  // No assistant message exists yet for this turn. Once it does, the
  // per-message "pending" branch below takes over with the same text.
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistantMessage =
    status === "submitted" && (!lastMessage || lastMessage.role === "user");
  // A failure before any assistant content appeared — no message exists to
  // attach an inline error to, so it renders as its own row.
  const erroredBeforeAssistantMessage =
    hasError && (!lastMessage || lastMessage.role === "user");
  const errorContext: AIErrorContext = pendingIntent === "image" ? "extraction" : "generation";

  const composer = (
    <div className="flex w-full flex-col gap-2">
      {imageAttachment && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL preview of a not-yet-sent, never-uploaded attachment; next/image has no use here. */}
          <img
            src={imageAttachment.dataUrl}
            alt=""
            className="size-12 shrink-0 rounded-lg object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs text-muted-foreground">
              {imageAttachment.filename}
            </span>
            {/* Auto and Vision both handle an attached image the same way; Fast is simply unavailable. */}
            <span className="truncate text-[11px] text-muted-foreground/70">
              Image attached · Vision processing
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove image"
            onClick={handleRemoveImage}
            className="shrink-0 rounded-lg"
          >
            <XIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      )}
      {imageError && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {imageError}
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-[var(--generate-accent)] focus-within:shadow-md focus-within:ring-2 focus-within:ring-[var(--generate-accent-ring)]"
      >
        <ModeSelector
          mode={mode}
          onModeChange={setMode}
          fastDisabled={imageAttachment !== null}
          disabled={isGenerating}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept={ALLOWED_IMAGE_MEDIA_TYPES.join(",")}
          onChange={handleImageFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={isGenerating || mode === "fast"}
          aria-label="Attach image"
          onClick={() => imageInputRef.current?.click()}
          className="h-11 w-11 shrink-0 rounded-xl"
        >
          <PaperclipIcon aria-hidden="true" className="size-4" />
        </Button>
        <textarea
          ref={composerTextareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          placeholder="Ask anything..."
          rows={1}
          aria-label="Message"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        {isGenerating ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => stop()}
            className="h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
          >
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!canSend}
            className="h-11 shrink-0 rounded-xl bg-[var(--generate-accent-solid)] px-5 text-sm font-semibold text-[var(--generate-accent-foreground)] transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[var(--generate-accent-solid)] hover:opacity-90"
          >
            Send
          </Button>
        )}
      </form>
    </div>
  );

  return (
    <div className="flex w-full min-h-0 max-w-2xl flex-1 flex-col gap-4">
      {isEmpty ? (
        <div
          ref={emptyStateRef}
          className="flex flex-1 flex-col items-center justify-center gap-8 px-2 py-6 text-center"
        >
          <div className="flex flex-col items-center gap-2">
            <h2
              ref={emptyHeadingRef}
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              What are you studying today?
            </h2>
            <p
              ref={emptyDescriptionRef}
              className="max-w-sm text-sm text-muted-foreground"
            >
              Ask a question, work through a concept, or try one of these to
              get started.
            </p>
          </div>

          {/* DOM order puts the composer before the prompts so Tab reaches it first; order-last keeps it visually below. */}
          <div ref={emptyComposerRef} className="order-last w-full">
            {composer}
          </div>

          <div
            ref={emptyExamplesRef}
            role="group"
            aria-label="Example prompts"
            className="flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            {examplePrompts.map((prompt, index) => (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="sm"
                disabled={status !== "ready"}
                onClick={() => handleExampleClick(prompt)}
                className="rounded-full border-border font-normal text-muted-foreground transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            {/* justify-end lives on the inner wrapper, not here — justify-content on the overflow:auto element causes scroll-position quirks. */}
            <div
              ref={scrollContainerRef}
              className="chat-scrollbar h-full overflow-y-auto"
            >
              <div className="flex min-h-full flex-col justify-end gap-6 py-4">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const text = message.parts
                    .filter(isTextUIPart)
                    .map((part) => part.text)
                    .join("");
                  const isLastMessage = index === messages.length - 1;
                  // A tool part counts even mid-input-streaming, since
                  // QuizToolPart renders its own "preparing" state.
                  const hasRenderableContent = message.parts.some(
                    (part) =>
                      (part.type === "text" && part.text.length > 0) ||
                      part.type === "tool-createQuiz" ||
                      part.type === "tool-createFlashcards" ||
                      part.type === "tool-addKnowledgeTopic" ||
                      part.type === "data-extraction",
                  );
                  // A data-extraction message also carries a hidden
                  // sibling text part (history for a later GPT-OSS turn);
                  // the ExtractionCard is the entire visible rendering.
                  const hasExtraction = message.parts.some(
                    (part) => part.type === "data-extraction",
                  );
                  const isPending =
                    !isUser &&
                    isLastMessage &&
                    !hasRenderableContent &&
                    isGenerating;
                  // The message the failed turn was streaming into — render
                  // whatever it produced, then the error card, instead of a
                  // "Thinking..." indicator that will never resolve.
                  const isErroredMessage = !isUser && isLastMessage && hasError;

                  return (
                    <div
                      key={message.id}
                      data-message-id={message.id}
                      className={cn(
                        "min-w-0",
                        isUser ? "flex justify-end" : "flex justify-start",
                      )}
                    >
                      {isUser ? (
                        <div className="min-w-0 max-w-[85%] rounded-2xl bg-[var(--generate-accent-solid)] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-[var(--generate-accent-foreground)] sm:max-w-[75%]">
                          {text}
                        </div>
                      ) : (
                        <div className="min-w-0 w-full text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
                          {isPending ? (
                            <span
                              role="status"
                              className="text-muted-foreground motion-safe:animate-pulse"
                            >
                              {pendingStatusText(pendingIntent)}
                            </span>
                          ) : (
                            // Walk parts in the order the model produced them.
                            <div className="flex flex-col gap-3">
                              {message.parts.map((part, partIndex) => {
                                if (part.type === "text") {
                                  if (hasExtraction || !part.text) return null;
                                  return (
                                    <Streamdown key={partIndex}>
                                      {part.text}
                                    </Streamdown>
                                  );
                                }
                                if (part.type === "data-extraction") {
                                  return (
                                    <ExtractionCard
                                      key={partIndex}
                                      extraction={part.data}
                                      disabled={isGenerating}
                                      onCreateQuiz={() =>
                                        handleExtractionAction(part.data.title, "quiz")
                                      }
                                      onCreateFlashcards={() =>
                                        handleExtractionAction(part.data.title, "flashcards")
                                      }
                                      onAskAboutThis={handleAskAboutThis}
                                    />
                                  );
                                }
                                if (part.type === "tool-createQuiz") {
                                  return (
                                    <QuizToolPart
                                      key={part.toolCallId}
                                      part={part}
                                    />
                                  );
                                }
                                if (part.type === "tool-createFlashcards") {
                                  return (
                                    <FlashcardsToolPart
                                      key={part.toolCallId}
                                      part={part}
                                    />
                                  );
                                }
                                if (part.type === "tool-addKnowledgeTopic") {
                                  return (
                                    <AddKnowledgeTopicToolPart
                                      key={part.toolCallId}
                                      part={part}
                                    />
                                  );
                                }
                                return null;
                              })}
                              {isErroredMessage && (
                                <ChatErrorCard
                                  error={error}
                                  context={errorContext}
                                  retrying={isRetrying}
                                  onRetry={handleRetry}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {awaitingAssistantMessage && (
                  <div className="flex justify-start">
                    <span
                      role="status"
                      className="text-[15px] text-muted-foreground motion-safe:animate-pulse"
                    >
                      {pendingStatusText(pendingIntent)}
                    </span>
                  </div>
                )}

                {erroredBeforeAssistantMessage && (
                  <div className="flex justify-start">
                    <div className="w-full max-w-sm">
                      <ChatErrorCard
                        error={error}
                        context={errorContext}
                        retrying={isRetrying}
                        onRetry={handleRetry}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {showGoToTop && (
              <div
                ref={goToTopButtonWrapperRef}
                className="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGoToTop}
                  className="pointer-events-auto gap-1 rounded-full border border-border shadow-md transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
                >
                  <ArrowUpIcon aria-hidden="true" className="size-3.5" />
                  Go to top
                </Button>
              </div>
            )}

            {showJumpToLatest && (
              <div
                ref={jumpButtonWrapperRef}
                className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleJumpToLatest}
                  className="pointer-events-auto gap-1 rounded-full border border-border shadow-md transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
                >
                  <ArrowDownIcon aria-hidden="true" className="size-3.5" />
                  Go to latest
                </Button>
              </div>
            )}
          </div>

          {composer}
        </>
      )}
    </div>
  );
}
