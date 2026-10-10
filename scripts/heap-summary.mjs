#!/usr/bin/env node
/**
 * Summarise a V8 .heapsnapshot without loading it as one JSON string (this game's is 400 MB to
 * 1 GB). Prints self size by node type and by (type, name), and with --owners the retainer chains
 * of the largest ArrayBuffer backing stores: who holds the big typed arrays.
 *
 *   node scripts/heap-summary.mjs file.heapsnapshot [--top 40] [--owners 25] [--min 2] [--coarse 5]
 *
 * --coarse K  group chains by their first K steps with indices removed (for many small buffers)
 * --depth D --skip S  chain length walked, and steps dropped from the front (with --coarse as the end)
 * --owners N   show the N biggest backing stores >= --min MB with a chain such as
 *              Float32Array.buffer -> BufferAttribute.array -> BufferGeometry.attributes ...
 *              (grouped when several have the same chain)
 */
import { readFileSync, statSync } from 'node:fs';

const file = process.argv[2];
if (process.argv.includes('--diff')) {
  const other = process.argv[process.argv.indexOf('--diff') + 1];
  const a = loadAgg(file);
  const b = loadAgg(other);
  const rows = [];
  for (const [k, v] of b) {
    const o = a.get(k) ?? { size: 0, n: 0 };
    rows.push([k, v.size - o.size, v.n - o.n]);
  }
  const gi = process.argv.indexOf('--grep');
  if (gi > 0) {
    const re = new RegExp(process.argv[gi + 1]);
    for (let i = rows.length - 1; i >= 0; i--) if (!re.test(rows[i][0])) rows.splice(i, 1);
  }
  rows.sort((x, y) => (gi > 0 ? y[2] - x[2] : y[1] - x[1]));
  const mb2 = (n) => (n / 1048576).toFixed(2).padStart(8);
  console.log('Growth from the first snapshot to the second, by node type / name (self size, count):');
  for (const r of rows.slice(0, 40)) console.log(`${mb2(r[1])} MB  ${String(r[2]).padStart(7)}  ${r[0]}`);
  process.exit(0);
}

/** (type / name) -> { size, n } for one snapshot (reads the file whole; fine to 2 GB). */
function loadAgg(f) {
  const b = readFileSync(f);
  const at = (s, from = 0) => b.indexOf(s, from);
  const mEnd = at('"nodes":[');
  const m = JSON.parse(b.toString('utf8', 0, mEnd).replace(/,\s*$/, '') + '}').snapshot;
  const nf = m.meta.node_fields;
  const ns = nf.length;
  const nodes = new Uint32Array(m.node_count * ns);
  let i = at('"nodes":[') + 9;
  let k = 0;
  let n = 0;
  for (; ; i++) {
    const c = b[i];
    if (c >= 48 && c <= 57) n = n * 10 + (c - 48);
    else {
      nodes[k++] = n;
      n = 0;
      if (c === 93) break;
    }
  }
  const strings = JSON.parse(b.toString('utf8', at('"strings":[') + 10).replace(/\}\s*$/, ''));
  const types = m.meta.node_types[0];
  const out = new Map();
  for (let j = 0; j < m.node_count; j++) {
    const key = `${types[nodes[j * ns + nf.indexOf('type')]]} / ${strings[nodes[j * ns + nf.indexOf('name')]] ?? '?'}`.slice(0, 120);
    const e = out.get(key) ?? { size: 0, n: 0 };
    e.size += nodes[j * ns + nf.indexOf('self_size')];
    e.n++;
    out.set(key, e);
  }
  return out;
}
const arg = (k, d) => (process.argv.includes('--' + k) ? Number(process.argv[process.argv.indexOf('--' + k) + 1]) : d);
const topN = arg('top', 40);
const ownersN = arg('owners', 0);
const minMB = arg('min', 2);
const hasIdx = process.argv.indexOf('--has');
const args = { has: hasIdx > 0 ? process.argv[hasIdx + 1] : '', coarse: arg('coarse', 0), depth: arg('depth', 7), skip: arg('skip', 0) };
if (!file || file.startsWith('--')) {
  console.error('usage: node scripts/heap-summary.mjs file.heapsnapshot [--top n] [--owners n]');
  process.exit(1);
}

// The file is read whole as a Buffer (fine up to 2 GB) and walked with a byte scanner.
const buf = readFileSync(file);
const find = (s, from = 0) => buf.indexOf(s, from);
const metaEnd = find('"nodes":[');
const meta = JSON.parse(buf.toString('utf8', 0, metaEnd).replace(/,\s*$/, '') + '}').snapshot;
const nodeFields = meta.meta.node_fields;
const edgeFields = meta.meta.edge_fields;
const nodeTypes = meta.meta.node_types[0];
const edgeTypes = meta.meta.edge_types[0];
const NS = nodeFields.length;
const ES = edgeFields.length;
const iType = nodeFields.indexOf('type');
const iName = nodeFields.indexOf('name');
const iSelf = nodeFields.indexOf('self_size');
const iEdges = nodeFields.indexOf('edge_count');
const eType = edgeFields.indexOf('type');
const eName = edgeFields.indexOf('name_or_index');
const eTo = edgeFields.indexOf('to_node');
const N = meta.node_count;
const E = meta.edge_count;
console.log(`${N} nodes, ${E} edges, ${(statSync(file).size / 1048576).toFixed(0)} MB file`);

