import { THEME_STORAGE_KEY } from "./theme";

// Runs synchronously in <head>, before <body> paints, so a returning
// visitor's stored preference (or their OS preference, for System) is
// already applied by the time anything renders — no flash-of-wrong-theme
// flip after the fact. Deliberately tiny and dependency-free (no import of
// theme.ts's other helpers at runtime): this has to be inlined as a raw
// string Next can put directly in the HTML, not bundled/hydrated JS.
// Exported (only) so the pre-hydration failure path can be exercised
// directly in tests — `new Function(THEME_INIT_SCRIPT)()` against a jsdom
// global — since jsdom doesn't execute a `<script>` injected via
// `dangerouslySetInnerHTML`.
export const THEME_INIT_SCRIPT = `(function () {
  var root = document.documentElement;
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var pref = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var resolved = pref === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref;
    if (resolved === "dark") { root.classList.add("dark"); } else { root.classList.add("light"); }
  } catch (e) {
    // localStorage.getItem threw (private browsing / storage disabled, most
    // commonly) — fall back to the OS preference so first paint still gets
    // a deterministic theme instead of neither class being applied. "light"
    // (not logged) is the last-resort default if matchMedia itself is
    // unavailable or also throws, matching getStoredThemePreference()'s own
    // "system" fallback resolving to light when there's no way to read the
    // OS preference.
    var resolvedFallback = "light";
    try {
      resolvedFallback = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e2) {}
    root.classList.add(resolvedFallback);
  }
})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
