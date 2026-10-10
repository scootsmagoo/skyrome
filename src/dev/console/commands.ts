/**
 * The console's commands, Bethesda-style: `tgm`, `tcl`, `coc`, `player.additem`, `killall`…
 * Each returns the lines to print. They act through the game's own services (combat, the
 * population, the RPG module, the game flow) and fail politely when one isn't installed.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { DIFFICULTY, type Difficulty } from '../../rpg/data/tuning';
import { ENEMY_IDS } from '../../combat/archetypes';
import { FIGHTS, startBout } from '../../game/bouts';
import { CommandTable, fuzzyFind, toggleArg } from './parse';
import { applyChoice, type GraphicsChoice } from '../../core/graphics';
import { textureCensus } from '../../gfx/textureCensus';

/** Session cheats (not saved, like Bethesda's). The console re-applies them every frame. */
export interface Cheats {
  god: boolean;
}

export interface ConsoleCtx {
  game: Game;
  cheats: Cheats;
  table: CommandTable<ConsoleCtx>;
  clear(): void;
}

const onOff = (on: boolean) => (on ? 'ON' : 'OFF');

/** The person under the crosshair (within 12 m, ±25°), else the nearest within 4 m. */
function aimed(game: Game) {
  const p = game.player;
  const pop = game.population;
  if (!p || !pop) return null;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  let best: { n: ReturnType<typeof pop.all>[number]; s: number } | null = null;
  for (const n of pop.all()) {
    if (n.dead) continue;
    const dx = n.position.x - p.position.x;
    const dz = n.position.z - p.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 12 || d < 0.01) continue;
    const cos = (dx * fx + dz * fz) / d;
    const inCone = cos > Math.cos((25 * Math.PI) / 180);
    if (!inCone && d > 4) continue;
    const s = d * (inCone ? 1 : 3);
    if (!best || s < best.s) best = { n, s };
  }
  return best?.n ?? null;
}

/** Kill someone the way the rules would (essential people are knocked out instead). */
function slay(game: Game, id: string): boolean {
  const combat = game.combat;
  const npc = game.population?.get(id);
  const c = combat?.core.get(id) ?? (npc ? combat?.adoptActor(npc) : undefined);
  if (c && combat) {
    if (c.essential) combat.core.knockout(c, combat.playerC);
    else combat.core.kill(c, combat.playerC);
    return true;
  }
  if (npc) {
    game.population.kill(npc);
    return true;
  }
  return false;
}

function places(game: Game): string[] {
  return [...(game.landmarks?.keys() ?? [])].sort();
}

