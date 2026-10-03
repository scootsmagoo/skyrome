/**
 * RPG systems test bed (?scene=rpg): a corner of the Forum with the example quest "The Scribe's
 * Letter" running against the real systems — character sheet, inventory, quests, dialogue,
 * locations, crime, saving. Walk to Eutychus the scribe by the Rostra and press E to talk; dialogue choices
 * take 1–9 (or a click), Space/E continues, Esc leaves. F5/F9 quicksave/quickload.
 *
 * The overlay here is a developer view, not the game HUD (that lives in src/ui).
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { PlaceholderAvatar } from '../actors/PlaceholderAvatar';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { DEG } from '../core/math';
import type { DialogueView } from '../dialogue/DialogueSystem';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import { Interactions, type Interactable } from '../interaction/Interactions';
import { BACKGROUNDS } from '../rpg/data/origins';
import { installRpg, type RpgServices } from '../rpg/install';
import { formatDenarii } from '../rpg/money';
import { basicLights, setupPlayer } from './common';
import type { SceneDef } from './types';

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// ------------------------------------------------------------------ world

function buildForum(game: Game) {
  // Paving: travertine slabs with a basalt Sacra Via crossing east–west.
  const ground = new MeshBuilder();
  ground.box('paving_travertine', 700, 1, 700, T(0, -0.5, 0), { collide: true, uvScale: 3 });
  ground.box('paving_basalt', 700, 0.04, 5, T(0, 0.02, 9), { uvScale: 2 });
  placeAndRegister(game, 'rpg:ground', ground.build('ground'), ground.colliders, { x: 0, y: 0, z: 0 });

  // The Rostra: a tufa speakers' platform with a marble cornice and bronze ships' beaks.
  const r = new MeshBuilder();
  r.box('tufa', 12, 2.6, 5, T(0, 1.3, 0), { collide: true });
  r.box('marble', 12.5, 0.3, 5.5, T(0, 2.75, 0));
  r.box('marble', 12.8, 0.25, 5.8, T(0, 0.12, 0));
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    r.add(new THREE.ConeGeometry(0.28, 1, 4), 'bronze', TR(x, 1.7, 2.9, Math.PI / 2, 0, 0));
    r.box('bronze', 0.7, 0.18, 0.12, T(x, 1.7, 2.55));
  }
  for (const x of [-5.2, 5.2]) {
    r.add(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 16), 'marble', T(x, 4.7, -1.6));
    r.box('marble', 0.7, 0.4, 0.7, T(x, 3.1, -1.6));
    r.box('marble', 0.6, 0.25, 0.6, T(x, 6.6, -1.6));
  }
  placeAndRegister(game, 'rpg:rostra', r.build('rostra'), r.colliders, { x: -6, y: 0, z: -2.5 });

  // Basilica Aemilia: a two-storey marble portico in front of a brick hall with a tiled roof.
  const b = new MeshBuilder();
  const W = 26;
  b.box('travertine', W + 1, 0.45, 3.4, T(0, 0.22, 0), { collide: true });
  for (let i = 0; i <= 10; i++) {
    const x = -W / 2 + 0.5 + i * ((W - 1) / 10);
    b.add(new THREE.CylinderGeometry(0.36, 0.42, 5.6, 20), 'marble', T(x, 3.25, 0.6));
    b.box('marble', 1.0, 0.3, 1.0, T(x, 0.6, 0.6));
    b.box('marble', 0.95, 0.35, 0.95, T(x, 6.2, 0.6));
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, 3.25, 0.6), halfHeight: 2.8, radius: 0.42 });
    b.add(new THREE.CylinderGeometry(0.26, 0.3, 3.4, 16), 'marble_veined', T(x, 8.6, 0.6));
  }
  b.box('marble', W + 0.6, 0.9, 1.6, T(0, 6.8, 0.6));
  b.box('stucco_painted', W + 0.6, 0.35, 1.62, T(0, 6.85, 0.6));
  b.box('marble', W + 0.8, 0.7, 1.8, T(0, 10.6, 0.6));
  // Hall
  b.box('brick', W, 11, 0.8, T(0, 5.5, -11), { collide: true });
  b.box('brick', 0.8, 11, 11.5, T(-W / 2, 5.5, -5.4), { collide: true });
  b.box('brick', 0.8, 11, 11.5, T(W / 2, 5.5, -5.4), { collide: true });
  b.box('plaster_cream', W - 1, 5.5, 0.1, T(0, 2.8, -10.55));
  b.box('plaster_red', W - 1, 1.1, 0.12, T(0, 0.55, -10.53));
  for (let i = 0; i < 5; i++) b.box('black', 2.2, 3.2, 0.05, T(-10 + i * 5, 1.6, -10.47));
  b.box('marble_pavonazzetto', W - 0.8, 0.06, 11, T(0, 0.03, -5.2), { uvScale: 1.5 });
  b.box('wood_dark', W + 0.4, 0.4, 13, T(0, 11.2, -5.3));
  b.add(new THREE.BoxGeometry(W + 1.4, 0.3, 7.6), 'roof_tile', TR(0, 12.6, -2.1, 0.42, 0, 0));
  b.add(new THREE.BoxGeometry(W + 1.4, 0.3, 7.6), 'roof_tile', TR(0, 12.6, -8.6, -0.42, 0, 0));
  // Sextus's banking table with a set of scales
  b.box('wood_dark', 2, 0.85, 0.9, T(0, 0.45, -4.6), { collide: true });
  b.box('fabric_purple', 2.05, 0.04, 0.95, T(0, 0.9, -4.6));
  b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), 'bronze', T(0.6, 1.15, -4.6));
  b.box('bronze', 0.6, 0.03, 0.03, T(0.6, 1.4, -4.6));
  for (const dx of [-0.28, 0.28]) b.add(new THREE.CylinderGeometry(0.1, 0.08, 0.03, 12), 'bronze', T(0.6 + dx, 1.25, -4.6));
  placeAndRegister(game, 'rpg:basilica', b.build('basilica'), b.colliders, { x: 16, y: 0, z: -11 });

  // A fig seller's stall
  const s = new MeshBuilder();
  s.box('wood', 2.4, 1, 0.9, T(0, 0.5, 0), { collide: true });
  for (const x of [-1.15, 1.15]) for (const z of [-0.5, 0.5]) s.add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), 'wood_dark', T(x, 1.25, z));
  s.add(new THREE.BoxGeometry(2.8, 0.05, 1.7), 'fabric_red', TR(0, 2.45, 0.15, 0.2, 0, 0));
  for (let i = 0; i < 3; i++) {
    const x = -0.7 + i * 0.7;
    s.add(new THREE.CylinderGeometry(0.28, 0.2, 0.22, 14), 'wood', T(x, 1.11, 0));
    for (let k = 0; k < 6; k++) s.add(new THREE.SphereGeometry(0.06, 8, 6), i === 1 ? 'fabric_purple' : i === 0 ? 'foliage_olive' : 'terracotta', T(x + Math.cos(k) * 0.12, 1.24 + (k % 2) * 0.03, Math.sin(k * 1.7) * 0.12));
  }
  placeAndRegister(game, 'rpg:stall', s.build('stall'), s.colliders, { x: -14, y: 0, z: -7 }, 0.35);

  // An altar of Mars with a small fire
  const a = new MeshBuilder();
  a.box('marble', 1.3, 1.0, 0.9, T(0, 0.5, 0), { collide: true });
  a.box('marble', 1.5, 0.16, 1.1, T(0, 1.06, 0));
  a.box('marble', 1.55, 0.2, 1.15, T(0, 0.1, 0));
  a.add(new THREE.ConeGeometry(0.22, 0.45, 10), 'glow_fire', T(0, 1.36, 0), { castShadow: false });
  placeAndRegister(game, 'rpg:altar', a.build('altar'), a.colliders, { x: 8, y: 0, z: 2 });
  const fire = new THREE.PointLight(0xff9a3c, 6, 8, 2);
  fire.position.set(8, 1.8, 2);
  game.scene.add(fire);

  // A crossroads shrine (compitum) of the Lares: a small painted aedicula on a plinth
  const c = new MeshBuilder();
  c.box('travertine', 1.1, 1.1, 0.6, T(0, 0.55, 0), { collide: true });
  c.box('plaster_ochre', 0.9, 0.8, 0.45, T(0, 1.5, 0));
  c.box('fabric_red', 0.7, 0.55, 0.05, T(0, 1.52, 0.24));
  c.add(new THREE.ConeGeometry(0.62, 0.32, 4), 'terracotta', TR(0, 2.06, 0, 0, Math.PI / 4, 0));
  c.add(new THREE.SphereGeometry(0.07, 8, 6), 'glow_fire', T(0, 1.18, 0.33), { castShadow: false });
  placeAndRegister(game, 'rpg:compitum', c.build('compitum'), c.colliders, { x: -12, y: 0, z: 3 }, Math.PI / 2);
}

// ------------------------------------------------------------------ NPCs & interactables

function spawnNpcs(game: Game, rpg: RpgServices) {
  const npcs: { id: string; pos: THREE.Vector3; heading: number; color: number }[] = [
    { id: 'ex-scriba', pos: new THREE.Vector3(-6, 0.05, 3.2), heading: 0, color: 0xcbbd9c },
    { id: 'ex-sextus', pos: new THREE.Vector3(16, 0.05, -16.6), heading: 0, color: 0xefe8d8 },
  ];
  const actors: Actor[] = [];
  for (const n of npcs) {
    const def = rpg.npcs.get(n.id);
    if (!def) continue;
    const actor = new Actor(game, { id: n.id, position: n.pos, heading: n.heading, layer: Layer.Npc, avatar: new PlaceholderAvatar(n.color) });
    game.actors.add(actor);
    actors.push(actor);
    game.interactions.add({
      id: `talk:${n.id}`,
      position: () => actor.position.clone().setY(actor.position.y + 1.5),
      verb: () => 'Talk',
      label: () => def.name,
      detail: () => def.title ?? null,
      interact: () => {
        rpg.dialogue.start(n.id);
      },
    });
  }
  game.addSystem({
    name: 'rpgNpcs',
    fixedUpdate(dt) {
      const p = game.player.position;
      for (const a of actors) {
        // Face the player while talking to them.
        if (rpg.dialogue.view?.npcId === a.id) a.turnToward(Math.atan2(p.x - a.position.x, p.z - a.position.z), 4, dt);
        a.locomote({ x: 0, y: 0, z: 0 }, dt);
      }
    },
  });

  game.interactions.add({
    id: 'buy:figs',
    position: () => new THREE.Vector3(-14, 1.2, -7),
    verb: () => 'Buy',
    label: () => 'Dried figs',
    detail: () => `2 asses · you have ${rpg.inventory.count('ficus')}`,
    interact: () => {
      if (rpg.inventory.spendDenarii(2 / 16)) rpg.inventory.add('ficus', 1, { source: 'barter' });
      else game.events.emit('rpg:notify', { text: 'You cannot afford figs.', kind: 'warning' });
    },
  });
  // A temple prayer needs an offering: a honey cake if you have one, else a denarius (§14.6).
  game.interactions.add({
    id: 'pray:mars',
    position: () => new THREE.Vector3(8, 1.2, 2),
    verb: () => 'Pray',
    label: () => 'Altar of Mars Ultor',
    detail: () => `Offer ${rpg.inventory.has('libum') ? 'a honey cake' : '1 denarius'}: Blessing of Mars (+10% melee), +10 pietas once a day`,
    interact: () => {
      const r = rpg.devotion.prayAtTemple('temple-mars-ultor', rpg.inventory.has('libum') ? { itemId: 'libum' } : { denarii: 1 });
      if (!r.ok) game.events.emit('rpg:notify', { text: 'You have nothing to offer.', kind: 'warning' });
    },
  });
  game.interactions.add({
    id: 'pray:compitum',
    position: () => new THREE.Vector3(-12, 1.6, 3),
    verb: () => 'Pray',
    label: () => 'Shrine of the Lares Compitales',
    detail: () => (rpg.devotion.canPrayAt('compitum-rpg') ? 'Favor of the Lares, +5 pietas' : 'Favor of the Lares (pietas already given today)'),
    interact: () => void rpg.devotion.prayAtCompitum('compitum-rpg'),
  });
}

// ------------------------------------------------------------------ overlay

const CSS = `
.rpgdev { position:absolute; inset:0; pointer-events:none; font-family: var(--font-body); color: var(--ink); text-shadow: 0 1px 2px rgba(0,0,0,.6); }
.rpgdev .card { position:absolute; background: linear-gradient(180deg, rgba(28,20,14,.86), rgba(18,13,10,.80)); border:1px solid var(--panel-edge); border-radius:4px; box-shadow: 0 6px 24px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,235,190,.05); padding:12px 14px; }
.rpgdev h3 { margin:0 0 6px; font: 600 13px/1.2 var(--font-display); letter-spacing:.14em; text-transform:uppercase; color: var(--gold); }
.rpgdev .latin { font-style: italic; color: var(--ink-dim); font-size: 12px; }
.rpgdev .sheet { left:16px; top:16px; width:270px; }
.rpgdev .bar { height:8px; background: rgba(255,255,255,.08); border-radius:2px; overflow:hidden; margin:3px 0 7px; }
.rpgdev .bar > i { display:block; height:100%; border-radius:2px; }
.rpgdev .row { display:flex; justify-content:space-between; font-size:13px; }
.rpgdev .dim { color: var(--ink-dim); }
.rpgdev .chips { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }
.rpgdev .chip { font-size:11px; padding:1px 6px; border:1px solid rgba(217,179,90,.35); border-radius:9px; color: var(--ink-dim); }
.rpgdev .chip.bad { border-color: rgba(200,80,60,.6); color:#e8b4a6; }
.rpgdev .journal { right:16px; top:16px; width:320px; }
.rpgdev .journal .title { font: 600 16px/1.25 var(--font-display); letter-spacing:.04em; }
.rpgdev .obj { font-size:14px; margin:4px 0; display:flex; gap:8px; align-items:baseline; }
.rpgdev .obj.done { color: var(--ink-dim); text-decoration: line-through; text-decoration-color: rgba(217,179,90,.5); }
.rpgdev .obj .box { color: var(--gold); width:12px; flex:none; }
.rpgdev .pointer { display:flex; align-items:center; gap:10px; margin-top:8px; padding-top:8px; border-top:1px solid rgba(217,179,90,.2); font-size:13px; }
.rpgdev .pointer .arrow { width:22px; height:22px; display:grid; place-items:center; color: var(--gold); font-size:18px; transition: transform .1s linear; }
.rpgdev .log { left:16px; bottom:16px; width:min(236px, calc(50vw - 396px)); min-width:200px; background:none; border:none; box-shadow:none; padding:0; }
.rpgdev .log div { font-size:13px; margin-top:3px; padding:3px 8px; background: rgba(18,13,10,.55); border-left:2px solid var(--gold); border-radius:2px; animation: rpgdevfade 8s forwards; }
.rpgdev .log div.warning, .rpgdev .log div.crime { border-left-color: #c0533e; }
@keyframes rpgdevfade { 0%,75% { opacity:1 } 100% { opacity:.0 } }
.rpgdev .dialogue { left:50%; bottom:28px; transform:translateX(-50%); width:min(760px, 92vw); padding:16px 20px 14px; }
.rpgdev .dialogue .who { font: 600 14px/1 var(--font-display); letter-spacing:.12em; color: var(--gold); text-transform:uppercase; margin-bottom:8px; }
.rpgdev .dialogue .who.player { color: #b9c9d9; }
.rpgdev .dialogue .text { font-size:18px; line-height:1.45; margin-bottom:10px; }
.rpgdev .dialogue ol { margin:0; padding:0; list-style:none; }
.rpgdev .dialogue li { pointer-events:auto; cursor:pointer; padding:5px 8px; border-radius:3px; font-size:16px; display:flex; gap:10px; }
.rpgdev .dialogue li:hover { background: rgba(217,179,90,.12); }
.rpgdev .dialogue li .n { color: var(--gold); width:14px; flex:none; }
.rpgdev .dialogue li.off { opacity:.4; cursor:default; }
.rpgdev .dialogue li .tag { margin-left:auto; font-size:12px; color: var(--ink-dim); border:1px solid rgba(217,179,90,.3); border-radius:9px; padding:1px 7px; align-self:center; white-space:nowrap; }
.rpgdev .dialogue .hint { font-size:12px; color: var(--ink-dim); text-align:right; margin-top:6px; }
.rpgdev .prompt { left:50%; bottom:22%; transform:translateX(-50%); padding:7px 14px; font-size:15px; white-space:nowrap; }
.rpgdev .prompt b { font-family: var(--font-display); color: var(--gold); margin-right:8px; border:1px solid var(--panel-edge); padding:0 6px; border-radius:3px; }
.rpgdev .prompt .detail { color: var(--ink-dim); margin-left:8px; font-size:13px; }
.rpgdev .dev { right:16px; bottom:16px; width:220px; padding:10px 12px; }
.rpgdev .dev button { pointer-events:auto; display:block; width:100%; margin:4px 0; padding:5px 8px; font: 13px var(--font-body); color: var(--ink); background: rgba(217,179,90,.08); border:1px solid rgba(217,179,90,.3); border-radius:3px; text-align:left; cursor:pointer; }
.rpgdev .dev button:hover { background: rgba(217,179,90,.18); }
.rpgdev .crosshair { position:absolute; left:50%; top:50%; width:5px; height:5px; margin:-2.5px; border-radius:50%; background: rgba(255,248,230,.8); box-shadow:0 0 2px #000; }
`;

const BAR_COLORS = { health: '#b5402f', stamina: '#5d8a4a', pietas: '#c9a24a' } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function compassWord(deg: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function buildOverlay(game: Game, ui: HTMLElement, rpg: RpgServices, background: string) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el('div', 'rpgdev', ui);
  el('div', 'crosshair', root);
  const sheetCard = el('div', 'card sheet', root);
  const journal = el('div', 'card journal', root);
  const log = el('div', 'card log', root);
  const dialogueBox = el('div', 'card dialogue', root);
  const prompt = el('div', 'card prompt', root);
  const dev = el('div', 'card dev', root);
  dialogueBox.style.display = 'none';
  prompt.style.display = 'none';

  // ---- notifications
  const push = (text: string, kind = 'info') => {
    const d = el('div', kind, log);
    d.textContent = text;
    while (log.children.length > 7) log.firstChild!.remove();
    setTimeout(() => d.remove(), 8200);
  };
  game.events.on('rpg:notify', (e) => push(e.text, e.kind));
  game.events.on('quest:objective', (e) => {
    if (!e.done) return;
    const o = rpg.quests.objectives(e.questId).find((x) => x.id === e.objectiveId);
    if (o) push(`✓ ${o.text}`, 'quest');
  });
  game.events.on('item:added', (e) => {
    if (e.silent || e.source === 'start') return;
    const d = rpg.items.get(e.itemId);
    push(`${d?.name ?? e.itemId}${e.count > 1 ? ` ×${e.count}` : ''} added${e.stolen ? ' (stolen)' : ''}`, 'item');
  });

  // ---- dev actions
  dev.innerHTML = '<h3>Dev actions</h3>';
  const action = (label: string, fn: () => void) => {
    const b = el('button', undefined, dev);
    b.textContent = label;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      fn();
      game.canvas.focus();
    });
  };
  action('Quicksave  (F5)', () => void rpg.save.quicksave());
  action('Quickload  (F9)', () => void rpg.save.quickload());
  action('Read the sealed letter', () => (rpg.inventory.use('ex-letter') ? undefined : push('You have no letter to read.', 'warning')));
  action('Drink Falernian wine', () => (rpg.inventory.add('vinum-falernum', 1, { silent: true }), rpg.inventory.use('vinum-falernum')));
  action('Catch tertian fever', () => rpg.sheet.applyCondition('febris'));
  action('Steal a silver dish (seen)', () => {
    rpg.inventory.add('argentum', 1, { stolenFrom: 'ex-sextus' });
    rpg.crime.commit('furtum', { witnessed: true, value: 40, victimId: 'ex-sextus' });
  });
  action('Pay the fine', () => (rpg.crime.payFine() ? undefined : push('Nothing to pay, or not enough coin.', 'warning')));
  action('Sextus is murdered', () => game.events.emit('actor:killed', { victimId: 'ex-sextus' }));
  action('Take Mars Ultor as patron', () => {
    const r = rpg.devotion.choosePatron('patronus-mars');
    if (!r.ok) push(r.reason === 'same' ? 'Mars is already your patron.' : `Cannot change patron (${r.reason}).`, 'warning');
  });
  action('Invoke patron (Furor, 30 pietas)', () => {
    const r = rpg.devotion.invoke();
    if (!r.ok) push(r.reason === 'no-patron' ? 'Choose a patron first.' : 'Not enough pietas — pray at the shrine or the altar.', 'warning');
  });
  action('Gain 200 Blades XP', () => rpg.sheet.useSkill('blades', 200));

  // ---- dialogue
  const renderDialogue = (v: DialogueView | null) => {
    if (!v) {
      dialogueBox.style.display = 'none';
      game.input.enabled = true;
      return;
    }
    game.input.enabled = false;
    game.input.exitPointerLock();
    dialogueBox.style.display = '';
    const who = `<div class="who ${v.speaker === 'player' ? 'player' : ''}">${esc(v.speakerName)}</div>`;
    const text = `<div class="text">${esc(v.text)}</div>`;
    const list = v.choices
      .map((c, i) => `<li data-i="${i}" class="${c.enabled ? '' : 'off'}"><span class="n">${i + 1}</span><span>${esc(c.text)}</span>${c.tag ? `<span class="tag">${esc(c.tag)}</span>` : ''}</li>`)
      .join('');
    const hint = v.choices.length ? '1–9 choose · Esc leave' : v.canContinue ? 'Space — continue' : 'Space — close';
    dialogueBox.innerHTML = `${who}${text}${list ? `<ol>${list}</ol>` : ''}<div class="hint">${hint}</div>`;
  };
  rpg.dialogue.onChange(renderDialogue);
  dialogueBox.addEventListener('click', (ev) => {
    const li = (ev.target as HTMLElement).closest('li');
    if (li) rpg.dialogue.choose(Number(li.dataset.i));
  });
  window.addEventListener('keydown', (ev) => {
    if (!rpg.dialogue.active || ev.repeat) return;
    if (/^Digit[1-9]$/.test(ev.code)) rpg.dialogue.choose(Number(ev.code.slice(5)) - 1);
    else if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'KeyE') rpg.dialogue.view?.choices.length || rpg.dialogue.advance();
    else if (ev.code === 'Escape') rpg.dialogue.end();
    else return;
    ev.preventDefault();
  });

  // ---- interaction prompt
  const renderPrompt = (target: Interactable | null) => {
    if (!target) {
      prompt.style.display = 'none';
      return;
    }
    const detail = target.detail?.();
    prompt.innerHTML = `<b>E</b>${esc(target.verb())} — ${esc(target.label())}${detail ? `<span class="detail">${esc(detail)}</span>` : ''}`;
    prompt.style.display = '';
  };
  game.events.on('interact:focus', ({ target }) => renderPrompt(target));

  // ---- sheet + journal, refreshed ~8×/s
  const bgName = background;
  const renderSheet = () => {
    const s = rpg.sheet;
    const v = s.vitals;
    const bar = (id: 'health' | 'stamina' | 'pietas') => {
      const r = v.get(id);
      return `<div class="row"><span>${id[0].toUpperCase() + id.slice(1)}</span><span class="dim">${Math.round(r.current)} / ${Math.round(r.max)}</span></div><div class="bar"><i style="width:${(100 * r.current) / Math.max(1, r.max)}%;background:${BAR_COLORS[id]}"></i></div>`;
    };
    const top = [...s.skillDefsList()].sort((a, b) => s.skillLevel(b.id) - s.skillLevel(a.id)).slice(0, 3);
    const chips = s.activeEffects
      .map((a) => a.source)
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .map((src) => {
        const [kind, id] = src.split(':');
        const name = kind === 'invocation' ? (rpg.devotion.deity(id)?.invocation.name ?? id) : (s.conditionDef(id)?.name ?? rpg.items.get(id)?.name ?? id);
        const bad = kind === 'disease' || kind === 'poison' || kind === 'injury' || kind === 'omen';
        return `<span class="chip ${bad ? 'bad' : ''}">${esc(name)}</span>`;
      })
      .join('');
    const bounty = rpg.crime.totalBounty();
    const patron = rpg.devotion.patron;
    sheetCard.innerHTML =
      `<div class="row" style="align-items:baseline"><h3>Level ${s.level}</h3><span class="latin">${esc(bgName)}</span></div>` +
      `<div class="bar" style="height:3px;margin-top:0"><i style="width:${s.levelProgress * 100}%;background:var(--gold)"></i></div>` +
      bar('health') + bar('stamina') + bar('pietas') +
      `<div class="row"><span>Purse</span><span>${formatDenarii(rpg.inventory.denarii)}</span></div>` +
      `<div class="row"><span>Burden</span><span class="dim">${rpg.inventory.weight.toFixed(1)} / ${rpg.inventory.maxWeight} kg</span></div>` +
      `<div class="row" style="margin-top:4px"><span class="dim" style="font-size:12px">${top.map((d) => `${d.name} ${s.skillLevel(d.id)}`).join(' · ')}</span></div>` +
      (s.perkPoints ? `<div class="row"><span>Perk points</span><span>${s.perkPoints}</span></div>` : '') +
      `<div class="row"><span>Dignitas</span><span class="dim">${esc(rpg.standing.dignitas)}${patron ? ` · patron ${esc(patron.name)}` : ''}</span></div>` +
      (bounty ? `<div class="row" style="color:#e8a090"><span>Bounty</span><span>${bounty} d</span></div>` : '') +
      (chips ? `<div class="chips">${chips}</div>` : '');
  };

  const fwd = new THREE.Vector3();
  const renderJournal = () => {
    const id = rpg.quests.tracked;
    const latest = rpg.quests.list()[0];
    const q = id ? rpg.quests.list().find((x) => x.id === id) : latest;
    if (!q) {
      journal.innerHTML = `<h3>Journal</h3><div class="dim" style="font-size:14px">No quests yet. Eutychus the scribe is waiting by the Rostra.</div>`;
      return;
    }
    const objs = q.objectives
      .filter((o) => o.active || o.done)
      .map((o) => `<div class="obj ${o.done ? 'done' : ''}"><span class="box">${o.done ? '◆' : '◇'}</span><span>${esc(o.text)}${o.needed > 1 ? ` (${o.count}/${o.needed})` : ''}${o.optional ? ' <span class="latin">optional</span>' : ''}</span></div>`)
      .join('');
    let pointer = '';
    const m = rpg.quests.markers()[0];
    if (m) {
      const p = game.player.position;
      const dx = m.position.x - p.x;
      const dz = m.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      game.player.lookForward(fwd);
      const rel = Math.atan2(dx, -dz) - Math.atan2(fwd.x, -fwd.z);
      const bearing = (Math.atan2(dx, -dz) / DEG + 360) % 360;
      pointer = `<div class="pointer"><span class="arrow" style="transform:rotate(${rel}rad)">▲</span><span>${esc(m.text)}<br><span class="dim">${Math.round(dist)} m ${compassWord(bearing)}</span></span></div>`;
    }
    const status = q.status === 'running' ? '' : ` <span class="latin">— ${q.status}</span>`;
    journal.innerHTML = `<h3>Journal</h3><div class="title">${esc(q.title)}${status}</div><div class="latin">${esc(q.latin ?? '')}</div><div style="margin-top:6px">${objs}</div>${pointer}`;
  };

  let acc = 0;
  game.addSystem({
    name: 'rpgOverlay',
    priority: 900,
    lateUpdate(dt) {
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      renderSheet();
      renderJournal();
      renderPrompt(game.interactions.focus);
    },
  });
  renderSheet();
  renderJournal();
  push('Eutychus the scribe waits below the Rostra. Press E to talk.', 'info');
}

/** Gradient sky dome that follows the camera; its horizon matches the fog. */
function skyDome(game: Game, top: number, horizon: number) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;\n' +
      'void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.5)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    toneMapped: true,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  game.scene.add(dome);
  game.addSystem({ name: 'rpgSky', priority: 101, lateUpdate: () => dome.position.copy(game.camera.position) });
}

