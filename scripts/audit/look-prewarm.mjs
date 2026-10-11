#!/usr/bin/env node
/**
 * First-arrival prewarm A/B (LOOK crew): boots the quick start at the Porta Capena twice, with the prewarm
 * (default) and with ?prewarm=0, and prints what the prewarm did (window.__prewarm: ms, programs and textures
 * made behind the loading screen, bodies and blocks) and how long the boot took each way.
 *
 *   node scripts/audit/look-prewarm.mjs [--runs 2]
 */
import { boot, parseArgs } from './boot.mjs';
import { guard } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
const release = await guard('look-prewarm', args);
try {
  for (let i = 0; i < Number(args.runs ?? 1); i++) {
    for (const q of ['', '&prewarm=0']) {
      const { page, close, bootMs } = await boot(`scene=rome&quick=1&hour=11${q}`);
      const r = await page.evaluate(() => ({ pre: window.__prewarm, textures: window.__skyrome.game.renderer.info.memory.textures, programs: window.__skyrome.game.renderer.info.programs.length }));
      console.log(`${q || 'prewarm'}: boot ${(bootMs / 1000).toFixed(1)} s  textures ${r.textures}  programs ${r.programs}  report ${JSON.stringify(r.pre)}`);
      await close();
    }
  }
} finally {
  release();
}