export function builtinCommands(): CommandTable<ConsoleCtx> {
  const t = new CommandTable<ConsoleCtx>();
  t.add(
    {
      name: 'help',
      aliases: ['?', 'commands'],
      usage: '[command]',
      help: 'List the commands, or explain one',
      run: ([name], { table }) => {
        if (name) {
          const d = table.get(name);
          if (!d) return `No command "${name}".`;
          return [`${d.name}${d.usage ? ' ' + d.usage : ''}  ${d.help}`, ...(d.aliases?.length ? [`  also: ${d.aliases.join(', ')}`] : [])];
        }
        return ['Commands (Tab completes, ↑ ↓ recall, ` or Esc closes):', ...table.list.map((d) => `  ${(d.name + (d.usage ? ' ' + d.usage : '')).padEnd(26)} ${d.help}`)];
      },
    },
    {
      name: 'tgm',
      aliases: ['god', 'godmode'],
      usage: '[on|off]',
      help: 'God mode: no damage, endless stamina',
      run: ([a], { cheats }) => {
        cheats.god = toggleArg(a, cheats.god);
        return `God Mode -> ${onOff(cheats.god)}`;
      },
    },
    {
      name: 'tcl',
      aliases: ['noclip', 'fly'],
      usage: '[on|off]',
      help: 'No-clip: fly through walls (Space up, C down, Shift fast)',
      run: ([a], { game }) => {
        const p = game.player;
        if (!p) return 'No player.';
        const was = p.noclip;
        p.noclip = toggleArg(a, p.noclip);
        // Landing: let the controller find the ground under the new spot.
        if (was && !p.noclip) p.teleport(p.position.clone().setY(p.position.y + 0.3));
        return `Collision -> ${onOff(!p.noclip)}`;
      },
    },
    {
      name: 'tdo',
      aliases: ['debug', 'fps'],
      help: 'Debug overlay: fps, draw calls, position, CPU per system',
      run: (_a, { game }) => (game.debugOverlay ? `Debug overlay -> ${onOff(game.debugOverlay.toggle())}` : 'No debug overlay in this build.'),
    },
    {
      name: 'tex',
      aliases: ['textures'],
      help: 'Where the GPU textures come from (material maps, bone textures, BatchedMesh data)',
      run: (_a, { game }) => {
        const c = textureCensus(game.scene, game.renderer);
        return [
          `${c.total} textures: ${c.materialMaps} material maps, ${c.boneTextures} bone textures, ${c.batchedTextures} for ${c.batchedMeshes} BatchedMeshes (${c.tinyBatches} hold 8 instances or fewer), ${c.other} other.`,
        ];
      },
    },
    {
      name: 'heal',
      aliases: ['restore', 'restoreactorvalue'],
      help: 'Full health and stamina; cures poison, disease and injuries',
      run: (_a, { game }) => {
        const s = game.player?.sheet;
        if (!s) return 'No character.';
        s.vitals.set('health', s.vitals.health.max);
        s.vitals.set('stamina', s.vitals.stamina.max);
        for (const k of ['poison', 'disease', 'injury']) s.cure(k);
        s.cure('cruentus');
        return 'Healed.';
      },
    },
    {
      name: 'kill',
      help: 'Kill whoever is in front of you',
      run: (_a, { game }) => {
        const n = aimed(game);
        if (!n) return 'Nobody in front of you.';
        if (game.player) game.ragdolls?.noteHit(n.id, game.player.position, true);
        return slay(game, n.id) ? `Killed ${n.name ?? n.id}.` : `Could not kill ${n.id}.`;
      },
    },
    {
      name: 'knock',
      aliases: ['shove'],
      help: 'Knock down whoever is in front of you (they sprawl, then get up)',
      run: (_a, { game }) => {
        const n = aimed(game);
        const combat = game.combat;
        if (!n || !combat || !game.player) return 'Nobody in front of you.';
        const c = combat.core.get(n.id) ?? combat.adoptActor(n);
        if (!c) return `Could not knock ${n.id}.`;
        combat.core.knockdown(c, combat.playerC);
        game.ragdolls?.noteHit(n.id, game.player.position, true, true);
        return `Knocked down ${n.name ?? n.id}.`;
      },
    },
    {
      name: 'killall',
      usage: '[radius]',
      help: 'Kill everyone fighting you (within 60 m)',
      run: ([r], { game }) => {
        const combat = game.combat;
        const pc = combat?.playerC;
        const p = game.player;
        if (!combat || !pc || !p) return 'No combat in this build.';
        const radius = Number(r) > 0 ? Number(r) : 60;
        const foes = combat.core.list.filter((c) => c !== pc && c.status === 'active' && (c.target === pc || combat.core.hostile(c, pc)) && c.position.distanceTo(p.position) <= radius);
        for (const c of foes) slay(game, c.id);
        return foes.length ? `Killed ${foes.length}.` : 'Nobody is fighting you.';
      },
    },
    {
      name: 'spawn',
      aliases: ['placeatme'],
      usage: '<enemy> [count]',
      help: `Spawn enemies in front of you (${ENEMY_IDS.join(', ')})`,
      run: ([what, n], { game }) => {
        const combat = game.combat;
        const p = game.player;
        if (!combat || !p) return 'No combat in this build.';
        const id = fuzzyFind(what ?? '', ENEMY_IDS);
        if (!id) return `Spawn what? ${ENEMY_IDS.join(', ')}`;
        const count = Math.max(1, Math.min(8, Math.floor(Number(n) || 1)));
        const fx = -Math.sin(p.yaw);
        const fz = -Math.cos(p.yaw);
        for (let i = 0; i < count; i++) {
          const side = (i - (count - 1) / 2) * 1.6;
          const at = new THREE.Vector3(p.position.x + fx * 5 - fz * side, p.position.y, p.position.z + fz * 5 + fx * side);
          combat.spawnEnemy(id, at, { engage: true });
        }
        return `Spawned ${count} ${id}.`;
      },
    },
    {
      name: 'coc',
      aliases: ['tp', 'goto', 'centeronworld'],
      usage: '<place>',
      help: 'Teleport to a landmark (coc alone lists them)',
      run: async ([where], { game }) => {
        const ids = places(game);
        if (!where) return ['Places:', ...chunk(ids, 4).map((r) => '  ' + r.join(', '))];
        const id = fuzzyFind(where, ids, (k) => game.landmarks.get(k)?.lm.name);
        if (!id) return `No place like "${where}". Type coc to list them.`;
        if (!game.flow) return 'No game flow.';
        await game.flow.spawnAt(game.flow.spawnPoint(id));
        return `To ${game.landmarks.get(id)?.lm.name ?? id}.`;
      },
    },
    {
      name: 'fight',
      usage: '<nereus|auctus|pullus>',
      help: 'Go to the Ludus and start that bout',
      run: async ([who], { game }) => {
        const n = FIGHTS.indexOf(fuzzyFind(who ?? 'nereus', FIGHTS) ?? '') + 1;
        if (!n) return `Fight whom? ${FIGHTS.join(', ')}`;
        if (game.flow) await game.flow.spawnAt(game.flow.spawnPoint('ludus-magnus'));
        return (await startBout(game, n)) ? `${FIGHTS[n - 1]}: the bout begins.` : 'The Oath is already finished in this game: reload with ?fight=' + FIGHTS[n - 1];
      },
    },
    {
      name: 'additem',
      aliases: ['give'],
      usage: '<item> [count]',
      help: 'Add an item (by id or name; see items)',
      run: ([what, n], { game }) => {
        const rpg = game.rpg;
        if (!rpg) return 'No inventory in this build.';
        const all = rpg.items.all();
        const id = fuzzyFind(what ?? '', all.map((d) => d.id), (k) => rpg.items.get(k)?.name);
        if (!id) return `No item like "${what ?? ''}". Type items to list them.`;
        const count = Math.max(1, Math.floor(Number(n) || 1));
        rpg.inventory.add(id, count);
        return `Added ${count} × ${rpg.items.get(id)?.name ?? id}.`;
      },
    },
    {
      name: 'items',
      usage: '[filter]',
      help: 'List item ids',
      run: ([f], { game }) => {
        const all = game.rpg?.items.all() ?? [];
        const q = (f ?? '').toLowerCase();
        const hit = all.filter((d) => !q || d.id.includes(q) || d.name.toLowerCase().includes(q));
        return hit.length ? hit.slice(0, 60).map((d) => `  ${d.id.padEnd(28)} ${d.name}`).concat(hit.length > 60 ? [`  …and ${hit.length - 60} more`] : []) : 'No items match.';
      },
    },
    {
      name: 'gold',
      aliases: ['money', 'denarii'],
      usage: '<amount>',
      help: 'Add denarii',
      run: ([n], { game }) => {
        const inv = game.rpg?.inventory;
        const amount = Number(n) || 100;
        if (!inv) return 'No purse in this build.';
        inv.addDenarii(amount);
        return `+${amount} denarii (now ${Math.floor(inv.denarii)}).`;
      },
    },
    {
      name: 'sethour',
      aliases: ['time'],
      usage: '<0-24>',
      help: 'Set the hour (set gamehour to 20 works too)',
      run: ([h], { game }) => {
        const hour = Number(h);
        if (!Number.isFinite(hour) || hour < 0 || hour > 24) return `It is ${game.time.hour.toFixed(2)}h. sethour <0-24> changes it.`;
        game.time.advanceHours((((hour - game.time.hour) % 24) + 24) % 24);
        return `It is now ${game.time.formatModern()}.`;
      },
    },
    {
      name: 'munus',
      aliases: ['games'],
      usage: '[next|lusio]',
      help: 'The games in the Colosseum: today\'s show, or call the next pair now',
      run: ([arg], { game }) => {
        const m = game.munus;
        if (!m) return 'No games in this build.';
        if (arg === 'next' || arg === 'lusio') return m.nextBout(arg === 'lusio') ? `Next pair called. ${m.status()}` : 'Can\'t stage a bout now (no Colosseum or no combat).';
        return m.status();
      },
    },
    {
      name: 'clearbounty',
      aliases: ['paycrimegold', 'pardon'],
      help: 'Forget every bounty; the watch stands down',
      run: (_a, { game }) => {
        const crime = game.rpg?.crime;
        if (!crime) return 'No law in this build.';
        const total = crime.totalBounty();
        for (const l of crime.ledgers()) crime.clear(l.id, 'pardon');
        game.combat?.clearAggressor?.();
        return total ? `Pardoned (${Math.round(total)} denarii of bounty).` : 'No bounty to clear.';
      },
    },
    {
      name: 'difficulty',
      usage: `<${Object.keys(DIFFICULTY).join('|')}>`,
      help: 'Set the difficulty',
      run: ([d], { game }) => {
        const keys = Object.keys(DIFFICULTY) as Difficulty[];
        const id = fuzzyFind(d ?? '', keys) as Difficulty | null;
        const cur = (game.settings.data as { difficulty?: Difficulty }).difficulty ?? 'normalis';
        if (!id) return `Difficulty is ${DIFFICULTY[cur].name}. Choose: ${keys.join(', ')}`;
        game.settings.set('difficulty' as never, id as never);
        return `Difficulty -> ${DIFFICULTY[id].name}.`;
      },
    },
    {
      name: 'gore',
      usage: '<off|normal|ultra>',
      help: 'Blood and dismemberment',
      run: ([g], { game }) => {
        const v = fuzzyFind(g ?? '', ['off', 'normal', 'ultra']);
        if (!v) return `Gore is ${(game.settings.data as { gore?: string }).gore ?? 'ultra'}. Choose off, normal or ultra.`;
        game.settings.set('gore' as never, v as never);
        return `Gore -> ${v}.`;
      },
    },
    {
      name: 'graphics',
      aliases: ['gpu', 'quality'],
      usage: '[auto|low|medium|high]',
      help: 'Show the graphics card and quality tier, or change the tier',
      run: ([t], { game }) => {
        const choice = fuzzyFind(t ?? '', ['auto', 'low', 'medium', 'high']) as GraphicsChoice | null;
        if (choice) applyChoice(game, choice);
        const s = game.settings.data;
        const gpu = game.gpu;
        return [
          `GPU: ${gpu?.name || 'unknown'}${gpu?.software ? ' (SOFTWARE: hardware acceleration is off)' : ''}`,
          `Quality: ${s.graphics ?? 'auto'}${(s.graphics ?? 'auto') === 'auto' && s.graphicsApplied ? ` → ${s.graphicsApplied.tier} (by ${s.graphicsApplied.by === 'fps' ? 'frame rate' : 'graphics card'})` : ''}`,
          `Render scale ${s.renderScale} · pixel ratio ≤ ${s.maxPixelRatio} · shadows ${s.shadows} · view ${s.viewDistance} m · ${s.maxFps || 'unlimited'} fps · crowd ×${s.crowdDensity ?? 1}`,
        ];
      },
    },
    {
      name: 'pos',
      aliases: ['getpos', 'where'],
      help: 'Where you are',
      run: (_a, { game }) => {
        const p = game.player?.position;
        return p ? `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}` : 'No player.';
      },
    },
    {
      name: 'clear',
      aliases: ['cls'],
      help: 'Clear the console',
      run: (_a, ctx) => ctx.clear(),
    },
  );
  return t;
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
