/**
 * UI test bed: a small sunlit Roman set (paving, a temple front, insulae, pines), the player,
 * a baker to talk to, a strongbox and a book — with every HUD source fed by mocks.
 *
 *   ?scene=ui                      play with the HUD (Tab/I/J/M/K menus, T wait, hold H clock)
 *   &open=<screen>                 pause | character | skills | inventory | journal | map | settings |
 *                                  controls | credits | save | load | dialogue | barter | container |
 *                                  book | letter | wait | confirm | title | loading
 *   &hud=demo                      fill every HUD element (bars, enemy, boss, banner, notes...)
 *
 * Dev keys while playing: 1 note · 2 discovery · 3 quest start · 4 get hit · 5 enemy · 6 boss ·
 * 7 bark · 8 level up · 9 title · 0 loading.
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { PlaceholderAvatar } from '../actors/PlaceholderAvatar';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import { Interactions } from '../interaction/Interactions';
import { installUI } from '../ui/UIManager';
import { questMarkersFrom } from '../ui/adapters';
import { MockBarter, MockCharacter, MockContainer, MockDialogue, MockInventory, MockQuestLog, MockSaves, MockVitals, MOCK_BOOKS, mockItem } from '../ui/mock';
import { MockMap } from '../ui/mockMap';
import { showLoading } from '../ui/screens/LoadingScreen';
import { showTitle } from '../ui/screens/TitleScreen';
import type { BossView, MenuTabId, TargetView } from '../ui';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

const M = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// ------------------------------------------------------------------ the set

function pavingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b9a88a';
  g.fillRect(0, 0, 512, 512);
  // Rows of travertine slabs of varying length with dark joints.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rowH = 64;
  for (let y = 0; y < 512; y += rowH) {
    let x = -rnd() * 80;
    while (x < 512) {
      const w = 70 + rnd() * 110;
      const l = 205 + rnd() * 28;
      g.fillStyle = `rgb(${l}, ${l - 14 - rnd() * 8}, ${l - 40 - rnd() * 12})`;
      g.fillRect(x + 2, y + 2, w - 4, rowH - 4);
      // pores and wear
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(90, 70, 40, ${0.05 + rnd() * 0.12})`;
        g.fillRect(x + rnd() * w, y + rnd() * rowH, 1 + rnd() * 5, 1 + rnd() * 2);
      }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function skyDome(sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sun;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 zenith = vec3(0.36, 0.55, 0.80);
        vec3 horizon = vec3(0.98, 0.80, 0.60);
        vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
        float s = max(dot(vDir, sun), 0.0);
        col += vec3(1.0, 0.72, 0.42) * (pow(s, 8.0) * 0.45 + pow(s, 300.0) * 2.0);
        col = mix(col, vec3(0.78, 0.66, 0.52), smoothstep(0.0, -0.2, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

function buildSet(game: Game) {
  // Temple front (prostyle hexastyle on a podium) facing south, toward the player.
  const t = new MeshBuilder();
  const podH = 2.4;
  t.box('travertine', 19, podH, 16, M(0, podH / 2, -31), { collide: true });
  // Twelve 0.2 m risers up the front of the podium.
  for (let i = 0; i < 12; i++) {
    const h = (i + 1) * 0.2;
    t.box('travertine', 9, h, 0.36, M(0, h / 2, -23 + (11.5 - i) * 0.36), { collide: true });
  }
  const colH = 9;
  const colGeo = new THREE.CylinderGeometry(0.48, 0.56, colH, 20, 1);
  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 3;
    for (const z of [-24.6, -27.6]) {
      if (z === -27.6 && i > 0 && i < 5) continue;
      t.add(colGeo, 'marble', M(x, podH + colH / 2 + 0.35, z));
      t.box('marble', 1.4, 0.35, 1.4, M(x, podH + 0.17, z));
      t.box('marble', 1.45, 0.45, 1.45, M(x, podH + colH + 0.55, z));
      t.collider({ kind: 'cylinder', center: new THREE.Vector3(x, podH + colH / 2, z), halfHeight: colH / 2, radius: 0.55 });
    }
  }
  const archY = podH + colH + 0.78;
  t.box('marble', 18.6, 1.5, 4.6, M(0, archY + 0.75, -26.1));
  t.box('stucco_painted', 18.7, 0.5, 4.7, M(0, archY + 1.35, -26.1));
  // Pediment: triangular prism.
  const tri = new THREE.Shape([new THREE.Vector2(-9.6, 0), new THREE.Vector2(9.6, 0), new THREE.Vector2(0, 3.1)]);
  const ped = new THREE.ExtrudeGeometry(tri, { depth: 4.8, bevelEnabled: false });
  t.add(ped, 'marble', M(0, archY + 1.6, -28.5));
  const roofL = new THREE.BoxGeometry(10.4, 0.25, 15);
  t.add(roofL, 'roof_tile', new THREE.Matrix4().compose(new THREE.Vector3(-4.6, archY + 3.1, -31), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.31)), new THREE.Vector3(1, 1, 1)));
  t.add(roofL, 'roof_tile', new THREE.Matrix4().compose(new THREE.Vector3(4.6, archY + 3.1, -31), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.31)), new THREE.Vector3(1, 1, 1)));
  t.box('plaster_cream', 14.5, colH + 0.6, 9.5, M(0, podH + (colH + 0.6) / 2, -33.4), { collide: true });
  t.box('black', 3.2, 6.2, 0.2, M(0, podH + 3.1, -28.6));
  t.box('bronze', 3.4, 6.4, 0.12, M(0, podH + 3.2, -28.52), { castShadow: false });
  placeAndRegister(game, 'ui-temple', t.build('temple'), t.colliders, { x: 0, y: 0, z: 0 });

  // Insulae and a portico.
  const b = new MeshBuilder();
  const insula = (x: number, z: number, w: number, d: number, h: number, mat: 'plaster_ochre' | 'plaster_red' | 'plaster_cream', ry = 0) => {
    b.box(mat, w, h, d, M(x, h / 2, z, ry), { collide: true });
    b.box('roof_tile', w + 0.8, 0.5, d + 0.8, M(x, h + 0.25, z, ry));
    b.box('brick', w + 0.05, 0.6, d + 0.05, M(x, 3.2, z, ry));
    // Windows on the street faces.
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    for (let fy = 4.6; fy < h - 1; fy += 3) {
      for (let k = -w / 2 + 1.5; k <= w / 2 - 1.5; k += 2.6) {
        const lx = k;
        const lz = d / 2 + 0.02;
        b.box('black', 0.9, 1.3, 0.06, M(x + lx * cos + lz * sin, fy, z - lx * sin + lz * cos, ry));
      }
    }
    // Shop openings (tabernae) at street level.
    for (let k = -w / 2 + 2; k <= w / 2 - 2; k += 3.4) {
      const lz = d / 2 + 0.02;
      b.box('wood_dark', 2.4, 2.6, 0.06, M(x + k * cos + lz * sin, 1.3, z - k * sin + lz * cos, ry));
    }
  };
  insula(-22, -10, 14, 12, 16, 'plaster_ochre', Math.PI / 2);
  insula(23, -6, 13, 12, 13, 'plaster_red', -Math.PI / 2);
  insula(25, 14, 12, 10, 10, 'plaster_cream', -Math.PI / 2);
  insula(-24, 16, 12, 12, 12, 'plaster_cream', Math.PI / 2);
  const pc = new THREE.CylinderGeometry(0.22, 0.26, 4.2, 12);
  for (let i = 0; i < 8; i++) {
    const z = -15 + i * 3.2;
    b.add(pc, 'marble', M(-12.5, 2.1, z));
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(-12.5, 2.1, z), halfHeight: 2.1, radius: 0.26 });
  }
  b.box('travertine', 1, 0.6, 26, M(-12.5, 4.5, -3.8));
  b.box('roof_tile', 3.8, 0.3, 26.5, new THREE.Matrix4().compose(new THREE.Vector3(-14.2, 5, -3.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.18)), new THREE.Vector3(1, 1, 1)));
  // Statue on a pedestal, a fountain basin.
  b.box('marble_veined', 1.6, 2.2, 1.6, M(7, 1.1, -10), { collide: true });
  b.add(new THREE.CapsuleGeometry(0.42, 1.4, 6, 12), 'gilded_bronze', M(7, 3.3, -10));
  b.add(new THREE.CylinderGeometry(2.4, 2.5, 0.6, 32), 'marble', M(-6, 0.3, -9));
  b.add(new THREE.CylinderGeometry(2.1, 2.1, 0.62, 32), 'water', M(-6, 0.32, -9), { castShadow: false });
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(-6, 0.3, -9), halfHeight: 0.3, radius: 2.5 });
  // Baker's counter and the props the player can use.
  b.box('wood', 2.4, 1, 0.8, M(0, 0.5, 1.4), { collide: true });
  b.box('wood_dark', 1.1, 0.7, 0.7, M(3.2, 0.35, 2.4), { collide: true });
  b.box('iron', 1.14, 0.08, 0.74, M(3.2, 0.62, 2.4));
  b.box('wood', 1.2, 0.85, 0.8, M(-3.2, 0.42, 2.4), { collide: true });
  b.box('fabric_red', 0.3, 0.06, 0.4, M(-3.2, 0.88, 2.4, 0.4));
  placeAndRegister(game, 'ui-block', b.build('block'), b.colliders, { x: 0, y: 0, z: 0 });

  // Trees: umbrella pines and cypresses.
  const tr = new MeshBuilder();
  const pine = (x: number, z: number, h: number) => {
    tr.add(new THREE.CylinderGeometry(0.22, 0.32, h, 8), 'bark', M(x, h / 2, z, 0.3));
    tr.add(new THREE.IcosahedronGeometry(1, 2), 'foliage_pine', M(x, h + 0.6, z, 0, 4.2, 1.3, 4.2));
  };
  const cypress = (x: number, z: number, h: number) => tr.add(new THREE.ConeGeometry(0.95, h, 10), 'foliage_cypress', M(x, h / 2, z));
  pine(-16, 26, 10);
  pine(17, 30, 11);
  pine(-34, -30, 12);
  cypress(12.5, -18, 9);
  cypress(-12.5, -21, 9);
  cypress(14.5, -24, 10);
  placeAndRegister(game, 'ui-trees', tr.build('trees'), [], { x: 0, y: 0, z: 0 });

  // Ground.
  const tex = pavingTexture();
  tex.repeat.set(36, 36);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 120, y: 0.5, z: 120 });
}

function lights(game: Game, follow: () => THREE.Vector3) {
  const sunDir = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();
  game.scene.add(skyDome(sunDir));
  game.scene.fog = new THREE.Fog(0xe6cfaa, 70, 300);
  game.scene.background = new THREE.Color(0xe6cfaa);
  const hemi = new THREE.HemisphereLight(0xc6d8f0, 0x9a7650, 1.05);
  const sun = new THREE.DirectionalLight(0xffd7a0, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -55;
  cam.right = cam.top = 55;
  cam.near = 1;
  cam.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  game.scene.add(hemi, sun, sun.target);
  const off = sunDir.clone().multiplyScalar(110);
  game.addSystem({
    name: 'uiSun',
    priority: 90,
    lateUpdate() {
      const p = follow();
      sun.target.position.set(Math.round(p.x), 0, Math.round(p.z));
      sun.position.copy(sun.target.position).add(off);
    },
  });
}

// ------------------------------------------------------------------ the scene

const scene: SceneDef = {
  title: 'UI',
  description: 'HUD, menus, dialogue, map, title and loading screens on mock data',
  async setup(game, uiRoot) {
    const params = new URLSearchParams(location.search);
    game.time.restore({ totalHours: 17.4 });
    buildSet(game);
    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, 3.3), Math.PI);
    lights(game, () => player.root.position);
    game.interactions = game.addSystem(new Interactions(game));

    // Mocks.
    const inv = new MockInventory();
    const vitals = new MockVitals();
    const character = new MockCharacter(vitals);
    const log = new MockQuestLog(inv);
    const saves = new MockSaves(() => ui.notify('Loading is mocked in this scene.', 'warning'));
    const ui = installUI(game, uiRoot);
    const map = new MockMap({
      player: () => ({ x: player.root.position.x, z: player.root.position.z, bearing: ui.hud.heading }),
      questMarkers: () => questMarkersFrom(log, resolve),
    });
    const resolve = (t: import('../quests/types').MarkerTarget) => {
      if (t.kind === 'point') return { x: t.x, z: t.z };
      if (t.kind === 'location') {
        const l = map.locations().find((x) => x.id === t.id);
        return l ? { x: l.x, z: l.z } : null;
      }
      return null;
    };

    // NPCs: the baker behind his counter, and a thug for the combat HUD.
    const baker = new Actor(game, { id: 'decimus', position: { x: 0, y: 0.05, z: 0.3 }, heading: 0, layer: Layer.Npc, avatar: new PlaceholderAvatar(0x9a6b3c) });
    const thug = new Actor(game, { id: 'thug', position: { x: 9, y: 0.05, z: -3 }, heading: -2.2, layer: Layer.Npc, avatar: new PlaceholderAvatar(0x5a2a22) });
    game.actors.add(baker);
    game.actors.add(thug);
    game.addSystem({
      name: 'uiNpcs',
      fixedUpdate(dt) {
        baker.locomote({ x: 0, y: 0, z: 0 }, dt);
        thug.locomote({ x: 0, y: 0, z: 0 }, dt);
      },
    });

    const openDialogue = () =>
      ui.openDialogue(new MockDialogue(41, () => inv.denarii, { onBarter: () => setTimeout(() => ui.openBarter(new MockBarter(inv)), 600) }));
    const head = new THREE.Vector3();
    game.interactions.add({
      id: 'decimus',
      position: () => head.copy(baker.root.position).setY(baker.root.position.y + 1.45),
      reach: 3.2,
      verb: () => 'Talk',
      label: () => 'Decimus Attius',
      detail: () => 'Baker · Vicus Tuscus',
      interact: () => openDialogue(),
    });
    game.interactions.add({
      id: 'strongbox',
      position: () => new THREE.Vector3(3.2, 0.6, 2.4),
      verb: () => 'Open',
      label: () => 'Strongbox',
      detail: () => 'Owned by Decimus Attius',
      illegal: () => true,
      interact: () => ui.openContainer(new MockContainer(inv)),
    });
    game.interactions.add({
      id: 'book',
      position: () => new THREE.Vector3(-3.2, 0.95, 2.4),
      verb: () => 'Read',
      label: () => 'On the New Column',
      interact: () => ui.openBook({ ...MOCK_BOOKS['book-column'], onTake: () => inv.add('book-column') }),
    });

    // Combat/HUD demo state.
    let target: TargetView | null = null;
    let boss: BossView | null = null;
    let detection = 0.1;
    ui.provide({
      vitals: () => vitals,
      character: () => character,
      inventory: () => inv,
      quests: () => log,
      map: () => map,
      saves: () => saves,
      resolveTarget: resolve,
      itemName: (id) => mockItem(id)?.name,
      currentLocation: () => 'Roman Forum',
      inCombat: () => !!target || !!boss,
      target: () => target,
      boss: () => boss,
      detection: () => detection,
      compassMarkers: () => (target ? [{ id: 'thug', kind: 'enemy', x: thug.position.x, z: thug.position.z }] : []),
      fastTravel: (id) => {
        const l = map.locations().find((x) => x.id === id);
        if (!l) return;
        // The set is tiny; just move a little and announce it.
        player.teleport({ x: 0, y: 0.05, z: 3.3 }, Math.PI);
        ui.notify(`You travel to ${l.name}.`);
      },
      quitToTitle: () => openTitle(),
    });

    // Vitals: sprinting drains stamina, everything regenerates.
    game.addSystem({
      name: 'uiVitals',
      fixedUpdate(dt) {
        const s = vitals.stamina;
        s.current = Math.max(0, Math.min(s.max, s.current + (player.sprinting ? -24 : 14) * dt));
        const hp = vitals.health;
        hp.current = Math.min(hp.max, hp.current + 1.2 * dt);
        if (player.sneaking) detection = Math.min(1, Math.max(0, detection + (Math.sin(game.elapsed * 0.6) * 0.25) * dt));
      },
    });

    const openTitle = () =>
      showTitle(game, {
        onNewGame: () => ui.notify('A new life in Rome begins.', 'quest'),
        onContinue: () => ui.notify('Continuing your last game.', 'info'),
        orbitCenter: { x: 0, y: 2, z: -7 },
        orbitRadius: 12,
        orbitHeight: 5.5,
      });
    const openLoading = (static_ = false) => {
      const ld = showLoading(ui.overlayLayer, { bindings: game.input.bindings });
      ui.block('loading', true);
      if (static_) return ld.progress(0.64, 'Raising the Forum of Trajan…');
      const steps = ['Surveying the seven hills…', 'Raising the Forum of Trajan…', 'Filling the aqueducts…', 'Waking the city…'];
      let p = 0;
      const id = setInterval(() => {
        p += 0.06;
        ld.progress(p, steps[Math.min(steps.length - 1, Math.floor(p * steps.length))]);
        if (p >= 1) {
          clearInterval(id);
          void ld.done().then(() => ui.block('loading', false));
        }
      }, 220);
    };

    // Dev keys.
    window.addEventListener('keydown', (e) => {
      if (ui.top || ui.blocked || e.repeat) return;
      const p = player.root.position;
      switch (e.code) {
        case 'Digit1': ui.notify(`${mockItem(['panis', 'posca', 'garum', 'lucerna'][Math.floor(Math.random() * 4)]).name} added`, 'item'); break;
        case 'Digit2': {
          const undiscovered = map.locations().filter((l) => !l.discovered);
          const l = undiscovered[0] ?? map.locations()[0];
          map.discover(l.id);
          game.events.emit('location:discovered', { locationId: l.id, name: l.name });
          break;
        }
        case 'Digit3': game.events.emit('quest:started', { questId: 'fac-curse' }); break;
        case 'Digit4': {
          const a = Math.random() * Math.PI * 2;
          ui.hitFrom(p.x + Math.sin(a) * 4, p.z + Math.cos(a) * 4);
          vitals.health.current = Math.max(1, vitals.health.current - 14);
          break;
        }
        case 'Digit5': target = target ? null : { name: 'Subura Thug', health: 0.45, tier: 'Veteran' }; break;
        case 'Digit6': boss = boss ? null : { name: 'Spiculus the Thracian', title: 'Champion of the Ludus Magnus', health: 0.72 }; break;
        case 'Digit7': ui.subtitle('Fresh bread! Still warm from the oven — two loaves for an as!', 'Decimus Attius'); break;
        case 'Digit8': game.events.emit('player:levelup', { level: 8 }); break;
        case 'Digit9': openTitle(); break;
        case 'Digit0': openLoading(); break;
        default: return;
      }
      e.preventDefault();
    });

    // Handles for automation (scripts/shot.mjs eval steps).
    (window as unknown as { __uiMocks: unknown }).__uiMocks = {
      inv, character, log, map, books: MOCK_BOOKS, openDialogue,
      barter: () => ui.openBarter(new MockBarter(inv)),
      container: () => ui.openContainer(new MockContainer(inv)),
    };

    // ---------------------------------------------------------------- screenshot states
    if (params.get('hud') === 'demo') {
      vitals.health.current = 78;
      vitals.stamina.current = 52;
      vitals.pietas.current = 34;
      target = { name: 'Subura Thug', health: 0.42, tier: 'Veteran' };
      boss = { name: 'Spiculus the Thracian', title: 'Champion of the Ludus Magnus', health: 0.68 };
      player.sneaking = true;
      detection = 0.55;
      ui.hud.clockVisible = true;
      ui.notify('Gladius Hispaniensis added', 'item');
      ui.notify('Rhetoric increased to 42', 'skill');
      ui.notify('Deliver the sealed tablet to the Tabularium', 'quest');
      ui.notify('Crime witnessed — bounty of 40 denarii', 'warning');
      ui.banner({ kind: 'location', title: 'Forum Romanum', subtitle: 'The Roman Forum', duration: 60 });
      ui.subtitle('Fresh bread! Still warm from the oven — two loaves for an as!', 'Decimus Attius', 60);
      setTimeout(() => {
        ui.hitFrom(player.root.position.x - 5, player.root.position.z - 1);
        ui.hitFrom(player.root.position.x + 2, player.root.position.z + 5);
      }, 1200);
    }

    const open = params.get('open');
    if (open) {
      const tabs: MenuTabId[] = ['character', 'skills', 'inventory', 'journal', 'map'];
      const run = () => {
        if (tabs.includes(open as MenuTabId)) ui.openMenu(open as MenuTabId);
        else if (open === 'pause') ui.openPause();
        else if (open === 'settings') ui.openSettings();
        else if (open === 'controls') ui.openControls();
        else if (open === 'credits') ui.openCredits();
        else if (open === 'save' || open === 'load') ui.openSaves(open);
        else if (open === 'dialogue') openDialogue();
        else if (open === 'barter') ui.openBarter(new MockBarter(inv));
        else if (open === 'container') ui.openContainer(new MockContainer(inv));
        else if (open === 'book') ui.openBook(MOCK_BOOKS['book-column']);
        else if (open === 'letter') ui.openBook(MOCK_BOOKS['letter-pliny']);
        else if (open === 'wait') ui.openWait();
        else if (open === 'confirm') void ui.confirm({ title: 'Fast travel', text: 'Travel to the Circus Maximus? About an hour will pass.', yes: 'Travel', no: 'Stay' });
        else if (open === 'title') openTitle();
        else if (open === 'loading') openLoading(true);
      };
      // Let one frame lay out the HUD first.
      requestAnimationFrame(run);
    }
  },
};
export default scene;
