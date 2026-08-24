// Lumora "Living Aurora" fragment shader — a from-scratch remix (ribbon
// function, mouse-bend math, palette mapping, grain/vignette all written
// for this component), tuned for Lumora's palette and for sitting quietly
// behind hero text. See SHADER.md at the repo root for the full walkthrough.
export const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_isLight;
  // Live width/height of the container, sampled every frame independently
  // of the debounced u_resolution — keeps aspect correction accurate during
  // HeroScrollShell's scroll-linked resize. See ShaderScene.tsx.
  uniform float u_aspect;

  // Cheap hash-based pseudo-random value, used only for the grain pass.
  // No texture lookups, no external noise library — a single sine/fract
  // trick is plenty for grain that should barely be noticeable.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // One "ribbon" of light: two summed sine waves (never a single repeating
  // stripe) turned into a band via smoothstep. main() layers three of these
  // at different scales/speeds/phases to build the full composition.
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

    // 4. Three ribbon layers at different scale/speed/phase so the
    // composite never repeats. Widths kept tight so each has a defined
    // edge instead of dissolving into a blur.
    float layerA = ribbon(p * vec2(1.4, 1.0), 2.2, 1.0, t, 0.15);
    float layerB = ribbon(p * vec2(1.0, 1.3) + vec2(0.6, -0.2), 3.1, -0.7, t + 10.0, 0.11);
    float layerC = ribbon(p * vec2(1.8, 0.8) + vec2(-0.4, 0.3), 1.6, 0.5, t + 20.0, 0.19);

    // 5. Soft addition (not a hard max) so overlapping ribbons glow
    // brighter instead of clipping, then re-sharpen with smoothstep —
    // pushes faint areas transparent and bright areas solid.
    float field = clamp(layerA * 0.5 + layerB * 0.35 + layerC * 0.4, 0.0, 1.0);
    field = smoothstep(0.05, 0.85, field);

    // 6. Mix Lumora's palette across the field's intensity: neutral base
    // graduating through indigo -> violet -> pink, same hue family as
    // AuroraBackground.
    //
    // Dark and light mode use genuinely different RGB values, not just a
    // lower opacity of the same ones — the bright dark-mode hues would wash
    // out to pastel fog against a white base, so light mode uses deeper,
    // more saturated tones (indigo-600/violet-600/pink-600) for contrast.
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
    // dark mode's brighter one, since it's already saturated enough for
    // contrast on its own.
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
