import { THEME_STORAGE_KEY } from "./theme";

// Runs synchronously in <head>, before <body> paints, so a returning
// visitor's stored (or OS) theme preference is applied before anything
// renders — no flash-of-wrong-theme. Deliberately tiny and dependency-free:
// this has to be inlined as a raw string, not bundled/hydrated JS. Exported
// so the pre-hydration failure path can be tested directly (`new
// Function(THEME_INIT_SCRIPT)()`), since jsdom doesn't execute a
// dangerouslySetInnerHTML script.
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
    // localStorage threw (private browsing) — fall back to OS preference.
    // "light" is the last resort if matchMedia is also unavailable.
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
