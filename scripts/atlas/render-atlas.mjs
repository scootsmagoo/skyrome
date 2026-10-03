#!/usr/bin/env node
// Renders the SKYROME world atlas (src/data/atlas.ts) to an SVG map for visual checking.
//
//   node --experimental-strip-types scripts/atlas/render-atlas.mjs                 # whole city -> docs/atlas.svg
//   node --experimental-strip-types scripts/atlas/render-atlas.mjs --view core --out /tmp/core.svg
//   node --experimental-strip-types scripts/atlas/render-atlas.mjs --bounds -260,-420,380,280 --scale 3 --out /tmp/forum.svg
//
// North is up (atlas +z = south = down the page). Landmark footprints are drawn with their rotation; the thick
// red edge of each rect/ellipse is its main facade (local -z), circles get a red door tick. Use it to eyeball
// positions and facings after editing the atlas.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from '../../src/data/atlas.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const customBounds = opt('bounds', null);
const view = customBounds ? 'detail' : opt('view', 'city');
const out = resolve(opt('out', resolve(root, view === 'city' ? 'docs/atlas.svg' : `docs/atlas-${view}.svg`)));

let B = view === 'core' ? A.CORE_BOUNDS : A.CITY_BOUNDS;
if (customBounds) {
  const [x0, z0, x1, z1] = customBounds.split(',').map(Number);
  B = { minX: x0, minZ: z0, maxX: x1, maxZ: z1 };
}
const pad = view === 'core' ? 60 : view === 'city' ? 150 : 10; // real metres of margin around the bounds
const S = Number(opt('scale', view === 'core' ? 1.0 : view === 'city' ? 0.42 : 3)); // px per real metre
const minX = B.minX - pad;
const minZ = B.minZ - pad;
const W = Math.round((B.maxX - B.minX + 2 * pad) * S);
const H = Math.round((B.maxZ - B.minZ + 2 * pad) * S);
const LEGEND_H = 120;

const X = (x) => +((x - minX) * S).toFixed(1);
const Y = (z) => +((z - minZ) * S).toFixed(1);
const pts = (ps) => ps.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- colours
function elevColor(e) {
  // 0-90 m: lowland cream -> ochre -> brown
  const stops = [
    [8, [236, 230, 210]],
    [15, [226, 219, 190]],
    [25, [214, 200, 160]],
    [35, [200, 178, 130]],
    [45, [184, 156, 108]],
    [55, [166, 136, 92]],
    [70, [146, 118, 80]],
    [90, [122, 98, 68]],
  ];
  if (e <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    const [e1, c1] = stops[i];
    const [e0, c0] = stops[i - 1];
    if (e <= e1) {
      const t = (e - e0) / (e1 - e0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1]})`;
}
const CAT = {
  temple: '#c9a227', forum: '#e8dcc0', basilica: '#b08d57', arch: '#8c6d46', column: '#8c6d46', amphitheatre: '#a0522d',
  circus: '#d2b48c', theatre: '#a0522d', odeum: '#a0522d', stadium: '#d2b48c', baths: '#5f9ea0', palace: '#8b3a62',
  house: '#c08060', aqueduct: '#7a5c99', gate: '#6b4f2a', market: '#d9a066', camp: '#7b7d4a', tomb: '#888888',
  monument: '#8c6d46', fountain: '#4f8fbf', portico: '#d8c8a0', shrine: '#b5651d', prison: '#555555', warehouse: '#a08a6a',
  library: '#9b7b4b', garden: '#8fbf6f', harbor: '#6f8fa8', curia: '#b0703a', other: '#b8a890',
};
const ROAD = { via: '#5a4630', clivus: '#6a5034', vicus: '#7a6040', street: '#8a7050', path: '#9a8060', stairs: '#aa3020' };

// ---------------------------------------------------------------- geometry helpers
function riverPolygon(r) {
  const c = r.centerline;
  const left = [];
  const right = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = tz; // left of flow (flow south: left = east)
    const nz = -tx;
    const h = r.width[i] / 2;
    left.push([c[i][0] + nx * h, c[i][1] + nz * h]);
    right.push([c[i][0] - nx * h, c[i][1] - nz * h]);
  }
  return left.concat(right.reverse());
}
const centroid = (ps) => {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const f = ps[j][0] * ps[i][1] - ps[i][0] * ps[j][1];
    a += f;
    cx += (ps[j][0] + ps[i][0]) * f;
    cz += (ps[j][1] + ps[i][1]) * f;
  }
  a *= 0.5;
  return Math.abs(a) < 1e-6 ? ps[0] : [cx / (6 * a), cz / (6 * a)];
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

// ---------------------------------------------------------------- build SVG
const o = [];
const P = (s) => o.push(s);
P(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + LEGEND_H}" viewBox="0 0 ${W} ${H + LEGEND_H}" font-family="Georgia, 'Times New Roman', serif">`);
P(`<title>SKYROME atlas: Rome c. AD 113 (${view})</title>`);
P(`<rect x="0" y="0" width="${W}" height="${H + LEGEND_H}" fill="${elevColor(A.BASE_ELEVATION)}"/>`);
P(`<defs><clipPath id="mapclip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`);
P('<g clip-path="url(#mapclip)">');
P(`<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#6b8f4e" stroke-width="1.2" opacity="0.5"/></pattern></defs>`);

