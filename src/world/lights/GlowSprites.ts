/**
 * Additive glow sprites for every requested light: one instanced draw call. They are the visible
 * flame halo of torches, braziers and lamps (the real PointLights only light surfaces), and they
 * stand in for the lights that didn't get a PointLight. Far lamps keep a minimum on-screen size so
 * a lit city twinkles from the hills at night.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aColor;   // rgb × intensity, a = radius (m)
attribute vec3 aParams;  // x level 0..1, y flicker amount, z seed
uniform float uTime;
uniform float uMinPixels;
uniform vec2 uViewport;
uniform float uFogDensity;
varying vec3 vColor;
varying vec2 vUv;
void main() {
  float level = aParams.x;
  if (level <= 0.001 || aColor.a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec3(0.0); vUv = vec2(0.0); return; }
  float t = uTime; float s = aParams.z;
  float n = 0.5 * sin(t * 9.1 + s * 12.9) + 0.3 * sin(t * 23.7 + s * 4.1) + 0.2 * sin(t * 41.3 + s * 7.7 + sin(t * 3.1 + s));
  float fl = 1.0 - min(1.0, aParams.y) * (0.5 + 0.5 * n) * 0.6;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float dist = -mv.z;
  // World radius, but never smaller than uMinPixels on screen (distant lamps stay visible).
  float pxPerM = projectionMatrix[1][1] * uViewport.y * 0.5 / max(dist, 0.1);
  float r = max(aColor.a, uMinPixels / pxPerM);
  float shrink = aColor.a / r;   // energy conservation when inflated
  mv.xy += position.xy * r;
  // Pull the quad toward the camera a little so it isn't clipped by the lamp's own geometry.
  mv.xyz += normalize(-mv.xyz) * min(r * 0.8, dist * 0.5);
  gl_Position = projectionMatrix * mv;
  float fog = exp(-uFogDensity * dist);
  vColor = aColor.rgb * level * fl * fog * mix(1.0, shrink * shrink, 0.85) ;
  vUv = position.xy;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 28.0);
  float halo = exp(-r2 * 5.0) * 0.22 * (1.0 - r2);
  gl_FragColor = vec4(vColor * (core + halo), 1.0);
}
`;

export class GlowSprites {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uMinPixels: { value: 1.6 },
    uViewport: { value: new THREE.Vector2(1280, 720) },
    uFogDensity: { value: 0.001 },
  };
  private geometry: THREE.InstancedBufferGeometry;
  private capacity = 0;
  pos!: THREE.InstancedBufferAttribute;
  color!: THREE.InstancedBufferAttribute;
  params!: THREE.InstancedBufferAttribute;

  constructor(initialCapacity = 256) {
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.ensureCapacity(initialCapacity);
    this.geometry.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      name: 'LightGlow',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, mat);
    this.mesh.name = 'lightGlows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Grow the instance buffers (doubling); existing data is preserved. */
  ensureCapacity(n: number) {
    if (n <= this.capacity) return;
    let cap = Math.max(16, this.capacity);
    while (cap < n) cap *= 2;
    const grow = (old: THREE.InstancedBufferAttribute | undefined, size: number) => {
      const arr = new Float32Array(cap * size);
      if (old) arr.set(old.array as Float32Array);
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = grow(this.pos, 3);
    this.color = grow(this.color, 4);
    this.params = grow(this.params, 3);
    this.geometry.setAttribute('aPos', this.pos);
    this.geometry.setAttribute('aColor', this.color);
    this.geometry.setAttribute('aParams', this.params);
    this.capacity = cap;
  }

  set count(n: number) {
    this.geometry.instanceCount = n;
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
