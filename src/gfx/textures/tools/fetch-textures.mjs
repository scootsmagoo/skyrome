#!/usr/bin/env node
/**
 * Downloads the CC0 texture sets used by the material library, converts them to small web JPGs
 * and records their average albedo/roughness (used to normalise tints at runtime).
 *
 *   node src/gfx/textures/tools/fetch-textures.mjs            # all sets
 *   node src/gfx/textures/tools/fetch-textures.mjs brick tufa # some sets
 *
 * Needs ImageMagick 7 (`magick`) and `unzip` on PATH. Writes:
 *   public/textures/<set>/color.jpg   1024², sRGB albedo
 *   public/textures/<set>/normal.jpg  1024², OpenGL (+Y) tangent-space normals
 *   public/textures/<set>/arm.jpg     512², R = ambient occlusion, G = roughness, B = 0
 *   src/gfx/textures/stats.gen.json   average linear albedo + roughness per set
 *
 * Sources and licences are listed in docs/credits/classical.md. Everything here is CC0.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const outRoot = join(root, 'public/textures');
const cache = join(tmpdir(), 'skyrome-texture-cache');
mkdirSync(cache, { recursive: true });

/** set id → source. `ph:` = Poly Haven asset id, `acg:` = ambientCG asset id. */
export const SOURCES = {
  marble: 'acg:Marble001',
  marble_veined: 'acg:Marble012',
  tufa: 'acg:Rock049',
  peperino: 'acg:Concrete025',
  basalt: 'acg:Rock050',
  rock: 'ph:rock_face',
  brick: 'acg:Bricks094',
  concrete: 'ph:stone_wall_03',
  plaster: 'acg:Plaster001',
  roof_tile: 'acg:RoofingTiles006',
  wood: 'ph:weathered_brown_planks',
  wood_dark: 'ph:old_wood_floor',
  paving_basalt: 'ph:grey_stone_path',
  paving_travertine: 'acg:PavingStones126A',
  cobbles: 'ph:cobblestone_floor_04',
  gravel: 'ph:gravel_floor',
  dirt: 'ph:dirt',
  grass: 'ph:grass_ground',
  dry_grass: 'ph:withered_grass',
  sand: 'ph:sand_01',
  mud: 'ph:brown_mud_02',
  bark: 'ph:pine_bark',
};

const only = process.argv.slice(2);
const sets = Object.keys(SOURCES).filter((s) => !only.length || only.includes(s));

const magick = (...args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

async function download(url, file) {
  if (existsSync(file)) return file;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

/** Returns local paths of { color, normal, rough?, ao?, arm? } for one source. */
async function fetchSource(src) {
  const [kind, id] = src.split(':');
  if (kind === 'acg') {
    const zip = await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, join(cache, `${id}_1K-JPG.zip`));
    const dir = join(cache, `${id}_1K`);
    if (!existsSync(dir)) execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
    const files = readdirSync(dir);
    const pick = (re) => {
      const f = files.find((n) => re.test(n));
      return f ? join(dir, f) : undefined;
    };
    return { color: pick(/_Color\.jpg$/), normal: pick(/_NormalGL\.jpg$/), rough: pick(/_Roughness\.jpg$/), ao: pick(/_AmbientOcclusion\.jpg$/) };
  }
  const info = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const url = (entry) => {
    const f = entry?.['1k'];
    return f ? (f.jpg ?? f.png).url : undefined;
  };
  const get = async (entry, name) => {
    const u = url(entry);
    return u ? download(u, join(cache, `${id}_${name}${u.endsWith('.png') ? '.png' : '.jpg'}`)) : undefined;
  };
  return {
    color: await get(info.Diffuse ?? info.diff_png, 'diff'),
    normal: await get(info.nor_gl, 'nor_gl'),
    arm: await get(info.arm, 'arm'),
    rough: await get(info.Rough, 'rough'),
  };
}

const stats = {};
for (const set of sets) {
  const src = SOURCES[set];
  const f = await fetchSource(src);
  if (!f.color || !f.normal) throw new Error(`${set}: missing maps`);
  const dir = join(outRoot, set);
  mkdirSync(dir, { recursive: true });
  const color = join(dir, 'color.jpg');
  const normal = join(dir, 'normal.jpg');
  const arm = join(dir, 'arm.jpg');
  magick(f.color, '-resize', '1024x1024!', '-strip', '-interlace', 'none', '-sampling-factor', '4:2:0', '-quality', '80', color);
  magick(f.normal, '-resize', '1024x1024!', '-strip', '-sampling-factor', '4:2:0', '-quality', '80', normal);
  if (f.arm) {
    magick(f.arm, '-resize', '512x512!', '-strip', '-sampling-factor', '4:4:4', '-quality', '85', arm);
  } else {
    const ao = f.ao ? ['(', f.ao, '-channel', 'R', '-separate', '+channel', '-resize', '512x512!', ')'] : ['(', '-size', '512x512', 'xc:white', ')'];
    magick(
      ...ao,
      '(', f.rough, '-channel', 'R', '-separate', '+channel', '-resize', '512x512!', ')',
      '(', '-size', '512x512', 'xc:black', ')',
      '-set', 'colorspace', 'sRGB', '-combine', '-strip', '-sampling-factor', '4:4:4', '-quality', '85', arm,
    );
  }
  // Average albedo in LINEAR space (what the shader multiplies) and average roughness (G of ARM).
  const avg = magick(color, '-colorspace', 'RGB', '-scale', '1x1!', '-format', '%[fx:r] %[fx:g] %[fx:b]', 'info:').split(' ').map(Number);
  const rough = Number(magick(arm, '-channel', 'G', '-separate', '-format', '%[fx:mean]', 'info:'));
  stats[set] = { source: src, albedo: avg.map((v) => +v.toFixed(4)), roughness: +rough.toFixed(4) };
  console.log(set.padEnd(18), src.padEnd(28), stats[set].albedo.join(' '), stats[set].roughness);
}

// Merge with the existing stats file so partial runs keep the other entries.
const statsFile = join(root, 'src/gfx/textures/stats.gen.json');
const existing = existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, 'utf8')) : {};
const merged = { ...existing, ...stats };
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
writeFileSync(statsFile, JSON.stringify(sorted, null, 2) + '\n');
console.log('wrote', statsFile);
