"use client";

import { useEffect } from "react";

// Per Next's error.js contract, `app/error.tsx` (and every nested
// error.tsx) wraps everything EXCEPT the root layout.tsx in the same
// segment — an error thrown inside the root layout itself (e.g. its own
// `await getServerUser()` call, which every single route depends on)
// bubbles past all of those and is only ever caught here. Without this
// file, that failure falls through to Next's bare built-in error page —
// unbranded, with no recovery action — for every route in the app at once.
//
// Deliberately self-contained: no import of globals.css, ThemeScript,
// GSAP, or any shared component. Per Next's own docs, global-error renders
// its own bare `<html>`/`<body>` outside the root layout, so none of the
// app's usual CSS/theme pipeline is guaranteed to be available here anyway
// — and this is specifically the one fallback that must keep working when
// something elsewhere in the app has already broken, so it intentionally
// depends on nothing that could itself fail. Colors are inlined; dark mode
// follows the OS preference via a plain CSS media query (no localStorage
// read, unlike ThemeScript) since Next's own docs call this out as the
// expected default for global-error specifically.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged for local diagnosis only — never rendered, so nothing about
    // the underlying failure (message, stack, digest) reaches the user.
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#ffffff",
          color: "#18181b",
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #0b0a10 !important; color: #f4f4f5 !important; }
            .lumora-global-error-card { background: #16151d !important; border-color: #2b2a35 !important; }
            .lumora-global-error-desc { color: #a1a1aa !important; }
            .lumora-global-error-btn { background: #4f46e5 !important; color: #ffffff !important; }
          }
        `}</style>
        <div
          className="lumora-global-error-card"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
            width: "100%",
            maxWidth: "24rem",
            textAlign: "center",
            padding: "1.5rem",
            borderRadius: "0.75rem",
            border: "1px solid #e4e4e7",
            background: "#fafafa",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.5rem",
              background: "rgba(220, 38, 38, 0.1)",
              color: "#dc2626",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          {/*
            `role="alert"` announces this the moment it mounts, same
            reasoning as app/error.tsx's own equivalent.
          */}
          <div role="alert">
            <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p
              className="lumora-global-error-desc"
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.875rem",
                color: "#71717a",
              }}
            >
              Lumora couldn&apos;t load. Try again, or refresh the page if it
              keeps happening.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="lumora-global-error-btn"
            style={{
              marginTop: "0.25rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.75rem",
              border: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              background: "#4338ca",
              color: "#ffffff",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