// Lowlands
P('<g id="lowlands" opacity="0.85">');
for (const l of A.LOWLANDS) P(`<polygon points="${pts(l.polygon)}" fill="${elevColor(l.elevation)}" stroke="none"><title>${esc(`${l.name}: ${l.elevation} m`)}</title></polygon>`);
P('</g>');

// Hills: slope halo (foot) then plateau, sorted low -> high so higher terraces paint on top
const hills = [...A.HILLS].sort((a, b) => a.plateau - b.plateau);
P('<g id="hill-slopes">');
for (const h of hills) {
  const base = A.BASE_ELEVATION;
  const mid = (h.plateau + base) / 2;
  P(`<polygon points="${pts(h.outline)}" fill="none" stroke="${elevColor(mid)}" stroke-width="${(h.slope * S).toFixed(1)}" stroke-linejoin="round" opacity="0.55"/>`);
}
P('</g>');
P('<g id="hills">');
for (const h of hills) {
  P(`<polygon points="${pts(h.outline)}" fill="${elevColor(h.plateau)}" stroke="${h.kind === 'terrace' ? 'none' : '#6e5a3c'}" stroke-width="${h.kind === 'terrace' ? 0 : 0.8}" stroke-opacity="0.6"><title>${esc(`${h.name}: plateau ${h.plateau} m, summit ${h.summit} m`)}</title></polygon>`);
  for (const c of h.cliffs ?? []) P(`<line x1="${X(c.a[0])}" y1="${Y(c.a[1])}" x2="${X(c.b[0])}" y2="${Y(c.b[1])}" stroke="#4a3520" stroke-width="${(view !== 'city') ? 3 : 2}" stroke-dasharray="2,1.5"><title>${esc(c.note ?? 'cliff')}</title></line>`);
}
P('</g>');

// Regions
P('<g id="regions" fill="none" stroke="#7a2e2e" stroke-width="1" stroke-dasharray="6,4" opacity="0.55">');
for (const r of A.REGIONS) P(`<polygon points="${pts(r.polygon)}"><title>${esc(r.latin)}</title></polygon>`);
P('</g>');

// Water
P('<g id="water">');
for (const r of A.RIVERS) P(`<polygon points="${pts(riverPolygon(r))}" fill="#7fa7c9" stroke="#4d7aa3" stroke-width="0.8"><title>${esc(r.name)}</title></polygon>`);
for (const i of A.ISLANDS) P(`<polygon points="${pts(i.outline)}" fill="#d8ccaa" stroke="#4d7aa3" stroke-width="1"><title>${esc(i.name)}</title></polygon>`);
P('</g>');

