// Purely decorative, ambient glow behind the hero. CSS-driven (no GSAP) so
// it costs nothing on the JS thread and keeps drifting smoothly regardless
// of React re-renders; `prefers-reduced-motion` is handled in globals.css.
export default function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="aurora-blob aurora-blob-a absolute top-[-14rem] left-[-8rem] h-[34rem] w-[34rem] rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-500/20" />
      <div className="aurora-blob aurora-blob-b absolute top-[-6rem] right-[-10rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/15" />
      <div className="aurora-blob aurora-blob-c absolute bottom-[-16rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl dark:bg-cyan-400/10" />
    </div>
  );
}
