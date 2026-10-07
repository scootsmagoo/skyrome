#!/usr/bin/env node
/**
 * Downloads the CC0 texture sets used by the material library, converts them to small web JPGs
 * and records their average albedo/roughness (used to normalise tints at runtime).
 *
 *   node src/gfx/textures/tools/fetch-textures.mjs            # all sets
 *   node src/gfx/textures/tools/fetch-textures.mjs brick tufa # some sets
 *   node src/gfx/textures/tools/fetch-textures.mjs --ktx2 [sets…] # compressed versions (below)
 *
 * Needs ImageMagick 7 (`magick`) and `unzip` on PATH. Writes:
 *   public/textures/<set>/color.jpg   1024², sRGB albedo
 *   public/textures/<set>/normal.jpg  1024², OpenGL (+Y) tangent-space normals
 *   public/textures/<set>/arm.jpg     512², R = ambient occlusion, G = roughness, B = 0
 *   src/gfx/textures/stats.gen.json   average linear albedo + roughness per set
 *
 * `--ktx2` (needs `basisu`, Basis Universal 2.x: `brew install basis_universal`) fetches the 2K
 * sources and writes GPU-compressed versions next to the JPEGs, which it leaves alone:
 *   color.ktx2   2048², ETC1S, sRGB      (~0.7–0.9 MB)
 *   normal.ktx2  1024², ETC1S tuned for normal maps, linear (~0.25 MB)
 *   arm.ktx2     512², ETC1S, linear, from arm.jpg
 * and marks the set `ktx2: true` in stats.gen.json. All with mipmaps and flipped vertically (KTX2
 * textures are never flipped on upload; the JPEGs are). The terrain still reads the JPEGs.
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

const KTX2 = process.argv.includes('--ktx2');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
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
async function fetchSource(src, res = '1k') {
  const [kind, id] = src.split(':');
  const R = res.toUpperCase();
  if (kind === 'acg') {
    const zip = await download(`https://ambientcg.com/get?file=${id}_${R}-JPG.zip`, join(cache, `${id}_${R}-JPG.zip`));
    const dir = join(cache, `${id}_${R}`);
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
    const f = entry?.[res];
    return f ? (f.jpg ?? f.png).url : undefined;
  };
  const get = async (entry, name) => {
    const u = url(entry);
    return u ? download(u, join(cache, `${id}_${name}_${res}${u.endsWith('.png') ? '.png' : '.jpg'}`)) : undefined;
  };
  return {
    color: await get(info.Diffuse ?? info.diff_png, 'diff'),
    normal: await get(info.nor_gl, 'nor_gl'),
    arm: await get(info.arm, 'arm'),
    rough: await get(info.Rough, 'rough'),
  };
}

const statsFile = join(root, 'src/gfx/textures/stats.gen.json');
if (KTX2) {
  const basisu = (...args) => execFileSync('basisu', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const all = JSON.parse(readFileSync(statsFile, 'utf8'));
  for (const set of sets) {
    const f = await fetchSource(SOURCES[set], '2k');
    if (!f.color || !f.normal) throw new Error(`${set}: missing 2k maps`);
    const dir = join(outRoot, set);
    const tmp = join(cache, `${set}-ktx2`);
    mkdirSync(tmp, { recursive: true });
    const png = (name) => join(tmp, `${name}.png`);
    magick(f.color, '-resize', '2048x2048!', '-strip', png('color'));
    magick(f.normal, '-resize', '1024x1024!', '-strip', png('normal'));
    magick(join(dir, 'arm.jpg'), '-strip', png('arm'));
    const common = ['-ktx2', '-etc1s', '-effort', '4', '-mipmap', '-y_flip'];
    basisu(...common, '-quality', '65', png('color'), '-output_file', join(dir, 'color.ktx2'));
    basisu(...common, '-quality', '90', '-linear', '-normal_map', png('normal'), '-output_file', join(dir, 'normal.ktx2'));
    basisu(...common, '-quality', '90', '-linear', png('arm'), '-output_file', join(dir, 'arm.ktx2'));
    all[set] = { ...all[set], ktx2: true };
    const kb = (n) => Math.round(readFileSync(join(dir, n)).length / 1024);
    console.log(set.padEnd(18), `color ${kb('color.ktx2')} KB · normal ${kb('normal.ktx2')} KB · arm ${kb('arm.ktx2')} KB`);
  }
  writeFileSync(statsFile, JSON.stringify(all, null, 2) + '\n');
  console.log('wrote', statsFile);
  process.exit(0);
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
  stats[set] = { ...(existsSync(join(dir, 'color.ktx2')) ? { ktx2: true } : {}), source: src, albedo: avg.map((v) => +v.toFixed(4)), roughness: +rough.toFixed(4) };
  console.log(set.padEnd(18), src.padEnd(28), stats[set].albedo.join(' '), stats[set].roughness);
}

// Merge with the existing stats file so partial runs keep the other entries.
const existing = existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, 'utf8')) : {};
const merged = { ...existing, ...stats };
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
writeFileSync(statsFile, JSON.stringify(sorted, null, 2) + '\n');
console.log('wrote', statsFile);
