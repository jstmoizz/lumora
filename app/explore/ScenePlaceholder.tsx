// Shown while capability detection is still pending on mount, and reused as
// next/dynamic's `loading` state while the Scene chunk downloads — same
// calm placeholder either way, no spinner.
export default function ScenePlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center bg-[#08070c]"
    >
      <div className="motion-safe:animate-pulse size-2 rounded-full bg-indigo-400/40" />
    </div>
  );
}
