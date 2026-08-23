// Lumora "Galaxy" fragment shader — a restrained, layered star field.
//
// Deliberately not a raymarched/volumetric nebula: three flat, sparse
// "star layers" at different grid scales/speeds/sizes give a sense of
// depth for a fraction of the cost, which matters here since this replaces
// a shader whose main problem was scroll/resize cost (see ShaderScene.tsx
// and Galaxy.tsx for the visibility/resize gating this pairs with). The
// canvas renders transparent (alpha output, not `1.0`) — the field is
// meant to sit as a sparse accent over Lumora's own flat page background,
// not repaint it, which is what keeps this "atmospheric background" rather
// than "a giant particle demo" or "a literal space website".
export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_mouseActive;
  uniform float u_density;
  uniform float u_starSpeed;
  uniform float u_speed;
  uniform float u_glowIntensity;
  uniform float u_saturation;
  uniform float u_twinkleIntensity;
  uniform float u_rotationSpeed;
  uniform float u_mouseRepulsion;
  uniform float u_repulsionStrength;
  uniform vec3 u_colorBright;
  uniform vec3 u_colorA;
  uniform vec3 u_colorB;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec2 hash22(vec2 p) {
    return vec2(hash21(p), hash21(p + 17.17));
  }

  vec2 rotateField(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c) * p;
  }

  // One field of stars at a given grid scale. Each cell holds at most one
  // star (gated by density, so most cells are empty), offset and sized
  // by hash so the field doesn't read as a repeating grid. core/glow
  // radii are kept well inside the cell's own half-extent (0.5) so a
  // star's glow never gets clipped by its cell boundary.
  // Returns (brightness, a color-selector hash, a twinkle-phase hash).
  vec3 starLayer(vec2 uv, float density, float coreScale) {
    vec2 id = floor(uv);
    vec2 gv = fract(uv) - 0.5;

    float n = hash21(id);
    float cellActive = step(1.0 - density, n);
    vec2 jitter = (hash22(id + 11.7) - 0.5) * 0.5;
    float core = mix(0.02, 0.07, fract(n * 91.7)) * coreScale;
    float d = length(gv - jitter);

    float body = smoothstep(core, 0.0, d);
    float glow = smoothstep(core * 4.0, 0.0, d) * u_glowIntensity * 0.55;
    float brightness = (body + glow) * cellActive;

    return vec3(brightness, fract(n * 53.13), fract(n * 17.91));
  }

  // Turns one layer's (brightness, colorHash, phaseHash) sample into a
  // premultiplied color + alpha contribution: picks among the three
  // theme-resolved accent colors (mostly u_colorA/u_colorB — Lumora's own
  // indigo/violet family — with u_colorBright only for the minority of
  // "contrast" stars), applies saturation, and animates brightness with a
  // slow per-star twinkle.
  vec4 layerContribution(vec3 s) {
    float twinkle = 1.0 - u_twinkleIntensity * (0.5 + 0.5 * sin(u_time * u_speed * (2.0 + s.z * 3.0) + s.z * 31.4));
    float brightness = s.x * twinkle;

    vec3 col = mix(u_colorA, u_colorB, step(0.5, s.y));
    col = mix(col, u_colorBright, smoothstep(0.86, 1.0, s.y));
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, clamp(u_saturation * 2.2, 0.0, 1.3));

    return vec4(col * brightness, clamp(brightness, 0.0, 1.0));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    // A very slow whole-field drift — barely perceptible, never a spin.
    uv = rotateField(uv, u_time * u_rotationSpeed);

    // Subtle repulsion: nearby stars nudge away from the pointer within a
    // short radius, eased in via u_mouseActive (see Galaxy.tsx) so it
    // never snaps on and stays a "notice it if you look" effect, not a
    // violent scatter.
    if (u_mouseRepulsion > 0.5 && u_mouseActive > 0.001) {
      float minDim = min(u_resolution.x, u_resolution.y);
      vec2 mouseUv = (u_mouse - 0.5) * (u_resolution / minDim);
      vec2 toMouse = uv - mouseUv;
      float dist = length(toMouse);
      float falloff = smoothstep(0.32, 0.0, dist);
      uv += normalize(toMouse + 1e-4) * falloff * u_repulsionStrength * 0.1 * u_mouseActive;
    }

    // Three layers at increasing grid scale/speed/size, each drifting in a
    // slightly different direction — cheap depth parallax without a real
    // 3D pass.
    vec2 drift0 = vec2(u_time * u_starSpeed * 0.022, -u_time * u_starSpeed * 0.016);
    vec2 drift1 = vec2(u_time * u_starSpeed * 0.038, -u_time * u_starSpeed * 0.028);
    vec2 drift2 = vec2(u_time * u_starSpeed * 0.058, -u_time * u_starSpeed * 0.044);

    vec3 s0 = starLayer(uv * 4.5 + drift0, u_density * 0.05, 1.35);
    vec3 s1 = starLayer(uv * 8.5 + drift1 + 19.19, u_density * 0.09, 1.0);
    vec3 s2 = starLayer(uv * 14.0 + drift2 + 41.41, u_density * 0.14, 0.72);

    vec4 c0 = layerContribution(s0);
    vec4 c1 = layerContribution(s1);
    vec4 c2 = layerContribution(s2);

    vec3 color = c0.rgb + c1.rgb + c2.rgb;
    float alpha = max(max(c0.a, c1.a), c2.a);

    gl_FragColor = vec4(color, alpha);
  }
`;
