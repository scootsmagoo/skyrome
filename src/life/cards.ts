/**
 * Cards (docs/design/world-life.md §3.3 "Cards", "Boards"): things with E. Each ActivityDef — a
 * fountain, a bench, a notice board, a bed — becomes an interactable while the player is within
 * 60 m, and E opens a "card" in the conversation panel: `game.dialogue.start(id, { name,
 * dialogueId: 'life:' + id })`. Its options are choices (taken through game.life.apply); `needs`
 * shows a choice off with its reason; an activity with one option and no intro runs at once with
 * a toast instead of the panel.
 *
 * A notice board's card lists 2–4 of today's notices for its board (at most 2 hooks); reading a
 * hooked one offers "Note it down", which starts the quest (journal only while the main quest
 * runs). A board on a builder's spot takes over that spot's "Read" prompt (`replaces`) while it is
 * there, and gives it back when it goes.
 *
 * Positions are stored vectors (position() allocates nothing); everything is updated at 2 Hz.
 */
import * as THREE from 'three';
import { rotate } from '../content/talk';
import type { Game } from '../core/Game';
import { LANDMARK_BY_ID } from '../data/atlas';
import type { DialogueChoice, DialogueDef, DialogueNode } from '../dialogue/types';
import type { Interactable } from '../interaction/Interactions';
import { STATIONS, stationAnchor, stationPoint } from '../npc/crowd/stations';
import { streetsOf } from '../npc/hooks';
import { toGame } from '../world/coords';
import { inHours, passes, questDone, questNotStarted } from './gates';
import { hash32, OPENING } from './rumours';
import { jobRuntime, optionChoices, RESULT_NODE, resultNode, setResult } from './talk';
import type { ActivityDef, OptionDef, RumourDef } from './types';

/** Things are registered within this distance of the player (m). */
const NEAR = 60;
/** At most this many notices on a board's card. */
const BOARD_SLOTS = 4;

/** What cards need from the life service. */
export interface CardHost {
  visible(o: OptionDef): boolean;
  apply(owner: string, o: OptionDef): { ok: boolean; why?: string; text: string };
  notices(board: string): RumourDef[];
}

interface ThingRt {
  def: ActivityDef;
  at: THREE.Vector3 | null;
  it: Interactable | null;
  registered: boolean;
  /** The builder's prompt this thing replaces, taken out while this one is there. */
  replaced: Interactable | null;
  verb: string;
}

interface Slot {
  at: THREE.Vector3;
  it: Interactable;
  registered: boolean;
}

interface FountainRt {
  def: ActivityDef;
  slots: Slot[];
}

export class Cards {
  private readonly things: ThingRt[] = [];
  private readonly fountains: FountainRt[] = [];
  private readonly byId = new Map<string, ActivityDef>();
  /** Street fountains (deduplicated), read once from the street graph. */
  private spots: THREE.Vector3[] | null = null;
  private spotsFrom: unknown = null;
  private readonly picked: { d: number; p: THREE.Vector3 }[] = [];

  constructor(
    private readonly game: Game,
    acts: readonly ActivityDef[],
    private readonly host: CardHost,
  ) {
    for (const def of acts) {
      this.byId.set(def.id, def);
      if ('streetSpots' in def.at) {
        const max = def.at.max ?? 6;
        const slots: Slot[] = [];
        for (let i = 0; i < max; i++) {
          const at = new THREE.Vector3();
          slots.push({ at, registered: false, it: this.interactable(`${def.id}#${i}`, def, at, () => def.verb) });
        }
        this.fountains.push({ def, slots });
      } else this.things.push({ def, at: null, it: null, registered: false, replaced: null, verb: def.verb });
    }
  }

