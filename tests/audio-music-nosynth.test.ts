import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

describe('music is recorded, not synthesised', () => {
  it('no music file creates an OscillatorNode', () => {
    const dir = resolve(__dirname, '../src/audio/music');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      expect(src, f).not.toMatch(/createOscillator\s*\(|new OscillatorNode/);
    }
  });
  it('the sine syrinx stand-in is gone', () => {
    const src = readFileSync(resolve(__dirname, '../src/audio/music/instruments.ts'), 'utf8');
    expect(src).not.toMatch(/class Syrinx/);
  });
});
