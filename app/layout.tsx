import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "./components/NavBar";
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
    >
      <body className="h-full flex flex-col">
        <header className="flex flex-col items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 sm:flex-row dark:border-zinc-800">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Lumora
          </Link>
          <NavBar userEmail={user?.email ?? null} />
        </header>
        {children}
        <footer className="flex items-center justify-center border-t border-zinc-200 px-6 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
          &copy; {new Date().getFullYear()} Lumora
        </footer>
      </body>
    </html>
  );
}
