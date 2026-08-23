// Fullscreen-quad vertex shader: writes straight to clip space and ignores
// the camera entirely, so a plain 2x2 plane always exactly fills the
// viewport regardless of camera position/fov/aspect. `position` is
// auto-injected by three.js's ShaderMaterial (no need to declare it) —
// see ShaderScene.tsx for the plane geometry this pairs with.
export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
