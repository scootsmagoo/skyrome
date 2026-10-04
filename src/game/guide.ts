/**
 * The first steps while there is no quest to follow (GDD §17.2 golden path). Until the main
 * quest's content lands, a new game would otherwise start with an empty journal, a bare compass
 * and nothing pointing anywhere. The guide is a tracked journal entry, "Into the City" (Ad
 * Forum), whose objectives lead from the Porta Capena up the Circus valley under the Palatine,
 * through the Velabrum and the Vicus Tuscus to the Golden Milestone in the Forum. The compass
 * diamond and the map marker point at the next waypoint, and each waypoint clears as you reach
 * it. The guide retires for good once the main quest runs (mq-01 when it exists); while another
 * quest is tracked, the guide steps aside (untracked) so the compass shows one diamond.
 *
 * As the player gets control on a new game, a few toasts name the first keys (live labels).
 */
import type { Game, System } from '../core/Game';
import { codeLabel, type Action } from '../core/Input';
import type { SaveSystem } from '../save/SaveSystem';
import type { QuestLogView, QuestView } from '../ui/types';
import type { UIManager } from '../ui/UIManager';

export const GUIDE_ID = 'guide-ad-forum';

export interface GuideStep {
  id: string;
  text: string;
  /** Waypoints in game meters (x, z), walked in order; the compass points at the next one. */
  points: [number, number][];
}

/** The route, measured on foot in the built city (walkable at the time of writing). */
export const GUIDE_STEPS: GuideStep[] = [
  { id: 'circus', text: 'Go down into the valley of the Circus Maximus', points: [[249, 503]] },
  { id: 'palatine', text: 'Follow the street under the Palatine, along the Circus', points: [[170, 448], [98, 394], [20, 335], [-50, 280]] },
  { id: 'velabrum', text: 'Turn up the Vicus Tuscus, through the Velabrum', points: [[-44, 262], [-27, 187], [27, 84]] },
  { id: 'forum', text: 'Find the Golden Milestone in the Forum', points: [[48, 60], [56, 38], [25, 15], [6, 6]] },
];

/** Reaching a waypoint: within this many meters (a street is 5–8 m wide). */
export const GUIDE_REACH = 12;

const ALL = GUIDE_STEPS.flatMap((s, step) => s.points.map((p) => ({ step, x: p[0], z: p[1] })));

/**
 * Advance along the route from `index` for a player at (x, z): any later waypoint within reach
 * counts too (shortcuts are fine). Returns the new index (ALL.length = done). Pure.
 */
export function advanceGuide(index: number, x: number, z: number, reach = GUIDE_REACH): number {
  let next = index;
  for (let i = index; i < ALL.length; i++) if (Math.hypot(ALL[i].x - x, ALL[i].z - z) <= reach) next = i + 1;
  return next;
}

/** The step a waypoint index belongs to (GUIDE_STEPS.length when done). */
export function guideStepOf(index: number): number {
  return index >= ALL.length ? GUIDE_STEPS.length : ALL[index].step;
}

export function guideWaypoint(index: number): { x: number; z: number } | null {
  const p = ALL[index];
  return p ? { x: p.x, z: p.z } : null;
}

interface GuideState {
  index: number;
  retired: boolean;
  tracked: boolean;
  hinted: boolean;
}

const fresh = (): GuideState => ({ index: 0, retired: false, tracked: true, hinted: false });

export class FirstStepsGuide implements System {
  readonly name = 'firstStepsGuide';
  readonly priority = 1060;
  state: GuideState = fresh();
  private acc = 0;
  private listeners = new Set<() => void>();
  private hintTimers: number[] = [];

  constructor(
    private readonly game: Game,
    private readonly ui: UIManager,
    /** True while a game is in progress (not on the title, in creation or loading). */
    private readonly playing: () => boolean,
    /** Is a real quest active and tracked? (The guide steps aside.) */
    private readonly questTracked: () => boolean,
    /** Has the main quest begun? (The guide retires.) */
    private readonly mainQuestStarted: () => boolean,
    save?: SaveSystem,
  ) {
    save?.register('guide', {
      save: () => ({ ...this.state }),
      load: (d) => {
        const v = (d ?? {}) as Partial<GuideState>;
        this.state = {
          index: Number.isFinite(v.index) ? Math.max(0, Math.min(ALL.length, Number(v.index))) : 0,
          retired: !!v.retired,
          tracked: v.tracked !== false,
          hinted: !!v.hinted,
        };
        this.changed();
      },
      reset: () => {
        this.state = fresh();
        this.changed();
      },
    });
  }

