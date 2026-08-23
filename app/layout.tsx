import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "./components/NavBar";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-4 sm:flex-row">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
              Lumora
            </Link>
            <NavBar userEmail={user?.email ?? null} />
          </div>
        </header>
        {children}
        <footer className="border-t border-border/60 px-6 py-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Lumora
        </footer>
      </body>
    </html>
  );
}
