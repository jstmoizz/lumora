import Link from "next/link";

const exercises = [
  {
    href: "/playground/disclosure",
    label: "Disclosure",
    description: "Expand/collapse pattern exercise.",
  },
  {
    href: "/playground/tabs",
    label: "Tabs",
    description: "Tabbed interface pattern exercise.",
  },
  {
    href: "/playground/modal",
    label: "Modal",
    description: "Dialog/modal pattern exercise.",
  },
];

export default function PlaygroundPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Playground
        </h1>
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-500">
          Isolated dev area for accessibility exercises. Not part of the
          production app.
        </p>
      </div>
      <ul className="flex w-full max-w-md flex-col gap-3">
        {exercises.map(({ href, label, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex flex-col gap-1 rounded-lg border border-zinc-300 px-4 py-3 text-left transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
            >
              <span className="text-sm font-semibold text-foreground">
                {label}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-500">
                {description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
