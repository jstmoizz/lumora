// Lumora "Living Aurora" fragment shader.
//
// This is a from-scratch remix, not a copy of any existing aurora/plasma
// shader: the ribbon function, the mouse-bend math, the palette mapping,
// and the grain/vignette treatment were all written for this component.
// It draws on the same *idea* every "flowing light field" shader shares
// (layered sine waves -> soft bands -> color gradient), but every constant
// and every step below was tuned specifically for Lumora's own palette and
// for sitting quietly behind real hero text — see SHADER.md at the repo
// root for the full walkthrough of how it works and why.
export const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_isLight;
  // Live width/height of the shader's container, sampled every frame on
  // the JS side independently of u_resolution (which only updates on a
  // debounced measurement) — see ShaderScene.tsx. Keeps aspect correction
  // matching the box actually on screen during HeroScrollShell's
  // scroll-linked resize, instead of the stale ratio u_resolution would
  // give mid-scroll.
  uniform float u_aspect;

  // Cheap hash-based pseudo-random value, used only for the grain pass.
  // No texture lookups, no external noise library — a single sine/fract
  // trick is plenty for grain that should barely be noticeable.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // One "ribbon" of light: a wandering line (two summed sine waves, so it
  // never looks like a single repeating stripe) turned into a band with
  // smoothstep instead of a hard-edged wave. This is the field's one
  // building block — main() layers three of these at different scales,
  // speeds, and phases to build the full composition. The width argument
  // is kept tight (see the calls in main()) so the band has a defined edge
  // rather than dissolving into a wide blur.
  float ribbon(vec2 p, float freq, float speed, float t, float width) {
    float wander = sin(p.x * freq + t * speed) * 0.35
                 + sin(p.x * freq * 0.5 - t * speed * 0.7) * 0.25;
    float distanceFromLine = abs(p.y - wander);
    return smoothstep(width, 0.0, distanceFromLine);
  }

  void main() {
    // 1. Normalize screen coordinates into 0..1, then re-center around the
    // middle of the viewport so the field is symmetric rather than
    // anchored to a corner.
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv - 0.5;

    // 2. Correct for aspect ratio so the ribbons keep their proportions on
    // wide desktop heroes and narrow phone screens alike, instead of
    // stretching horizontally on wide viewports.
    float aspect = u_aspect;
    p.x *= aspect;

    // 3. Subtle mouse influence: the cursor gently bends nearby flow
    // toward itself. This is a soft pull with a short falloff radius, not
    // a cursor-following blob — far from the cursor the field is
    // completely unaffected.
    vec2 mouseP = u_mouse - 0.5;
    mouseP.x *= aspect;
    float mouseDist = length(p - mouseP);
    vec2 towardMouse = normalize(mouseP - p + 0.0001);
    float pull = smoothstep(0.9, 0.0, mouseDist) * 0.06;
    p += towardMouse * pull;

    // Deliberately slow: the hero should feel almost still, with motion
    // only noticeable after a few seconds of looking at it.
    float t = u_time * 0.06;

    // 4. Build the flow field from three ribbon layers at different
    // scale, speed, and phase offset, so the composite never repeats or
    // reads as a single wave. Widths are deliberately tight (0.11-0.19,
    // not 0.16-0.28) so each ribbon has a defined edge instead of
    // dissolving into a wide blur.
    float layerA = ribbon(p * vec2(1.4, 1.0), 2.2, 1.0, t, 0.15);
    float layerB = ribbon(p * vec2(1.0, 1.3) + vec2(0.6, -0.2), 3.1, -0.7, t + 10.0, 0.11);
    float layerC = ribbon(p * vec2(1.8, 0.8) + vec2(-0.4, 0.3), 1.6, 0.5, t + 20.0, 0.19);

    // 5. Combine with soft addition (not a hard max) so overlapping
    // ribbons glow slightly brighter instead of clipping into one flat
    // band, then re-sharpen the result with a second smoothstep — this is
    // what actually gives the field definition/texture rather than a
    // uniform gradient: it pushes faint areas toward fully transparent and
    // bright areas toward fully solid instead of leaving a long, blurry
    // middle range.
    float field = clamp(layerA * 0.5 + layerB * 0.35 + layerC * 0.4, 0.0, 1.0);
    field = smoothstep(0.05, 0.85, field);

    // 6. Mix Lumora's palette across the field's intensity: a deep neutral
    // base graduating through indigo, then violet, then pink as the field
    // gets brighter — the same hue family as the existing AuroraBackground
    // blobs, just driven by the shader instead of blurred CSS circles.
    //
    // Dark and light mode use genuinely different RGB values here, not
    // just a lower opacity of the same ones: the dark-mode hues are bright
    // enough to glow against near-black, but at any reasonable opacity
    // those same bright hues wash out to near-invisible pastel fog against
    // a white base. The light-mode hues below are deeper and more
    // saturated (the same indigo-600/violet-600/pink-600 tones already
    // used for BorderGlow's light-mode glow) specifically so they carry
    // real contrast against a light background.
    vec3 deepDark = vec3(0.035, 0.03, 0.05);
    vec3 deepLight = vec3(0.97, 0.965, 0.99);
    vec3 base = mix(deepDark, deepLight, u_isLight);

    vec3 indigoDark = vec3(0.29, 0.27, 0.85);
    vec3 violetDark = vec3(0.48, 0.35, 0.90);
    vec3 pinkDark = vec3(0.90, 0.45, 0.68);

    vec3 indigoLight = vec3(0.31, 0.27, 0.90);
    vec3 violetLight = vec3(0.49, 0.23, 0.93);
    vec3 pinkLight = vec3(0.86, 0.15, 0.47);

    vec3 indigo = mix(indigoDark, indigoLight, u_isLight);
    vec3 violet = mix(violetDark, violetLight, u_isLight);
    vec3 pink = mix(pinkDark, pinkLight, u_isLight);

    vec3 ribbonColor = mix(indigo, violet, smoothstep(0.0, 0.6, field));
    ribbonColor = mix(ribbonColor, pink, smoothstep(0.5, 1.0, field));

    // Light mode's deeper palette can sit at nearly the same intensity as
    // dark mode's brighter one — the earlier version dropped intensity to
    // 0.22 in light mode to compensate for using the *same* bright hues
    // there, which is what made it read as an almost-invisible wash.
    float intensity = mix(0.6, 0.5, u_isLight);
    vec3 color = mix(base, ribbonColor, field * intensity);

    // 7. Depth: a large, very soft secondary field so the background
    // never reads as perfectly flat even in the gaps between ribbons.
    float depthGlow = 0.5 + 0.5 * sin(p.x * 0.8 + t * 0.3) * cos(p.y * 0.6 - t * 0.2);
    color += mix(indigo, violet, 0.5) * depthGlow * mix(0.05, 0.035, u_isLight);

    // 8. Subtle grain: a per-pixel hash keeps the gradient from banding
    // without ever looking like TV static.
    float grain = (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.03;
    color += grain;

    // 9. Gentle vignette: soften the far corners so attention stays on the
    // center of the hero, where the heading and CTA live.
    float vignette = smoothstep(0.9, 0.2, length(p));
    color = mix(base, color, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`;
