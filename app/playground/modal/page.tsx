"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "./Modal";

export default function ModalPlaygroundPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Modal
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        W3C APG Modal Dialog pattern example. Open the dialog, then try Tab,
        Shift+Tab, and Escape.
      </p>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      >
        Delete note
      </button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Delete note?">
        <p>
          This action can&apos;t be undone. The note and its summary will be
          permanently removed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:text-foreground dark:text-zinc-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </Modal>
      <Link
        href="/playground"
        className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        Back to playground
      </Link>
    </main>
  );
}
