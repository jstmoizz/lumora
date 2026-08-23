# Lumora "Living Aurora" shader

The Home hero's background is a custom GLSL fragment shader — Phase 4.4's
static CSS Aurora (`AuroraBackground.tsx`) evolved into an animated,
GPU-driven light field, using the same indigo/violet/pink identity.

## Files

- `app/components/home/shaders/lumora.frag.ts` — the fragment shader (GLSL,
  as a template string; see below for why it's `.ts` not `.frag`).
- `app/components/home/shaders/lumora.vert.ts` — the vertex shader (a
  trivial fullscreen-quad passthrough).
- `app/components/home/ShaderScene.tsx` — the R3F `<Canvas>`, the fullscreen
  plane, and all uniform wiring (time, resolution, mouse, theme, tab
  visibility).
- `app/components/home/HeroShaderBackground.tsx` — decides shader vs.
  fallback (reduced motion / no WebGL) and renders the readability scrim
  behind the hero text.
- `app/components/home/useReducedMotion.ts`, `useWebglSupported.ts`,
  `useTabVisible.ts`, `useIsDarkTheme.ts` — small, Home-scoped capability
  hooks the above two components read.

Why `.frag.ts`/`.vert.ts` instead of real `.frag`/`.vert` files: this
project has no raw-GLSL loader configured for Turbopack, and adding one
just for two shader files wasn't worth the build-config risk. A file named
`lumora.frag.ts` exporting a `fragmentShader` string resolves from the
import specifier `"./shaders/lumora.frag"` exactly as if it were the real
extension — same organization the assignment suggested, zero new tooling.

## Uniforms

| Uniform | Type | What it does |
|---|---|---|
| `u_time` | `float` | Seconds since the shader mounted (`state.clock.elapsedTime`, read inside `useFrame`). Drives every wave/flow calculation. Scaled by `0.06` inside the shader so the whole field evolves slowly — a full cycle takes on the order of a minute, not seconds. |
| `u_resolution` | `vec2` | The canvas's physical pixel size (CSS size × the actual device pixel ratio R3F resolved, capped — see below). Used to normalize `gl_FragCoord` into 0..1 UV space and to correct for aspect ratio, so the field looks the same shape on a wide desktop hero and a narrow phone screen. |
| `u_mouse` | `vec2` | The pointer position, normalized to 0..1, eased toward the latest sample each frame (not snapped) so the field's response reads as a gentle pull. |
| `u_isLight` | `float` | `0` in dark mode, `1` in light mode (read from the `.dark` class via a `MutationObserver`, see `useIsDarkTheme.ts`). Lets one shader adapt its own intensity per theme instead of shipping two shaders. |

## How UV coordinates work

`gl_FragCoord.xy` is the fragment's position in physical pixels. Dividing
by `u_resolution` normalizes that to 0..1 regardless of screen size or
DPR. Subtracting `0.5` re-centers the origin at the middle of the
viewport, and multiplying `p.x` by the aspect ratio (`u_resolution.x /
u_resolution.y`) stops the field's shapes from stretching on wide
viewports — without this correction, a circle would render as an ellipse
on anything that isn't square.

## How the flow field is built

The shader has one building block, `ribbon()`: a wandering line (two
summed sine waves at different frequencies/phases, so it never looks like
a single repeating stripe) turned into a soft band with `smoothstep`
instead of a hard-edged wave. `main()` calls this three times at different
scale, speed, and phase offset, then combines them with soft addition
(not a hard `max`) so overlapping ribbons glow slightly brighter instead
of clipping into one flat band. A fourth, much larger and much fainter
`sin`/`cos` field is added afterward purely for depth, so the gaps between
ribbons don't read as perfectly flat.

The cursor bends this field locally: `u_mouse`'s position (in the same
centered, aspect-corrected space as everything else) computes a short-range
pull vector that's added to the sampling coordinate before it's fed into
the ribbon functions. Far from the cursor this pull is zero; only pixels
within a small radius are nudged toward it.

## How the colors are mixed

The combined field value (0..1) is mapped through Lumora's palette —
indigo, then violet, then pink — using two `smoothstep`/`mix` stages, so
brighter regions of the field shade toward pink while dimmer regions stay
closer to indigo. That color is blended into a deep neutral base (near-
black in dark mode, near-white in light mode, via `mix(..., u_isLight)`).

Dark and light mode use genuinely different RGB values for indigo/violet/
pink, not just a lower opacity of the same ones — an earlier version tried
that and the result was nearly invisible in light mode: colors bright
enough to glow against near-black wash out to pale fog against white at
any reasonable opacity. Light mode's hues are deeper and more saturated
(the same indigo-600/violet-600/pink-600 tones already used for
BorderGlow's light-mode glow) specifically so they carry real contrast
against a light background, which is also why light mode's intensity
(~0.5) can sit almost as high as dark mode's (~0.6) instead of needing to
be suppressed to compensate.

The field itself is also re-sharpened after combining the three ribbon
layers (`field = smoothstep(0.05, 0.85, field)`), which is what gives the
result texture/definition rather than one long blurry gradient — it pushes
faint areas toward fully transparent and bright areas toward fully solid
instead of leaving a wide, soft middle range.

## How grain works

A single hash function (`fract(sin(dot(p, magic)) * bignumber)`) turns the
pixel coordinate plus `u_time` into a pseudo-random value each frame, which
is added to the final color at a very small amplitude (±0.0125). No
texture lookups, no loop — just enough per-pixel, per-frame variance to
keep the gradient from banding, without ever looking like static.

## How reduced motion works

When `prefers-reduced-motion: reduce` is active, `HeroShaderBackground`
never mounts the shader at all — it renders the original `AuroraBackground`
(Phase 4.4's blurred CSS blobs) instead, which was already built to go
fully static under reduced motion. This means reduced-motion users see the
same indigo/violet/pink identity with zero animation, and the shader's own
`u_time`/mouse-tracking code never even runs. The identical fallback covers
"no WebGL support" and "WebGL context creation failed" for the same reason
— both are just "don't mount the shader."

## Why DPR is capped

`gl_FragCoord` operates in physical framebuffer pixels, so an uncapped
device pixel ratio (3x on many phones) means shading roughly 9x as many
pixels as the CSS size implies, for a purely decorative background. The
`<Canvas dpr={...}>` prop is capped to `[1, 1.5]` on desktop/mouse and
`[1, 1]` on coarse (touch) pointers, mirroring the same reasoning Explore's
`Scene.tsx` already uses for its own `dpr` cap.

## Pausing when the tab is hidden

`useTabVisible` (a `useSyncExternalStore` hook watching
`document.visibilityState` via the `visibilitychange` event) drives the
Canvas's `frameloop` prop directly: `"always"` while the tab is visible,
`"never"` while it's hidden. `"never"` stops R3F's internal render loop
entirely, which also stops every `useFrame` callback — including the one
that advances `u_time` — so nothing renders and nothing computes while the
tab is in the background. Restoring visibility flips it back to
`"always"` and the loop resumes immediately.
