/**
 * The jobs' runtime (docs/design/world-life.md §4.7). installLife calls `installJobs(game)`:
 *
 *  - Expiry: a 2 Hz check fails running jobs whose time is up (defineJob.ts `expireJobs`).
 *  - The burden: while the player carries job goods tagged 'heavy' (the porter's amphora) they walk
 *    at 0.6 of their speed and can't sprint or jump. The flag is refreshed at 2 Hz; the hooks only
 *    read it. Goods tagged 'carry:<prop>' are shown on the player in the third person (the amphora
 *    on the back, the bread basket on the head) with the crowd's own cached prop meshes.
 *  - The sportula: an option taken at the patron's door is remembered for today, so his doorkeeper
 *    can offer the letter (job-cliens-epistula) only after the morning greeting; a toast says so.
 *  - The practice bout's injury lasts one game hour, as lud-01's does (job-ludus-lusio sets the
 *    hour in the life save as 'lusio-cure').
 *
 * Nothing runs per frame but the two controller hooks, which read one boolean.
 */
import type { HumanoidAvatar } from '../../actors/avatar/HumanoidAvatar';
import type { Game, System } from '../../core/Game';
import type { PropKind } from '../../npc/crowd/roles';
import { attachProp, type CarriedProp } from '../../npc/props';
import type { PlayerController } from '../../player/PlayerController';
import { jobRuntimes } from '../talk';
import { expireJobs } from './defineJob';

/** The porter's gait under an amphora (a multiplier on the player's speed). */
export const BURDEN_SPEED = 0.6;

/** The keeper at the patron's door (the SERVICES crew's salutatio): an option there is the sportula. */
export const PATRON_DOOR = 'keeper-velia-ostiarius';
/** The life store key of today's sportula. */
export const SPORTULA = 'sportula';
/** The life store key of the hour the practice bout's injury heals. */
export const LUSIO_CURE = 'lusio-cure';

class JobsSystem implements System {
  readonly name = 'life-jobs';
  readonly priority = 121;
  /** The player carries something heavy (read by the controller hooks). */
  burdened = false;
  private t = 0;
  /** The controller whose hooks carry the burden (a new controller is hooked again). */
  private hooked: PlayerController | null = null;
  private heavy: string[] | null = null;
  private carried: { id: string; prop: PropKind }[] | null = null;
  private shown: { item: string; prop: CarriedProp; avatar: unknown } | null = null;

  constructor(private readonly game: Game) {}

  update(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const pc = this.game.getSystem?.<PlayerController>('playerController');
    if (pc && pc !== this.hooked) this.hook(pc);
    expireJobs(this.game);
    const inv = this.game.player?.inventory;
    this.heavy ??= this.tagged('heavy');
    this.burdened = !!inv && this.heavy.some((id) => inv.count(id) > 0);
    this.show();
  }

  dispose() {
    this.shown?.prop.dispose();
    this.shown = null;
  }

  /** Item ids with a tag ('heavy'), read once from the item database. */
  private tagged(tag: string): string[] {
    return (this.game.items?.all() ?? []).filter((d) => d.tags?.includes(tag)).map((d) => d.id);
  }

  /** Slow the player under a heavy load: compose the controller's hooks (once per controller). */
  private hook(pc: PlayerController) {
    this.hooked = pc;
    const speed = pc.speedMultiplier;
    pc.speedMultiplier = () => (this.burdened ? speed() * BURDEN_SPEED : speed());
    const sprint = pc.canSprint;
    pc.canSprint = () => !this.burdened && sprint();
    const jump = pc.canJump ?? (() => true);
    pc.canJump = () => !this.burdened && jump();
  }

  /** The job goods on the player's back or head, in the third person only. */
  private show() {
    const p = this.game.player;
    const inv = p?.inventory;
    this.carried ??= (this.game.items?.all() ?? []).flatMap((d) => {
      const t = d.tags?.find((x) => x.startsWith('carry:'));
      return t ? [{ id: d.id, prop: t.slice(6) as PropKind }] : [];
    });
    const avatar = p?.avatar as (HumanoidAvatar & { getSocket?: unknown }) | null | undefined;
    const want = inv && avatar && typeof avatar.getSocket === 'function' && p.viewMode !== 'first' ? this.carried.find((c) => inv.count(c.id) > 0) : undefined;
    const s = this.shown;
    if (s && (!want || s.item !== want.id || s.avatar !== avatar)) {
      s.prop.dispose();
      this.shown = null;
    }
    if (want && !this.shown && avatar) this.shown = { item: want.id, prop: attachProp(avatar, want.prop), avatar };
  }
}

/** Plug the jobs into the game (installLife calls every install… of src/life/jobs). */
export function installJobs(game: Game) {
  const sys = new JobsSystem(game);
  game.addSystem(sys);
  const store = () => game.life?.store;
  // The morning greeting at the patron's door (whatever its option is called): the letter may follow,
  // and the doorkeeper says so.
  game.events.on('life:option', (e) => {
    if ((e.owner !== PATRON_DOOR && !e.owner.startsWith('act.velia.')) || e.option.startsWith('job:')) return;
    if (store()?.today(SPORTULA)) return;
    store()?.addToday(SPORTULA);
    for (const rt of jobRuntimes()) {
      if (rt.def.giver !== PATRON_DOOR || !rt.offerable(game)) continue;
      const who = game.npcs?.name(PATRON_DOOR) ?? 'The doorkeeper';
      game.events.emit('rpg:notify', { text: `${who} at the door has an errand for a client: ${rt.def.title}.`, kind: 'quest' });
    }
  });
  // A practice bout's injury lasts an hour (lud-01's rule for a lusio).
  game.events.on('time:hour', () => {
    const at = store()?.get<number>(LUSIO_CURE);
    if (typeof at !== 'number' || (game.time?.totalHours ?? 0) < at) return;
    game.player?.sheet?.cure('injury:injured');
    store()?.set(LUSIO_CURE, undefined);
  });
  return sys;
}
