import { describe, expect, it, vi } from 'vitest';
import { PLAY_HOUR, PLAY_SPAWN, romeParams } from '../src/game/boot';
import { CHECKPOINTS, checkpoint } from '../src/game/checkpoints';

describe('romeParams (the boot options in the URL)', () => {
  it('a plain link starts in the Forum at mid-morning, past the opening', () => {
    expect(romeParams('')).toMatchObject({ quick: true, story: false, at: PLAY_SPAWN, hour: PLAY_HOUR });
    expect(romeParams('?scene=rome')).toMatchObject({ quick: true, story: false, at: PLAY_SPAWN, hour: PLAY_HOUR });
    expect(romeParams('?at=rostra')).toMatchObject({ quick: true, story: false, at: PLAY_SPAWN });
  });

  it('story=1 plays the story’s opening without menus: the cart at the Porta Capena before dawn', () => {
    expect(romeParams('?story=1')).toMatchObject({ quick: true, story: true, at: null, hour: null });
  });

  it('menu=1 runs the full flow; quick=1 is the Porta Capena quick start', () => {
    expect(romeParams('?menu=1')).toMatchObject({ quick: false, at: null, hour: null });
    expect(romeParams('?quick=1')).toMatchObject({ quick: true, at: null, hour: null });
    expect(romeParams('?at=colosseum&hour=21')).toMatchObject({ quick: true, at: 'colosseum', hour: 21 });
    expect(romeParams('?at=colosseum&menu=1')).toMatchObject({ quick: false, at: 'colosseum' });
  });

  it('fight=nereus goes straight to that Ludus bout', () => {
    expect(romeParams('?fight=nereus')).toMatchObject({ quick: true, story: false, at: 'ludus-magnus', hour: PLAY_HOUR, fight: 3 });
    expect(romeParams('?fight=Pullus')).toMatchObject({ fight: 1 });
    expect(romeParams('')).toMatchObject({ fight: null });
  });

  it('part=castor starts at that checkpoint of the opening, at its place and hour', () => {
    expect(romeParams('?part=castor')).toMatchObject({ quick: true, at: 'miliarium-aureum', hour: 8.5, part: 'castor' });
    expect(romeParams('?part=brawl&hour=20')).toMatchObject({ at: 'meta-sudans', hour: 20, part: 'brawl' });
    expect(romeParams('?part=nowhere')).toMatchObject({ part: null, at: PLAY_SPAWN, story: false });
    expect(romeParams('?part=nowhere&story=1')).toMatchObject({ part: null, at: null, story: true });
  });
});

describe('mq-04 checkpoints (the dedication, the column, the summit, the aftermath)', () => {
  it('each part boots at its place and hour', () => {
    expect(romeParams('?part=dedication')).toMatchObject({ quick: true, at: 'forum-trajan', hour: 6.5, part: 'dedication' });
    expect(romeParams('?part=column')).toMatchObject({ at: 'column-trajan', hour: 7.5, part: 'column' });
    expect(romeParams('?part=summit')).toMatchObject({ at: 'column-trajan', hour: 8, part: 'summit' });
    expect(romeParams('?part=aftermath')).toMatchObject({ at: 'column-trajan', hour: 9, part: 'aftermath' });
  });

  it('each setup replays the chapters before it and sets the stage on a fake game', () => {
    for (const id of ['dedication', 'column', 'summit', 'aftermath']) {
      const flags = new Map<string, unknown>();
      const game = {
        quests: {
          flags: { set: (k: string, v: unknown) => flags.set(k, v), get: (k: string) => flags.get(k) },
          setStage: vi.fn(() => true),
          start: vi.fn(() => true),
        },
        player: { inventory: { count: () => 0, add: vi.fn(), remove: vi.fn() }, teleport: vi.fn() },
        calendar: { stepToAnchor: vi.fn(() => true) },
        events: { emit: vi.fn() },
      };
      const cp = checkpoint(id)!;
      expect(() => cp.setup(game as never)).not.toThrow();
      const calls = game.quests.setStage.mock.calls.map((c) => c.join(':'));
      expect(calls.filter((c) => !c.startsWith('mq-04') && c.endsWith(':done'))).toEqual([
        'mq-01-madida-capena:done',
        'mq-02-tabella:done',
        'mq-03-lemuria:done',
      ]);
      expect(calls.at(-1)).toMatch(/^mq-04-columna:/);
      expect(game.calendar.stepToAnchor).toHaveBeenCalled();
    }
    expect(CHECKPOINTS.filter((c) => c.id === 'summit')).toHaveLength(1);
  });

  it('each part ends on its mq-04 stage', () => {
    const stageOf = (id: string) => {
      const game = {
        quests: { flags: { set: () => {}, get: () => undefined }, setStage: vi.fn(() => true), start: vi.fn(() => true) },
        player: { inventory: { count: () => 0, add: vi.fn(), remove: vi.fn() } },
        events: { emit: vi.fn() },
      };
      checkpoint(id)!.setup(game as never);
      return game.quests.setStage.mock.calls.at(-1);
    };
    expect(stageOf('dedication')).toEqual(['mq-04-columna', 'post']);
    expect(stageOf('column')).toEqual(['mq-04-columna', 'climb']);
    expect(stageOf('summit')).toEqual(['mq-04-columna', 'climb']);
    expect(stageOf('aftermath')).toEqual(['mq-04-columna', 'aftermath']);
  });
});