  /** The cards' conversations (registered with game.dialogue at install). */
  dialogues(): DialogueDef[] {
    return [...this.byId.values()].map((a) => this.card(a));
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** What E does on a thing (tests and the console call it too). False when shut or gated. */
  open(id: string): boolean {
    const def = this.byId.get(id);
    const g = this.game;
    if (!def || !passes(def.gate, g)) return false;
    if (def.open && !inHours(def.open, g.time.hour)) {
      g.ui?.flash(def.closedText ?? 'Closed.');
      return false;
    }
    const opts = (def.options ?? []).filter((o) => this.host.visible(o));
    if (!def.board && !def.intro && def.options?.length === 1) {
      // One option and nothing to read: it just happens, with a toast.
      if (!opts.length) return false;
      const r = this.host.apply(def.id, opts[0]);
      if (r.ok) g.events.emit('rpg:notify', { text: r.text, kind: 'info' });
      else g.ui?.flash(r.why ?? 'Not now.');
      return r.ok;
    }
    return !!g.dialogue?.start(def.id, { name: def.name, dialogueId: `life:${def.id}` });
  }

  /** Where to stand for a thing (a fountain: the nearest one to the player), and the thing. */
  where(id: string, px: number, pz: number): { stand: { x: number; z: number }; look: { x: number; z: number } } | null {
    const def = this.byId.get(id);
    if (!def) return null;
    if ('streetSpots' in def.at) {
      let best: THREE.Vector3 | null = null;
      for (const p of this.fountainSpots()) if (!best || Math.hypot(p.x - px, p.z - pz) < Math.hypot(best.x - px, best.z - pz)) best = p;
      return best ? { stand: { x: best.x + 2, z: best.z }, look: best } : null;
    }
    const p = this.resolve(def);
    if (!p) return null;
    if ('landmarkSpot' in def.at) {
      // Stand where the reader stands.
      const sp = this.landmarkSpot(def.at.landmarkSpot);
      if (sp) return { stand: { x: sp.position.x, z: sp.position.z }, look: p };
    }
    let dx = 0;
    let dz = 1;
    if ('station' in def.at) {
      // From a stall toward its street (the station's anchor), else straight out from its frontage.
      const st = STATIONS.find((s) => s.id === (def.at as { station: string }).station);
      const a = st ? stationAnchor(st) : null;
      if (a) {
        const l = Math.hypot(a.x - p.x, a.z - p.z);
        [dx, dz] = l > 0.5 ? [(a.x - p.x) / l, (a.z - p.z) / l] : [a.ox, a.oz];
      }
    }
    return { stand: { x: p.x + dx * 2.5, z: p.z + dz * 2.5 }, look: p };
  }

  /** Life interactables registered now. */
  get registered(): number {
    let n = 0;
    for (const t of this.things) if (t.registered) n++;
    for (const f of this.fountains) for (const s of f.slots) if (s.registered) n++;
    return n;
  }

  /** Register what is near and allowed, drop what isn't (2 Hz). */
  tick(px: number, pz: number) {
    const ia = this.game.interactions;
    if (!ia) return;
    const hour = this.game.time.hour;
    for (const t of this.things) {
      if (!t.at) t.at = this.resolve(t.def);
      const near = !!t.at && Math.hypot(t.at.x - px, t.at.z - pz) < NEAR;
      const want = near && passes(t.def.gate, this.game);
      if (want) {
        t.verb = t.def.open && !inHours(t.def.open, hour) ? 'Closed' : t.def.verb;
        if (!t.it) t.it = this.interactable(t.def.id, t.def, t.at!, () => t.verb);
        if (!t.registered) {
          ia.add(t.it);
          t.registered = true;
        }
        // The builder's own prompt may only appear once the world has finished building.
        const rep = 'replaces' in t.def.at ? t.def.at.replaces : undefined;
        if (rep && !t.replaced) {
          const old = ia.get(rep);
          if (old) {
            ia.remove(old);
            t.replaced = old;
            // Where the builder put the thing read is where this one is read too.
            t.at!.copy(old.position());
          }
        }
      } else if (t.registered) {
        ia.remove(t.it!);
        t.registered = false;
        if (t.replaced) {
          ia.add(t.replaced);
          t.replaced = null;
        }
      }
    }
    if (this.fountains.length) this.tickFountains(px, pz);
  }

  /** Take everything away (and give back what was replaced). */
  clear() {
    const ia = this.game.interactions;
    for (const t of this.things) {
      if (t.registered) ia?.remove(t.it!);
      t.registered = false;
      if (t.replaced) ia?.add(t.replaced);
      t.replaced = null;
    }
    for (const f of this.fountains) for (const s of f.slots) if (s.registered) (ia?.remove(s.it), (s.registered = false));
  }

  /** The street fountains nearest the player (up to each activity's max) carry its prompt. */
  private tickFountains(px: number, pz: number) {
    const ia = this.game.interactions!;
    const spots = this.fountainSpots();
    const picked = this.picked;
    picked.length = 0;
    for (const p of spots) {
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < NEAR) picked.push({ d, p });
    }
    picked.sort((a, b) => a.d - b.d);
    for (const f of this.fountains) {
      const ok = passes(f.def.gate, this.game);
      f.slots.forEach((s, i) => {
        const hit = ok ? picked[i] : undefined;
        if (hit) {
          s.at.copy(hit.p);
          if (!s.registered) {
            ia.add(s.it);
            s.registered = true;
          }
        } else if (s.registered) {
          ia.remove(s.it);
          s.registered = false;
        }
      });
    }
  }

