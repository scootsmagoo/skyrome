// node scripts/sfx/sheet.mjs out.png file1 file2 ...: stacked spectrograms (paths relative to .cache/sfx) for eyeballing a set.
import { execFileSync } from 'node:child_process';
import { FFMPEG } from './lib.mjs';

const root = new URL('../../.cache/sfx/', import.meta.url).pathname;
const [out, ...files] = process.argv.slice(2);
const args = ['-v', 'error', '-y'];
for (const f of files) args.push('-i', f.startsWith('/') ? f : root + f);
const parts = files.map((_, i) => `[${i}:a]aformat=channel_layouts=mono,showspectrumpic=s=700x120:legend=0:scale=log:fscale=log:stop=16000[v${i}]`);
const stack = files.map((_, i) => `[v${i}]`).join('') + `vstack=inputs=${files.length}[o]`;
args.push('-filter_complex', parts.join(';') + ';' + stack, '-map', '[o]', '-frames:v', '1', out);
execFileSync(FFMPEG, args);
console.log(files.map((f, i) => `${i}: ${f.split('/').pop()}`).join('\n'));
