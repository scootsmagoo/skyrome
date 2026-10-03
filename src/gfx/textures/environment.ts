/**
 * A tiny shared image-based-lighting environment: a warm Mediterranean sky gradient (deep blue
 * zenith, hazy warm horizon, sunlit ochre ground) with a soft sun glow, prefiltered with
 * PMREMGenerator. Gilded and bronze surfaces need *something* to reflect or they render black.
 * The sky module will later replace `scene.environment` with its own (time-of-day) version.
 */
import * as THREE from 'three';

export interface EnvironmentOptions {
  /** `scene.environmentIntensity`. Default 0.7 (the scene's lights do the heavy lifting). */
  intensity?: number;
  /** Direction TOWARDS the sun (world space). Default: high in the south-west. */
  sunDir?: THREE.Vector3Like;
  zenith?: THREE.ColorRepresentation;
  horizon?: THREE.ColorRepresentation;
  ground?: THREE.ColorRepresentation;
  sun?: THREE.ColorRepresentation;
}

const cache = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.Texture>>();

function skyScene(o: EnvironmentOptions): THREE.Scene {
  const scene = new THREE.Scene();
  const sun = new THREE.Vector3().copy((o.sunDir as THREE.Vector3) ?? new THREE.Vector3(-0.45, 0.7, 0.55)).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(o.zenith ?? 0x3f78c2) },
      horizon: { value: new THREE.Color(o.horizon ?? 0xe9dcc3) },
      ground: { value: new THREE.Color(o.ground ?? 0xa69a86) },
      sunColor: { value: new THREE.Color(o.sun ?? 0xfff0d0) },
      sunDir: { value: sun },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, ground, sunColor, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sky = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.4));
        vec3 gnd = mix(horizon * 0.8, ground, smoothstep(0.0, 0.25, -h));
        vec3 col = h >= 0.0 ? sky : gnd;
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 600.0) * 40.0 + pow(s, 12.0) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  return scene;
}

/**
 * Generate (once per renderer and option set) the PMREM sky and assign it to `scene.environment`.
 * Returns the environment texture.
 */
export function applyDefaultEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, opts: EnvironmentOptions = {}): THREE.Texture {
  const key = JSON.stringify({ ...opts, intensity: undefined });
  let perRenderer = cache.get(renderer);
  if (!perRenderer) cache.set(renderer, (perRenderer = new Map()));
  let tex = perRenderer.get(key);
  if (!tex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sky = skyScene(opts);
    tex = pmrem.fromScene(sky, 0.01, 0.1, 100).texture;
    pmrem.dispose();
    sky.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    perRenderer.set(key, tex);
  }
  scene.environment = tex;
  scene.environmentIntensity = opts.intensity ?? 0.7;
  return tex;
}