  /** Fountain spots from the street graph, merged when closer than 2.5 m (a basin has two). */
  private fountainSpots(): THREE.Vector3[] {
    const streets = streetsOf(this.game);
    const raw = streets?.spots;
    if (this.spots && this.spotsFrom === raw) return this.spots;
    const out: THREE.Vector3[] = [];
    for (const s of raw ?? []) {
      if (s.kind !== 'fountain') continue;
      const p = s.position;
      if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.5)) continue;
      out.push(new THREE.Vector3(p.x, (p.y ?? this.floor(p.x, p.z) ?? 0) + 0.2, p.z));
    }
    this.spotsFrom = raw;
    this.spots = out;
    return out;
  }

  private interactable(id: string, def: ActivityDef, at: THREE.Vector3, verb: () => string): Interactable {
    return { id, position: () => at, reach: def.reach ?? 2.6, verb, label: () => def.name, interact: () => void this.open(def.id) };
  }

  /** Where a thing is (null until its place, landmark or station has been built). */
  private resolve(def: ActivityDef): THREE.Vector3 | null {
    const at = def.at;
    const g = this.game;
    if ('place' in at) {
      let x: number | undefined;
      let z: number | undefined;
      const loc = g.locations?.get(at.place);
      if (loc) ({ x, z } = loc.position);
      else if (LANDMARK_BY_ID[at.place]) [x, z] = toGame(LANDMARK_BY_ID[at.place].center[0], LANDMARK_BY_ID[at.place].center[1]);
      else {
        const sp = this.landmarkSpot(at.place);
        if (sp) ({ x, z } = sp.position);
      }
      if (x === undefined || z === undefined) return null;
      x += at.dx ?? 0;
      z += at.dz ?? 0;
      const y = this.floor(x, z);
      return y === null ? null : new THREE.Vector3(x, y + 1.0, z);
    }
    if ('landmarkSpot' in at) {
      // A reading spot is where the reader stands, facing the thing: it is ~1.2 m on and 1.4 m up.
      const sp = this.landmarkSpot(at.landmarkSpot);
      if (!sp) return null;
      const h = sp.heading ?? 0;
      return new THREE.Vector3(sp.position.x + Math.sin(h) * 1.2, sp.position.y + 1.4, sp.position.z + Math.cos(h) * 1.2);
    }
    if ('station' in at) {
      const st = STATIONS.find((s) => s.id === at.station);
      const d = st?.dressing?.[at.dressing];
      const a = st ? stationAnchor(st) : null;
      if (!d || !a) return null;
      const p = stationPoint(a, d.out, d.side);
      const y = this.floor(p.x, p.z);
      return y === null ? null : new THREE.Vector3(p.x, y + 0.9, p.z);
    }
    return null;
  }

  /** A landmark's spot by 'landmark:spot', or by its bare spot id (the first landmark that has it). */
  private landmarkSpot(ref: string): { position: THREE.Vector3; heading?: number } | null {
    const lms = this.game.landmarks;
    if (!lms) return null;
    const i = ref.indexOf(':');
    if (i > 0) {
      const lm = lms.get(ref.slice(0, i));
      const sp = lm?.spots.find((s) => s.id === ref.slice(i + 1)) ?? lm?.spots.find((s) => s.id === ref);
      if (sp) return sp;
    }
    for (const lm of lms.values()) {
      const sp = lm.spots.find((s) => s.id === ref);
      if (sp) return sp;
    }
    return null;
  }

  private floor(x: number, z: number): number | null {
    const g = this.game;
    const y = g.population?.floorY(x, z);
    if (y !== null && y !== undefined) return y;
    return g.heightmap ? g.heightmap.heightAt(x, z) : null;
  }

  // ---------------------------------------------------------------- the card

  /** The conversation of a thing: its intro, its options, its notices. */
  private card(def: ActivityDef): DialogueDef {
    const nodes: Record<string, DialogueNode> = { [RESULT_NODE]: resultNode(def.id, 'card') };
    const choices: DialogueChoice[] = [...optionChoices(def.id, def.options)];
    const board = def.board;
    if (board) {
      for (let i = 0; i < BOARD_SLOTS; i++) {
        const notice = () => this.today(board)[i];
        choices.push({ text: () => `“${headline(notice()?.text ?? '')}”`, if: () => !!notice(), goto: `notice${i}` });
        nodes[`notice${i}`] = {
          text: () => {
            const n = notice();
            return n ? `${n.latin ? `${n.latin}\n\n` : ''}${n.text}` : 'The plaster is bare.';
          },
          choices: [
            {
              text: 'Note it down.',
              if: (c) => {
                const n = notice();
                if (!n?.hook || !questDone(c.game, OPENING) || !questNotStarted(c.game, n.hook)) return false;
                // A job's notice is noted down only while its giver could offer it (its hours, the
                // daily cap): starting it here must not skip the job's own offer rules.
                const job = jobRuntime(n.hook);
                return !job || job.offerable(c.game);
              },
              effects: (c) => {
                const n = notice();
                const ok = !!n?.hook && !!c.game.quests?.start(n.hook);
                setResult(def.id, ok ? 'You copy it onto your tablet, word for word.' : 'You read it again, and leave it.');
              },
              goto: RESULT_NODE,
            },
            { text: 'Read another.', goto: 'card' },
            { text: 'Leave.', end: true },
          ],
        };
      }
    }
    choices.push({ text: 'Leave.', end: true });
    nodes.card = {
      text: (c) => {
        const intro = typeof def.intro === 'string' ? def.intro : def.intro?.length ? rotate(c, '_intro', def.intro) : '';
        if (!board) return intro || def.name;
        const none = this.today(board).length ? '' : 'Nothing new has been painted today.';
        return [intro, none].filter(Boolean).join('\n\n') || def.name;
      },
      choices,
    };
    return { id: `life:${def.id}`, npcs: [def.id], start: () => 'card', nodes };
  }

  /** Today's notices on a board: 2 to 4 of them, picked by the day. */
  private today(board: string): RumourDef[] {
    const n = 2 + (hash32(`${this.game.time.dayIndex}|${board}|count`) % (BOARD_SLOTS - 1));
    return this.host.notices(board).slice(0, n);
  }
}

/** The first words of a notice, for its choice: "A grey she-ass, branded on the left haunch…". */
export function headline(text: string): string {
  const first = text.split(/(?<=[.!?:;])\s/)[0];
  if (first.length <= 52) return first.replace(/[.:;]$/, '');
  const cut = first.slice(0, 50);
  return `${cut.slice(0, Math.max(20, cut.lastIndexOf(' ')))}…`;
}
