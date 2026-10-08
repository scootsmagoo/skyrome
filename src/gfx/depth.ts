/**
 * Whether the renderer draws with a reversed depth buffer (Game turns it on where the GPU allows):
 * 1 → near = 1, far = 0. Shaders that place themselves at the far plane (sky dome, stars) read it
 * as a uniform: the usual `gl_Position = p.xyww` trick lands on the NEAR plane with reversed depth.
 */
export const reversedDepth = { value: 0 };

/** GLSL: put `p` (clip space) on the far plane under either convention. Needs `uniform float uReversedDepth`. */
export const FAR_PLANE = /* glsl */ `vec4( p.xy, uReversedDepth > 0.5 ? 0.0 : p.w, p.w )`;
