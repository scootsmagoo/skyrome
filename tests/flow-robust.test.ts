import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import { DEFAULT_SETTINGS, type SettingsData } from '../src/core/Settings';
import { GameFlow } from '../src/game/GameFlow';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import type { UIManager } from '../src/ui/UIManager';
import { fakeGame, fakePlayer } from './rpg-fakes';

/**
 * GameFlow over the RPG fakes: enough of Game and the UI to run a quick start without WebGL or a
 * DOM, so failures in other crews' content can be injected.
 */
const g = globalThis as unknown as Record<string, unknown>;
let saved: Record<string, unknown>;

beforeEach(() => {
  saved = { window: g.window, requestAnimationFrame: g.requestAnimationFrame, navigator: g.navigator };
  g.window = { addEventListener() {}, removeEventListener() {}, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) };
  g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  g.window = saved.window;
  g.requestAnimationFrame = saved.requestAnimationFrame;
  vi.restoreAllMocks();
});

function setup() {
  const fg = fakeGame();
  const game = fg.game as Game;
  const writable = game as unknown as Record<string, unknown>;
  let data: SettingsData = { ...DEFAULT_SETTINGS };
  const listeners = new Set<(s: SettingsData) => void>();
  writable.settings = {
    get data() {
      return data;
    },
    set(k: keyof SettingsData, v: unknown) {
      data = { ...data, [k]: v };
      for (const fn of listeners) fn(data);
    },
    onChange(fn: (s: SettingsData) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  Object.assign(game.input as object, { ignoredCodes: new Set<string>(), lookSmoothing: 0, bindings: {} });
  writable.physics = { groundHeight: () => 10 };
  const player = Object.assign(fakePlayer(), { sneaking: false, avatar: null as unknown, setAvatar(a: unknown) { this.avatar = a; } });
  game.player = player as unknown as Game['player'];
  const rpg = installRpg(game, { storage: new MemoryStorage() });
  const notes: string[] = [];
  const ui = {
    notify: (t: string) => notes.push(t),
    flash: (t: string) => notes.push(t),
    block: vi.fn(),
    closeAll() {},
    isOpen: () => false,
    confirm: async () => true,
    playerName: '',
  } as unknown as UIManager;
  const flow = new GameFlow(game, ui, rpg, { quick: true });
  return { game, rpg, ui, flow, notes, player };
}

describe('the game flow survives broken content', () => {
  it('a quest that throws on start does not stop the quick start', async () => {
    const { rpg, flow, ui } = setup();
    rpg.quests.all = () => {
      throw new Error('bad quest definition');
    };
    // With the content module's mq-01 in the build the flow finds it by id first: break that too.
    rpg.quests.get = () => {
      throw new Error('bad quest definition');
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await flow.quickStart();
    expect(flow.state).toBe('playing');
    expect(ui.block).toHaveBeenCalledWith('loading', false);
    expect(err).toHaveBeenCalled();
  });

  it('a failure while resetting the game still hands over control', async () => {
    const { rpg, flow } = setup();
    rpg.save.resetAll = () => {
      throw new Error('a saveable exploded');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await flow.quickStart();
    expect(flow.state).toBe('playing');
  });

  it('quickload asks once however often L is pressed', async () => {
    const { rpg, flow, ui } = setup();
    await flow.quickStart();
    let asks = 0;
    let answer: (v: boolean) => void = () => {};
    (ui as unknown as { confirm: () => Promise<boolean> }).confirm = () => {
      asks++;
      return new Promise<boolean>((r) => (answer = r));
    };
    rpg.save.list = async () => [{ slot: 'quick' } as never];
    const first = rpg.save.quickload();
    const second = rpg.save.quickload();
    const third = rpg.save.quickload();
    expect((await second).ok).toBe(false);
    expect((await third).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(asks).toBe(1);
    answer(false);
    expect((await first).ok).toBe(false);
    // Once answered, L asks again.
    void rpg.save.quickload();
    await new Promise((r) => setTimeout(r, 0));
    expect(asks).toBe(2);
  });
});

describe('settings integrity (AC-21)', () => {
  it('a first launch writes the whole preset and Normalis', () => {
    const { game } = setup();
    const d = game.settings.data;
    expect(d.difficulty).toBe('normalis');
    expect(d.controlPreset).toBeTruthy();
    expect(d.presetApplied).toBe(d.controlPreset);
  });
});
