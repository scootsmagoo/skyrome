import { describe, expect, it } from 'vitest';
import { PLAY_HOUR, PLAY_SPAWN, romeParams } from '../src/game/boot';

describe('romeParams (the boot options in the URL)', () => {
  it('a plain link drops straight into the Forum at mid-morning', () => {
    expect(romeParams('')).toMatchObject({ quick: true, at: PLAY_SPAWN, hour: PLAY_HOUR });
    expect(romeParams('?scene=rome')).toMatchObject({ quick: true, at: PLAY_SPAWN, hour: PLAY_HOUR });
  });

  it('menu=1 runs the full flow; quick=1 is the Porta Capena quick start', () => {
    expect(romeParams('?menu=1')).toMatchObject({ quick: false, at: null, hour: null });
    expect(romeParams('?quick=1')).toMatchObject({ quick: true, at: null, hour: null });
    expect(romeParams('?at=colosseum&hour=21')).toMatchObject({ quick: true, at: 'colosseum', hour: 21 });
    expect(romeParams('?at=colosseum&menu=1')).toMatchObject({ quick: false, at: 'colosseum' });
  });

  it('fight=nereus goes straight to that Ludus bout', () => {
    expect(romeParams('?fight=nereus')).toMatchObject({ quick: true, at: 'ludus-magnus', hour: PLAY_HOUR, fight: 3 });
    expect(romeParams('?fight=Pullus')).toMatchObject({ fight: 1 });
    expect(romeParams('')).toMatchObject({ fight: null });
  });

  it('part=castor starts at that checkpoint of the opening, at its place and hour', () => {
    expect(romeParams('?part=castor')).toMatchObject({ quick: true, at: 'miliarium-aureum', hour: 8.5, part: 'castor' });
    expect(romeParams('?part=brawl&hour=20')).toMatchObject({ at: 'meta-sudans', hour: 20, part: 'brawl' });
    expect(romeParams('?part=nowhere')).toMatchObject({ part: null, at: PLAY_SPAWN });
  });
});