  get done() {
    return this.state.index >= ALL.length;
  }

  /** Showing (not retired by a real quest). */
  get active() {
    return !this.state.retired;
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    if (!this.playing() || this.state.retired || this.done) return;
    if (this.mainQuestStarted()) {
      this.state.retired = true;
      this.changed();
      return;
    }
    const p = this.game.player?.position;
    if (!p) return;
    const before = this.state.index;
    const next = advanceGuide(before, p.x, p.z);
    if (next === before) return;
    const stepBefore = guideStepOf(before);
    this.state.index = next;
    for (let s = stepBefore; s < guideStepOf(next); s++) this.ui.notify(`Completed: ${GUIDE_STEPS[s].text}`, 'quest');
    if (this.done) {
      this.game.events.emit('ui:banner', { kind: 'quest-complete', title: 'Into the City', subtitle: 'Ad Forum' });
      this.ui.notify('This is the Forum, the heart of Rome. Explore: the map (M) marks what you have found.', 'info');
    }
    this.changed();
  }

  setTracked(tracked: boolean) {
    this.state.tracked = tracked;
    this.changed();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The journal entry (null once a real quest took over before the guide was finished). */
  view(): QuestView | null {
    if (this.state.retired) return null;
    const step = guideStepOf(this.state.index);
    const wp = guideWaypoint(this.state.index);
    const objectives = GUIDE_STEPS.slice(0, Math.min(step + 1, GUIDE_STEPS.length)).map((s, i) => ({
      id: s.id,
      text: s.text,
      done: i < step,
      target: i === step && wp ? { kind: 'point' as const, x: wp.x, y: 0, z: wp.z } : undefined,
    }));
    const entries = ['I came in by the Porta Capena before dawn, with the last of the night carts. Everything in Rome begins at the Forum, beyond the valley of the Circus.'];
    if (step >= 2) entries.push('I walked the length of the Circus Maximus under the palaces of the Palatine.');
    if (this.done) entries.push('I stood at the Golden Milestone, where every road of the empire is measured from.');
    return {
      id: GUIDE_ID,
      title: 'Into the City',
      latin: 'Ad Forum',
      category: 'main',
      summary: 'Find your way from the Porta Capena to the Forum Romanum.',
      state: this.done ? 'completed' : 'active',
      tracked: !this.done && this.state.tracked && !this.questTracked(),
      entries,
      objectives,
      location: 'Rome',
    };
  }

  /** The first-steps toasts, once per new game (the keys are the live bindings). */
  hints() {
    if (this.state.hinted) return;
    this.state.hinted = true;
    const key = (a: Action) => codeLabel(this.game.input.bindings[a]?.[0] ?? '?');
    const lines = [
      `Look with the trackpad or mouse (click the view first), or turn with ${key('lookLeft')} ${key('lookRight')}. ${key('forward')} ${key('left')} ${key('back')} ${key('right')} to move.`,
      `${key('walkToggle')} walks or runs, ${key('sprint')} sprints. The diamond on the compass points the way to the Forum.`,
      `${key('map')} opens the map, ${key('journal')} the journal, ${key('wait')} waits, ${key('quickSave')} quicksaves, ${key('pause')} pauses.`,
    ];
    for (const t of this.hintTimers) clearTimeout(t);
    this.hintTimers = lines.map((text, i) =>
      window.setTimeout(() => {
        if (this.playing()) this.ui.notify(text, 'info');
      }, 3500 + i * 9000),
    );
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }
}

/** The journal with the guide's entry first (and its tracking routed to the guide). */
export function withGuide(log: QuestLogView, guide: FirstStepsGuide): QuestLogView {
  return {
    quests: () => {
      const g = guide.view();
      const list = log.quests();
      return g ? [g, ...list] : list;
    },
    setTracked: (id, tracked) => {
      if (id !== GUIDE_ID) return log.setTracked(id, tracked);
      guide.setTracked(tracked);
      // Following the guide again: the real quest steps aside (one diamond at a time).
      if (tracked) for (const q of log.quests()) if (q.tracked) log.setTracked(q.id, false);
    },
    notes: () => log.notes(),
    onChange: (fn) => {
      const a = log.onChange?.(fn);
      const b = guide.onChange(fn);
      return () => {
        a?.();
        b();
      };
    },
  };
}
