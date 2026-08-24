import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Pacifico } from "next/font/google";
import AppFooter from "./components/AppFooter";
import ClickSpark from "./components/ClickSpark";
import GlobalDock from "./components/GlobalDock";
import HeaderAccount from "./components/HeaderAccount";
import LumoraMark from "./components/LumoraMark";
import ThemeListener from "./components/theme/ThemeListener";
import ThemeScript from "./components/theme/ThemeScript";
import { getServerUser } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Used exclusively for the "Lumora" wordmark (header logo, footer, and
// section headings that are just the brand name) via the `font-wordmark`
// Tailwind utility below — never for body copy. Every `font-wordmark` usage
// in the codebase renders the literal string "Lumora" (grepped to confirm),
// so `latin` is the only subset that will ever actually paint a glyph —
// the previous `cyrillic`/`vietnamese` subsets were preloaded on every
// route (this font is loaded from the root layout) for characters nothing
// in the app ever displays.
const pacifico = Pacifico({
  variable: "--font-pacifico",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Lumora",
  description: "Turn Notes into Knowledge",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Runs on every request (the whole app renders under this layout), so
  // this is the one place the nav's auth-state needs it fetched. Middleware
  // separately calls `getUser()` too, for the redirect decision — some
  // duplication between the two is the standard, documented pattern for
  // Supabase + Next.js App Router, not an oversight.
  const user = await getServerUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pacifico.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Must run before <body> paints — see ThemeScript's own comment.
          suppressHydrationWarning above covers the `class` attribute this
          adds to <html> before React ever gets to it.
        */}
        <ThemeScript />
      </head>
      <body className="flex h-full flex-col">
        <ThemeListener />
        {/*
          ClickSpark renders no DOM wrapper of its own (a fixed, viewport-
          sized canvas as a Fragment sibling of children — see its own file
          comment) — this "wraps" the header/main/footer/Dock in the sense
          of making clicks anywhere produce the effect, without introducing
          a stacking-context, z-index, or scrolling risk to any of them.
        */}
        <ClickSpark>
          {/*
            Single row at every width now — the old `flex-col sm:flex-row`
            split existed to let the nav-links block wrap onto its own line
            on narrow screens; with those links gone (GlobalDock is the
            primary nav now, rendered below), the wordmark and account
            controls comfortably share one row at any viewport width.
          */}
          <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4">
              <Link
                href="/"
                className="lumora-brand flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
              >
                <LumoraMark className="size-6" />
                <span className="lumora-wordmark-accent font-wordmark text-xl">
                  Lumora
                </span>
              </Link>
              <HeaderAccount userEmail={user?.email ?? null} />
            </div>
          </header>
          {children}
          <AppFooter />
          <GlobalDock />
        </ClickSpark>
      </body>
    </html>
  );
}
