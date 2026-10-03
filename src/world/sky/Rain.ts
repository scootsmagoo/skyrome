/**
 * Rain streaks near the camera: one instanced draw call, animated entirely on the GPU.
 *
 * Each drop has a fixed random seed; its world position is seed × box + velocity × time, wrapped
 * into a box centred on the camera. Drops are therefore fixed in WORLD space (walking doesn't drag
 * the rain along) and recycle seamlessly at the box faces. Intensity hides a fraction of the drops.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uCam;
uniform vec3 uVel;
uniform float uIntensity;
uniform float uLen;
uniform float uWidth;
varying float vAlpha;
varying vec2 vUv;
void main() {
  if (aSeed.w > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vUv = vec2(0.0); return; }
  float speed = 0.85 + 0.3 * fract(aSeed.w * 7.31);
  vec3 vel = uVel * speed;
  vec3 base = aSeed.xyz * uBox + vel * uTime;
  vec3 origin = uCam - uBox * 0.5;
  vec3 p = base - uBox * floor((base - origin) / uBox);
  vec3 v = normalize(vel);
  vec3 toCam = normalize(uCam - p);
  // Screen-right for a streak whose +y runs up the drop (keeps the quad front-facing).
  vec3 side = normalize(cross(toCam, v));
  float len = uLen * speed;
  vec3 world = p + side * (position.x * uWidth) - v * (position.y * len);
  vec3 rel = (p - uCam) / uBox;
  float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(rel.x), max(abs(rel.y), abs(rel.z))));
  float d = length(p - uCam);
  vAlpha = edge * smoothstep(0.4, 1.6, d) * (0.55 + 0.45 * fract(aSeed.w * 13.7));
  vUv = vec2(position.x * 2.0, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.x);
  float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  float a = vAlpha * across * along * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  // No-ops into PostFX's linear HDR target; tone map + sRGB when post is off.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Rain {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uBox: { value: new THREE.Vector3(34, 20, 34) },
    uCam: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3(0, -9, 0) },
    uIntensity: { value: 0 },
    uLen: { value: 0.95 },
    uWidth: { value: 0.022 },
    uColor: { value: new THREE.Color(0.6, 0.65, 0.7) },
    uOpacity: { value: 0.5 },
  };
  private time = 0;

  constructor(count = 9000, seed = 7) {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4);
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    quad.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      name: 'Rain',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(quad, mat);
    this.mesh.name = 'rain';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /**
   * `amount` 0..1.5, `wind` (m/s, horizontal vector in xz), `light` = ambient brightness so streaks
   * read in daylight and at night alike.
   */
  update(dt: number, camera: THREE.Camera, amount: number, windX: number, windZ: number, light: THREE.Color) {
    const u = this.uniforms;
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    this.time += dt;
    // Keep the time small for float precision (the pattern is periodic in the box anyway).
    if (this.time > 600) this.time -= 600;
    u.uTime.value = this.time;
    u.uIntensity.value = Math.min(1, amount);
    u.uOpacity.value = 0.36 + 0.14 * Math.max(0, amount - 1);
    u.uVel.value.set(windX * 0.35, -9.5 - 2 * Math.max(0, amount - 1), windZ * 0.35);
    camera.getWorldPosition(u.uCam.value);
    u.uColor.value.copy(light);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