/** A floating gold diamond over the tracked objective. */
function questBeacon(game: Game, rpg: RpgServices) {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xf2c55c, transparent: true, opacity: 0.9 }));
  mesh.visible = false;
  game.scene.add(mesh);
  let t = 0;
  game.addSystem({
    name: 'rpgBeacon',
    priority: 95,
    lateUpdate(dt) {
      t += dt;
      const m = rpg.quests.markers()[0];
      mesh.visible = !!m;
      if (!m) return;
      const lift = m.target.kind === 'npc' ? 2.35 : 3.2;
      mesh.position.set(m.position.x, m.position.y + lift + Math.sin(t * 2.4) * 0.08, m.position.z);
      mesh.rotation.y = t * 1.6;
    },
  });
}

const scene: SceneDef = {
  title: 'RPG systems',
  description: 'Example quest, dialogue, sheet, inventory, crime and saving in a corner of the Forum',
  setup(game, ui) {
    const haze = 0xe2d6bd;
    game.scene.background = new THREE.Color(haze);
    game.scene.fog = new THREE.Fog(haze, 70, 340);
    skyDome(game, 0x6f9fd0, haze);
    buildForum(game);

    const player = setupPlayer(game, new THREE.Vector3(3, 0.05, 9), Math.PI);
    player.yaw = 0.3;
    player.pitch = -0.08;
    const { hemi, sun } = basicLights(game, () => player.root.position);
    // Late-morning Roman light: a warm sun and a pale bluish sky fill.
    sun.color.set(0xffe2b8);
    sun.intensity = 2.9;
    hemi.color.set(0xd6e4f2);
    hemi.groundColor.set(0x9a7a55);
    hemi.intensity = 0.95;

    if (!game.interactions) game.interactions = game.addSystem(new Interactions(game));
    const rpg = installRpg(game, { examples: true, background: 'veteranus' });
    spawnNpcs(game, rpg);
    questBeacon(game, rpg);
    buildOverlay(game, ui, rpg, BACKGROUNDS.find((b) => b.id === rpg.standing.origin)?.name ?? 'Citizen');
    game.events.on('save:loaded', () => game.world?.refreshAll?.());
  },
};
export default scene;