// Aqueducts
P('<g id="aqueducts" fill="none">');
for (const a of A.AQUEDUCTS) {
  const dash = a.kind === 'underground' ? '3,4' : a.kind === 'mixed' ? '8,3' : '';
  P(`<polyline points="${pts(a.points)}" stroke="#7a5c99" stroke-width="${a.kind === 'arcade' ? 2.6 : 1.6}" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="0.85"><title>${esc(`${a.latin} (${a.kind}) channel ${a.channelElevation[0]}-${a.channelElevation.at(-1)} m`)}</title></polyline>`);
}
P('</g>');

// Roads
P('<g id="roads" fill="none" stroke-linecap="round" stroke-linejoin="round">');
for (const r of A.ROADS) {
  const w = Math.max(r.kind === 'via' ? 1.6 : 1.1, r.width * S);
  const dash = r.kind === 'stairs' ? 'stroke-dasharray="1.5,1.5"' : r.confidence === 'low' ? 'stroke-dasharray="5,2.5"' : '';
  P(`<polyline points="${pts(r.points)}" stroke="${ROAD[r.kind]}" stroke-width="${w.toFixed(1)}" ${dash} opacity="0.9"><title>${esc(`${r.latin ?? ''} ${r.name} (${r.kind}, ${r.confidence})`)}</title></polyline>`);
}
P('</g>');

// Walls
P('<g id="walls" fill="none" stroke-linejoin="round">');
for (const w of A.WALLS) {
  const style = { intact: '', partial: '', ruinous: 'stroke-dasharray="6,3"', 'built-over': 'stroke-dasharray="2,4"' }[w.state];
  const sw = (w.state === 'partial' || w.state === 'intact' ? 3.2 : 2) + (w.rampartWidth ? w.rampartWidth * S * 0.6 : 0);
  P(`<polyline points="${pts(w.points)}" stroke="#7b2d26" stroke-width="${sw.toFixed(1)}" ${style} opacity="0.8"><title>${esc(`${w.name} (${w.state})`)}</title></polyline>`);
}
P('</g>');

// Bridges
P('<g id="bridges" stroke-linecap="butt">');
for (const b of A.BRIDGES) {
  P(`<line x1="${X(b.a[0])}" y1="${Y(b.a[1])}" x2="${X(b.b[0])}" y2="${Y(b.b[1])}" stroke="${b.arches === 0 ? '#8b5a2b' : '#3b3026'}" stroke-width="${Math.max(2.2, b.width * S).toFixed(1)}"><title>${esc(`${b.latin}: ${b.built}`)}</title></line>`);
}
P('</g>');

// Gates
P('<g id="gates">');
for (const g of A.GATES) {
  const [x, y] = [X(g.at[0]), Y(g.at[1])];
  P(`<g transform="translate(${x},${y}) rotate(${g.rotation})"><rect x="-4" y="-2.5" width="8" height="5" fill="#f3e9d2" stroke="#7b2d26" stroke-width="1.2"/><line x1="0" y1="-2.5" x2="0" y2="-7" stroke="#7b2d26" stroke-width="1"/><title>${esc(`${g.latin}: ${g.state}`)}</title></g>`);
}
P('</g>');

