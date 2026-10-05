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
});
