import Link from "next/link";
import Disclosure from "./Disclosure";

export default function DisclosurePlaygroundPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Disclosure
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        W3C APG Disclosure pattern example. Click the trigger, or focus it
        and press Enter or Space.
      </p>
      <Disclosure label="What is Lumora?">
        Lumora turns notes into knowledge. This content is only present in
        the DOM while the disclosure is expanded.
      </Disclosure>
      <Link
        href="/playground"
        className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        Back to playground
      </Link>
    </main>
  );
}