// Landmarks (big ones first so small ones stay on top)
const area = (l) => {
  const f = l.footprint;
  if (f.kind === 'rect') return f.w * f.d;
  if (f.kind === 'circle') return Math.PI * f.r * f.r;
  if (f.kind === 'ellipse') return Math.PI * f.rx * f.rz;
  return 1e6;
};
const lms = [...A.LANDMARKS].sort((a, b) => area(b) - area(a));
P('<g id="landmarks">');
for (const l of lms) {
  const f = l.footprint;
  const fill = CAT[l.category] ?? '#aaa';
  const open = l.siting === 'open';
  const underground = l.siting === 'underground';
  const style = open
    ? `fill="${l.category === 'garden' ? 'url(#hatch)' : fill}" fill-opacity="${l.category === 'garden' ? 1 : 0.25}" stroke="${fill}" stroke-width="0.8" stroke-dasharray="3,2"`
    : underground
      ? `fill="none" stroke="#444" stroke-width="0.9" stroke-dasharray="1.5,1.5"`
      : `fill="${fill}" fill-opacity="0.85" stroke="#2b2117" stroke-width="0.6"`;
  const tip = `<title>${esc(`${l.name} (${l.latin}) - ${l.category}, ${l.status113}, rot ${l.rotation}, P${l.priority}, ${l.confidence}`)}</title>`;
  if (f.kind === 'poly') {
    P(`<polygon points="${pts(f.points)}" ${style}>${tip}</polygon>`);
    continue;
  }
  const cx = X(l.center[0]);
  const cy = Y(l.center[1]);
  P(`<g transform="translate(${cx},${cy}) rotate(${l.rotation})">`);
  if (f.kind === 'rect') {
    const w = f.w * S;
    const d = f.d * S;
    P(`<rect x="${(-w / 2).toFixed(1)}" y="${(-d / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${d.toFixed(1)}" ${style}>${tip}</rect>`);
    if (!open && !underground) P(`<line x1="${(-w / 2).toFixed(1)}" y1="${(-d / 2).toFixed(1)}" x2="${(w / 2).toFixed(1)}" y2="${(-d / 2).toFixed(1)}" stroke="#d01010" stroke-width="${(view !== 'city') ? 1.6 : 1}"/>`);
  } else if (f.kind === 'ellipse') {
    P(`<ellipse cx="0" cy="0" rx="${(f.rx * S).toFixed(1)}" ry="${(f.rz * S).toFixed(1)}" ${style}>${tip}</ellipse>`);
    P(`<line x1="${(-f.rx * S).toFixed(1)}" y1="0" x2="${(f.rx * S).toFixed(1)}" y2="0" stroke="#d01010" stroke-width="0.6" stroke-dasharray="2,2"/>`);
  } else {
    const r = f.r * S;
    P(`<circle cx="0" cy="0" r="${Math.max(r, 1.2).toFixed(1)}" ${style}>${tip}</circle>`);
    P(`<line x1="0" y1="0" x2="0" y2="${(-Math.max(r, 1.2) - ((view !== 'city') ? 4 : 2.5)).toFixed(1)}" stroke="#d01010" stroke-width="1"/>`);
  }
  P('</g>');
}
P('</g>');

// Region numerals
P('<g id="region-labels" fill="#7a2e2e" opacity="0.7" text-anchor="middle" font-weight="bold">');
for (const r of A.REGIONS) {
  const [cx, cz] = centroid(r.polygon);
  P(`<text x="${X(cx)}" y="${Y(cz)}" font-size="${(view !== 'city') ? 28 : 22}">${ROMAN[r.number]}</text>`);
}
P('</g>');

// Labels
P('<g id="labels" text-anchor="middle" fill="#1d1408" stroke="#f6f0e0" stroke-width="2.2" paint-order="stroke" stroke-linejoin="round">');
const placed = [];
const fits = (x, y, w, h) => {
  for (const b of placed) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
  placed.push([x, y, w, h]);
  return true;
};
const labelOrder = [...A.LANDMARKS].sort((a, b) => a.priority - b.priority || area(b) - area(a));
for (const l of labelOrder) {
  if (view === 'city' && l.priority === 3 && area(l) < 3000) continue;
  const fs = (view !== 'city') ? (l.priority === 1 ? 9 : 8) : l.priority === 1 ? 7 : l.priority === 2 ? 6.5 : 6;
  const name = l.name.length > 34 ? `${l.name.slice(0, 32)}…` : l.name;
  const tw = name.length * fs * 0.5;
  let x = X(l.center[0]);
  let y = Y(l.center[1]) + fs * 0.35;
  if (l.footprint.kind === 'poly') [x, y] = [X(centroid(l.footprint.points)[0]), Y(centroid(l.footprint.points)[1])];
  const tries = [0, -fs * 1.2, fs * 1.2, -fs * 2.4, fs * 2.4];
  for (const dy of tries) {
    if (fits(x - tw / 2, y + dy - fs, tw, fs * 1.1)) {
      P(`<text x="${x}" y="${(y + dy).toFixed(1)}" font-size="${fs}">${esc(name)}</text>`);
      break;
    }
  }
}
// hill names
for (const h of A.HILLS) {
  if (h.kind === 'terrace') continue;
  const [cx, cz] = centroid(h.outline);
  if (cx < B.minX - pad || cx > B.maxX + pad || cz < B.minZ - pad || cz > B.maxZ + pad) continue;
  P(`<text x="${X(cx)}" y="${Y(cz)}" font-size="${(view !== 'city') ? 13 : 11}" font-style="italic" fill="#4a3520" opacity="0.75">${esc(h.latin.split(' (')[0])}</text>`);
}
P(`<text x="${X(-1150)}" y="${Y(-150)}" font-size="${(view !== 'city') ? 14 : 12}" font-style="italic" fill="#24507a">Tiberis</text>`);
P('</g>');

