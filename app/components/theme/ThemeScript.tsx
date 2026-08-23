import { THEME_STORAGE_KEY } from "./theme";

// Runs synchronously in <head>, before <body> paints, so a returning
// visitor's stored preference (or their OS preference, for System) is
// already applied by the time anything renders — no flash-of-wrong-theme
// flip after the fact. Deliberately tiny and dependency-free (no import of
// theme.ts's other helpers at runtime): this has to be inlined as a raw
// string Next can put directly in the HTML, not bundled/hydrated JS.
const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var pref = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var resolved = pref === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref;
    var root = document.documentElement;
    if (resolved === "dark") { root.classList.add("dark"); } else { root.classList.add("light"); }
  } catch (e) {}
})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
