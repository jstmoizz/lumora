const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

// "2 hours ago", "Yesterday", etc. via the built-in Intl formatter. Shared
// by History's conversation list and Generate's Recent Chats panel — both
// render the same `ConversationSummary.updatedAt` shape. The result depends
// on the current time, not just `iso`, so callers that render this during
// hydration need `suppressHydrationWarning` on the element (see
// HistoryClient.tsx) rather than trying to make it deterministic.
export function formatRelativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  for (const [unit, unitMs] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffMs) >= unitMs) {
      return relativeTimeFormatter.format(Math.round(diffMs / unitMs), unit);
    }
  }
  return relativeTimeFormatter.format(0, "minute");
}