// Bounds
const rect = (b, dash, color, label) => {
  P(`<rect x="${X(b.minX)}" y="${Y(b.minZ)}" width="${((b.maxX - b.minX) * S).toFixed(1)}" height="${((b.maxZ - b.minZ) * S).toFixed(1)}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`);
  P(`<text x="${X(b.minX) + 4}" y="${Y(b.minZ) - 5}" font-size="11" fill="${color}">${label}</text>`);
};
rect(A.CORE_BOUNDS, '10,6', '#b00000', 'CORE_BOUNDS (first playable)');
if (view === 'city') rect(A.CITY_BOUNDS, '4,4', '#555', 'CITY_BOUNDS');
// Origin marker
P(`<circle cx="${X(0)}" cy="${Y(0)}" r="3" fill="#d4a017" stroke="#000" stroke-width="0.8"><title>Miliarium Aureum (origin)</title></circle>`);

P('</g>'); // end clip
// North arrow + scale bar + legend
const lx = 20;
const ly = H + 18;
P(`<g transform="translate(${W - 40},40)"><polygon points="0,-22 8,8 0,2 -8,8" fill="#222"/><text x="0" y="24" font-size="14" text-anchor="middle">N</text></g>`);
const bar = (view !== 'city') ? 200 : 1000;
P(`<g transform="translate(${lx},${ly})"><rect x="0" y="0" width="${bar * S}" height="6" fill="#222"/><rect x="0" y="0" width="${(bar * S) / 2}" height="6" fill="#fff" stroke="#222"/><text x="0" y="20" font-size="11">0</text><text x="${bar * S}" y="20" font-size="11" text-anchor="middle">${bar} m (real)</text></g>`);
const leg = [
  ['#7fa7c9', 'Tiber / water'], ['#7b2d26', 'Servian Wall (dashed = built over)'], ['#7a5c99', 'aqueduct (solid arcade, dashed underground)'],
  ['#5a4630', 'roads (dashed = low confidence)'], ['#d01010', 'red edge = main facade'], [CAT.temple, 'temple'], [CAT.forum, 'forum'],
  [CAT.baths, 'baths'], [CAT.palace, 'palace'], [CAT.garden, 'garden (hatched, open)'],
];
leg.forEach(([c, t], i) => {
  const x = lx + (bar * S) + 40 + (i % 5) * Math.max(170, (W - bar * S - 80) / 5);
  const y = ly + Math.floor(i / 5) * 22;
  P(`<rect x="${x}" y="${y - 9}" width="14" height="10" fill="${c}" stroke="#333" stroke-width="0.5"/><text x="${x + 20}" y="${y}" font-size="11">${esc(t)}</text>`);
});
P(`<text x="${lx}" y="${H + LEGEND_H - 30}" font-size="12">SKYROME atlas - Rome c. AD 113 (${view}). Real metres, origin = Miliarium Aureum, +x east, +z south. Hills shaded by elevation (cream ~8 m to brown ~85 m). ${A.LANDMARKS.length} landmarks, ${A.ROADS.length} roads.</text>`);
P(`<text x="${lx}" y="${H + LEGEND_H - 12}" font-size="11" fill="#555">Generated by scripts/atlas/render-atlas.mjs from src/data/atlas.ts. Hover shapes for names (in a browser).</text>`);
P('</svg>');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, o.join('\n'));
console.log(`wrote ${out} (${W}x${H + LEGEND_H}px, ${(o.join('\n').length / 1024).toFixed(0)} KB)`);