/** Read the integers of an array that starts right after `marker` into `out` (stops at ']'). */
function readInts(marker, out) {
  let i = find(marker) + marker.length;
  let k = 0;
  let n = 0;
  for (; ; i++) {
    const c = buf[i];
    if (c >= 48 && c <= 57) n = n * 10 + (c - 48);
    else {
      out[k++] = n;
      n = 0;
      if (c === 93) break;
    }
  }
  return k;
}
const nodes = new Uint32Array(N * NS);
readInts('"nodes":[', nodes);
const edges = new Uint32Array(E * ES);
readInts('"edges":[', edges);

// Strings are last: parse that array on its own.
const sAt = find('"strings":[');
const strings = JSON.parse(buf.toString('utf8', sAt + 10).replace(/\}\s*$/, ''));

const agg = new Map();
let total = 0;
for (let n = 0; n < N; n++) {
  const sz = nodes[n * NS + iSelf];
  total += sz;
  const k = nodes[n * NS + iType] * 4294967296 + nodes[n * NS + iName];
  agg.set(k, (agg.get(k) ?? 0) + sz);
}
const rows = [...agg].map(([k, v]) => [nodeTypes[Math.floor(k / 4294967296)], strings[k % 4294967296] ?? '?', v]).sort((a, b) => b[2] - a[2]);
const mb = (n) => (n / 1048576).toFixed(1).padStart(8);
console.log(`total self size ${mb(total)} MB\n`);
const byType = new Map();
for (const r of rows) byType.set(r[0], (byType.get(r[0]) ?? 0) + r[2]);
console.log('By node type:');
for (const [t, v] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`${mb(v)} MB  ${t}`);
console.log('\nTop (type, name):');
for (const r of rows.slice(0, topN)) console.log(`${mb(r[2])} MB  ${r[0]} / ${String(r[1]).slice(0, 90)}`);

if (ownersN) {
  // Shortest retainer path from the GC roots: breadth-first over strong edges, so chains are real
  // (not cycles), then parent/edge per node.
  const first = new Uint32Array(N + 1);
  for (let n = 0, e0 = 0; n < N; n++) {
    first[n] = e0;
    e0 += nodes[n * NS + iEdges];
  }
  first[N] = E;
  const from = new Int32Array(N).fill(-1);
  const via = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  queue[qt++] = 0;
  seen[0] = 1;
  while (qh < qt) {
    const n = queue[qh++];
    for (let e = first[n]; e < first[n + 1]; e++) {
      const t = edgeTypes[edges[e * ES + eType]];
      if (t === 'weak') continue;
      const to = edges[e * ES + eTo] / NS;
      if (seen[to]) continue;
      seen[to] = 1;
      from[to] = n;
      via[to] = e;
      queue[qt++] = to;
    }
  }
  const label = (n) => `${strings[nodes[n * NS + iName]] ?? '?'}`.slice(0, 40);
  const edgeLabel = (e) => {
    const t = edgeTypes[edges[e * ES + eType]];
    const v = edges[e * ES + eName];
    return t === 'element' || t === 'hidden' ? `[${v}]` : `.${strings[v] ?? '?'}`;
  };
  const big = [];
  for (let n = 0; n < N; n++) {
    const sz = nodes[n * NS + iSelf];
    if (sz >= minMB * 1048576 && nodeTypes[nodes[n * NS + iType]] === 'native') big.push([n, sz]);
  }
  big.sort((a, b) => b[1] - a[1]);
  const chains = new Map();
  for (const [n, sz] of big) {
    let c = n;
    const parts = [];
    for (let d = 0; d < args.depth && from[c] >= 0; d++) {
      parts.push(`${label(from[c])}${edgeLabel(via[c])}`);
      c = from[c];
    }
    if (args.has && !parts.some((x) => x.includes(args.has))) continue;
    const key = (args.coarse ? parts.slice(args.skip ?? 0, args.coarse).map((x) => x.replace(/\[\d+\]|@\d+/g, '')) : parts).join(' <- ');
    const o = chains.get(key) ?? { n: 0, bytes: 0, max: 0 };
    o.n++;
    o.bytes += sz;
    o.max = Math.max(o.max, sz);
    chains.set(key, o);
  }
  console.log(`\nBackings >= ${minMB} MB: ${big.length}, ${(big.reduce((s, b) => s + b[1], 0) / 1048576).toFixed(0)} MB. By retainer chain (first referrer each step):`);
  for (const [k, v] of [...chains].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, ownersN)) console.log(`${mb(v.bytes)} MB x${v.n} (max ${(v.max / 1048576).toFixed(1)})  ${k}`);
}
