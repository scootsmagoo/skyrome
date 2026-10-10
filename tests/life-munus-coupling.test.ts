/**
 * Tripwire for the bets' coupling to MunusDirector (src/arena/MunusDirector.ts): until the director
 * has a public nextPair(), programme.ts reads its private `boutNo` and `dayKey`, uses its 9.6 star
 * threshold and betRules.stagedPair parses status(). If any of these change, this fails loudly.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/arena/MunusDirector.ts', 'utf8');

describe('bets and the munus director', () => {
  it('still has the fields and rules the programme reads', () => {
    expect(src).toMatch(/private boutNo = 0;/);
    expect(src).toMatch(/private dayKey = '';/);
    expect(src).toMatch(/this\.dayKey = `\$\{date\.month\}-\$\{date\.day\}-\$\{t\.dayIndex\}`;/);
    expect(src).toMatch(/const star = !lusio && this\.pos > 9\.6;/);
    expect(src).toMatch(/pairOf\(this\.dayKey, this\.boutNo, lusio, star\)/);
  });
});
