/**
 * The palcirc landmarks' spots made into things the player can do (palcirc crew), once the
 * running game's services exist:
 *
 *  - 'inscription' → Read: the Latin as carved and an English reading in the book reader
 *    (PALCIRC_INSCRIPTIONS);
 *  - 'vista'       → Look out: a banner with the view's name and one line (PALCIRC_VISTAS);
 *  - 'shrine'      → Pray at an altar (a temple prayer, with an offering: a honey cake, a pinch of
 *                    incense or a denarius), at the crossroads shrine (the Lares), or at a spring;
 *                    Drink at a fountain (PALCIRC_SHRINES);
 *  - 'vendor'      → Buy a cup of house wine or a loaf over the counter.
 *
 * Interactions are queued in world space when a landmark is built (builders run before the
 * interaction system and the RPG are installed) and handed over by a tiny System that removes
 * itself. Ids are `palcirc:<spot id>`. Everything is a no-op without a running game.
 */
import * as THREE from 'three';
import type { Game, System } from '../../../../core/Game';
import type { Interactable } from '../../../../interaction/Interactions';
import type { RpgServices } from '../../../../rpg/install';
import type { LandmarkContext, Spot } from '../../types';
import { PALCIRC_INSCRIPTIONS, PALCIRC_SHRINES, PALCIRC_VISTAS, vendorItem } from './texts';
import { landmarkToWorld } from './util';
import { bearingToRotationY } from '../../../../core/math';

interface Pending {
  items: Interactable[];
  system: System | null;
}

const pending = new WeakMap<object, Pending>();

function live(game: Game | undefined): Game | null {
  return game && typeof (game as { addSystem?: unknown }).addSystem === 'function' && (game as { scene?: unknown }).scene && typeof document !== 'undefined' ? game : null;
}

const rpgOf = (g: Game) => (g as Game & { rpg?: RpgServices }).rpg;

function say(g: Game, text: string, kind: 'info' | 'warning' = 'info') {
  g.ui?.notify(text, kind);
}

/** The point a reader looks at: ~1.4 m up, `ahead` metres along the spot's heading. */
function aim(p: THREE.Vector3, heading: number, ahead: number, up: number) {
  return p.clone().add(new THREE.Vector3(Math.sin(heading) * ahead, up, Math.cos(heading) * ahead));
}

/** The interaction for one world-space spot, or null when the spot is not a thing to do. */
export function spotInteraction(s: Spot, game?: Game): Interactable | null {
  const id = `palcirc:${s.id}`;
  const h = s.heading ?? 0;
  if (s.kind === 'inscription') {
    const t = PALCIRC_INSCRIPTIONS[s.id];
    if (!t) return null;
    const p = aim(s.position, h, 1.0, 1.4);
    return {
      id,
      position: () => p,
      reach: 3.2,
      verb: () => 'Read',
      label: () => t.title,
      interact: (g) => g.ui?.openBook({ title: t.title, kind: 'tablet', text: `${t.latin.split(' — ').join('\n')}\n\n*${t.english}*` }),
    };
  }
  if (s.kind === 'vista') {
    const v = PALCIRC_VISTAS[s.id];
    if (!v) return null;
    const p = aim(s.position, h, 0.6, 1.5);
    return {
      id,
      position: () => p,
      reach: 2.6,
      verb: () => 'Look out',
      label: () => v.title,
      interact: (g) => g.ui?.banner({ kind: 'generic', label: 'Vista', title: v.title, subtitle: v.line, duration: 7 }),
    };
  }
  if (s.kind === 'shrine') {
    const sh = PALCIRC_SHRINES[s.id];
    if (!sh) return null;
    const p = aim(s.position, h, 1.0, 1.1);
    const offering = (g: Game) => {
      const inv = rpgOf(g)?.inventory;
      if (!inv) return null;
      if (inv.has('libum')) return { itemId: 'libum', name: 'a honey cake' };
      if (inv.has('tus')) return { itemId: 'tus', name: 'a pinch of incense' };
      return { denarii: 1, name: '1 denarius' };
    };
    return {
      id,
      position: () => p,
      reach: 3.0,
      verb: () => (sh.act === 'drink' ? 'Drink' : 'Pray'),
      label: () => sh.name,
      detail: () => {
        if (sh.act !== 'temple' || !game) return null;
        const o = offering(game);
        return o ? `Offer ${o.name}` : null;
      },
      interact: (g) => {
        const rpg = rpgOf(g);
        if (sh.act === 'compitum' && rpg) {
          rpg.devotion.prayAtCompitum(s.id);
          say(g, `You pray at the ${sh.name}.`);
          return;
        }
        if (sh.act === 'temple' && rpg) {
          const o = offering(g)!;
          const r = rpg.devotion.prayAtTemple(sh.temple ?? s.id, o.itemId ? { itemId: o.itemId } : { denarii: o.denarii });
          if (!r.ok) say(g, r.reason === 'closed' ? 'The temples are closed.' : 'You have nothing to offer.', 'warning');
          else say(g, `You offer ${o.name} at the ${sh.name}. ${sh.line}`);
          return;
        }
        say(g, sh.act === 'drink' ? sh.line : `You pray at the ${sh.name}. ${sh.line}`);
      },
    };
  }
  if (s.kind === 'vendor') {
    const v = vendorItem(s.id);
    if (!v) return null;
    // The counter is between the vendor and the street: aim at it, half a metre in front.
    const p = aim(s.position, h, 0.9, 1.1);
    const price = (g: Game) => rpgOf(g)?.inventory.items.get(v.item)?.value ?? 1 / 16;
    return {
      id,
      position: () => p,
      reach: 2.8,
      verb: () => 'Buy',
      label: () => v.label,
      detail: () => (game ? `${Math.max(1, Math.round(price(game) * 16))} ${Math.round(price(game) * 16) === 1 ? 'as' : 'asses'}` : null),
      interact: (g) => {
        const inv = rpgOf(g)?.inventory;
        if (!inv) return;
        if (inv.spendDenarii(price(g))) inv.add(v.item, 1, { source: 'barter' });
        else say(g, `You cannot afford it.`, 'warning');
      },
    };
  }
  return null;
}

/** Queue the interactions of a landmark's LOCAL spots (call once, after the spots are final). */
export function palcircLife(ctx: LandmarkContext, spots: readonly Spot[] | undefined) {
  const game = live(ctx.game);
  if (!game || !spots?.length) return;
  const m = landmarkToWorld(ctx);
  const rotY = bearingToRotationY(ctx.lm.rotation);
  const q = queue(game);
  for (const s of spots) {
    const it = spotInteraction({ ...s, position: s.position.clone().applyMatrix4(m), heading: (s.heading ?? 0) + rotY }, game);
    if (it) q.items.push(it);
  }
}

function queue(game: Game): Pending {
  let q = pending.get(game);
  if (!q) {
    q = { items: [], system: null };
    pending.set(game, q);
  }
  if (!q.system) {
    const p = q;
    let frames = 0;
    const sys: System & { name: string } = {
      name: 'palcirc-life',
      priority: 94,
      lateUpdate() {
        if (++frames < 2) return;
        if (game.interactions) {
          for (const it of p.items) game.interactions.add(it);
          p.items.length = 0;
        }
        if (!p.items.length || frames > 36_000) {
          game.removeSystem(sys);
          p.system = null;
        }
      },
    };
    q.system = sys;
    game.addSystem(sys);
  }
  return q;
}
