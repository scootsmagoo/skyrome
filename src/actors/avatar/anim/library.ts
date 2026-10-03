/**
 * Clip registry: compiles every clip once (lazily) and shares it between all avatars.
 */
import type { IdleLoop, Stance } from '../../Actor';
import { bakeClip, type CompiledClip } from './clip';
import { DIRECTIONS, GAITS, bakeGait, type GaitName } from './gait';
import { actionDefs, type ActionDef } from './actions';
import { airDefs, idleLoopDefs, stanceIdle } from './idles';
import { BLOCK, hasShield, stancePose, weaponClass } from './poses';

export interface ActionInfo extends Omit<ActionDef, 'def'> {
  clip: CompiledClip;
}

const gaitCache = new Map<string, CompiledClip>();
const stanceCache = new Map<string, CompiledClip>();
const actionCache = new Map<Stance, Map<string, ActionInfo>>();
const actionDefCache = new Map<Stance, Record<string, ActionDef>>();
let loops: Record<IdleLoop, CompiledClip> | null = null;
let air: { jump: CompiledClip; fall: CompiledClip } | null = null;
const blockCache = new Map<Stance, CompiledClip>();

export const STANCES: readonly Stance[] = ['unarmed', 'oneHand', 'oneHandShield', 'twoHand', 'spear', 'spearShield', 'bow'];

/** Locomotion cycle for a gait and one of the 8 directions (index into DIRECTIONS). */
export function gaitClip(gait: GaitName, dir: number): CompiledClip {
  const key = `${gait}:${dir}`;
  let c = gaitCache.get(key);
  if (!c) {
    c = bakeGait(`${gait}:${DIRECTIONS[dir]}`, GAITS[gait], DIRECTIONS[dir]);
    gaitCache.set(key, c);
  }
  return c;
}

export function stanceIdleClip(stance: Stance, drawn: boolean, sneak = false, togate = false): CompiledClip {
  const key = `${stance}:${drawn}:${sneak}:${togate && !drawn}`;
  let c = stanceCache.get(key);
  if (!c) {
    c = bakeClip(stanceIdle(stance, drawn, sneak, togate && !drawn));
    stanceCache.set(key, c);
  }
  return c;
}

export function blockClip(stance: Stance): CompiledClip {
  let c = blockCache.get(stance);
  if (!c) {
    const sp = stancePose(stance, true);
    const pose = { ...sp.pose, ...(hasShield(stance) ? BLOCK.shield : BLOCK[weaponClass(stance)]) };
    c = bakeClip({ name: `block:${stance}`, duration: 1, loop: true, base: pose, keys: [{ t: 0, pose, feet: sp.feet }] });
    blockCache.set(stance, c);
  }
  return c;
}

function defsFor(stance: Stance) {
  let d = actionDefCache.get(stance);
  if (!d) {
    d = actionDefs(stance);
    actionDefCache.set(stance, d);
  }
  return d;
}

/** Action by name (e.g. 'attackLight1', 'drawWeapon:hipR') for a stance, or undefined. */
export function actionInfo(stance: Stance, name: string): ActionInfo | undefined {
  let m = actionCache.get(stance);
  if (!m) {
    m = new Map();
    actionCache.set(stance, m);
  }
  let a = m.get(name);
  if (!a) {
    const def = defsFor(stance)[name];
    if (!def) return undefined;
    const { def: clipDef, ...meta } = def;
    a = { ...meta, clip: bakeClip(clipDef) };
    m.set(name, a);
  }
  return a;
}

export function actionNames(stance: Stance): string[] {
  return Object.keys(defsFor(stance));
}

export function idleLoopClip(loop: IdleLoop): CompiledClip {
  if (!loops) {
    const defs = idleLoopDefs();
    loops = Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, bakeClip(d)])) as Record<IdleLoop, CompiledClip>;
  }
  return loops[loop];
}

export function airClips() {
  if (!air) {
    const d = airDefs();
    air = { jump: bakeClip(d.jump), fall: bakeClip(d.fall) };
  }
  return air;
}

/** Bake everything up front (e.g. behind a loading screen) so the first use never hitches. */
export function warmUpAnimations(stances: readonly Stance[] = STANCES) {
  for (const g of Object.keys(GAITS) as GaitName[]) for (let d = 0; d < DIRECTIONS.length; d++) if (g !== 'sprint' && g !== 'turn' || d === 0) gaitClip(g, d);
  for (const s of stances) {
    stanceIdleClip(s, false);
    stanceIdleClip(s, true);
    stanceIdleClip(s, false, true);
    stanceIdleClip(s, true, true);
    blockClip(s);
    for (const n of actionNames(s)) actionInfo(s, n);
  }
  idleLoopClip('stand');
  airClips();
}
