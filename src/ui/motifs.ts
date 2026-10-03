/**
 * Roman decorative motifs generated as SVG: laurel branches and wreaths, the meander (Greek key)
 * band, and the SPQR crest. Generated rather than hand-drawn so sizes and leaf counts can vary.
 */

type Pt = [number, number];

/** Almond leaf with its base at `p`, pointing along angle `a` (radians). */
function leafPath(p: Pt, a: number, len: number, wid: number): string {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const tx = (x: number, y: number): string => `${(p[0] + x * c - y * s).toFixed(2)} ${(p[1] + x * s + y * c).toFixed(2)}`;
  return `M${tx(0, 0)} Q${tx(len * 0.45, -wid)} ${tx(len, 0)} Q${tx(len * 0.45, wid)} ${tx(0, 0)} Z`;
}

/** Quadratic Bézier point and tangent angle. */
function quad(p0: Pt, p1: Pt, p2: Pt, t: number): { p: Pt; a: number } {
  const u = 1 - t;
  const p: Pt = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return { p, a: Math.atan2(dy, dx) };
}

/**
 * Laurel branch along a quadratic curve from p0 to p2 (control p1). Leaves alternate sides (or
 * come in pairs for wreaths), lean toward the tip and shrink along the branch; a few berries sit
 * in the leaf axils. Returns leaf/berry path data and the stem path.
 */
export function laurelBranch(p0: Pt, p1: Pt, p2: Pt, leaves = 7, leafLen = 9, leafWid = 3.2, paired = false): { leaves: string; stem: string } {
  let d = '';
  const spread = 0.62;
  for (let i = 0; i < leaves; i++) {
    const t = 0.06 + (i / Math.max(1, leaves - 1)) * 0.82;
    const { p, a } = quad(p0, p1, p2, t);
    const k = 1 - t * 0.38;
    if (paired) {
      d += leafPath(p, a - spread, leafLen * k, leafWid * k);
      d += leafPath(p, a + spread, leafLen * k, leafWid * k);
    } else {
      const side = i % 2 === 0 ? -1 : 1;
      d += leafPath(p, a + side * spread, leafLen * k, leafWid * k);
      if (i % 3 === 1) {
        // A berry on the other side of the stem.
        const r = leafWid * 0.42 * k;
        const bx = p[0] + Math.cos(a - side * 1.2) * r * 2.1;
        const by = p[1] + Math.sin(a - side * 1.2) * r * 2.1;
        d += `M${(bx - r).toFixed(2)} ${by.toFixed(2)} a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0 a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0 Z `;
      }
    }
  }
  // Terminal leaf at the tip.
  const tip = quad(p0, p1, p2, 1);
  d += leafPath(tip.p, tip.a, leafLen * 0.7, leafWid * 0.62);
  const stem = `M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
  return { leaves: d, stem };
}

/** A horizontal ornament: two laurel branches growing outward from a central lozenge. */
export function laurelRule(width = 240, height = 30, cls = 'sr-laurel-rule'): string {
  const cy = height / 2;
  const cx = width / 2;
  const n = Math.max(4, Math.round(width / 40));
  const len = height * 0.46;
  const wid = height * 0.15;
  const right = laurelBranch([cx + 9, cy], [cx + width * 0.24, cy + 1.5], [width - len * 0.8, cy - 1], n, len, wid);
  const left = laurelBranch([cx - 9, cy], [cx - width * 0.24, cy + 1.5], [len * 0.8, cy - 1], n, len, wid);
  const r = height * 0.15;
  return `<svg class="${cls}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <path d="${right.stem} ${left.stem}" fill="none" stroke="currentColor" stroke-width="${(height * 0.04).toFixed(2)}" stroke-linecap="round"/>
    <path d="${right.leaves} ${left.leaves}" fill="currentColor"/>
    <path d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z" fill="currentColor"/>
  </svg>`;
}

/** Corona laurea: two branches curving up around a circle, open at the top. */
export function wreath(size = 160, cls = 'sr-wreath', leaves = 11): string {
  const c = size / 2;
  const r = size * 0.4;
  const pt = (deg: number): Pt => [c + Math.cos((deg * Math.PI) / 180) * r, c + Math.sin((deg * Math.PI) / 180) * r];
  // Angles in SVG space (y down): 90° is the bottom.
  const right = laurelBranch(pt(100), [c + r * 1.42, c + r * 0.12], pt(-62), leaves, size * 0.085, size * 0.03, true);
  const left = laurelBranch(pt(80), [c - r * 1.42, c + r * 0.12], pt(-118), leaves, size * 0.085, size * 0.03, true);
  const tie = `M${c - size * 0.05} ${c + r + size * 0.01} Q${c} ${c + r - size * 0.03} ${c + size * 0.05} ${c + r + size * 0.01} Q${c} ${c + r + size * 0.06} ${c - size * 0.05} ${c + r + size * 0.01} Z`;
  return `<svg class="${cls}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <path d="${right.stem} ${left.stem}" fill="none" stroke="currentColor" stroke-width="${(size * 0.008).toFixed(2)}"/>
    <path d="${right.leaves} ${left.leaves}" fill="currentColor"/>
    <path d="${tie}" fill="currentColor"/>
  </svg>`;
}

/** Wreath with SPQR inside, for the pause menu and loading screen. */
export function spqrCrest(size = 120, cls = 'sr-crest'): string {
  const inner = wreath(size, '', 10).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg class="${cls}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${inner}
    <text x="${size / 2}" y="${size * 0.555}" text-anchor="middle" font-family="Cinzel, serif" font-weight="700"
      font-size="${size * 0.2}" letter-spacing="${size * 0.012}" fill="currentColor">SPQR</text>
  </svg>`;
}

/**
 * Meander (Greek key) band as a data-URI for CSS `background-image`, tiling horizontally.
 * `h` is the tile height in px; stroke color is baked in.
 */
export function meanderDataUri(color: string, h = 18, strokeW = 1.6): string {
  const u = h / 6;
  const w = u * 6;
  // One key unit: up, right, down, left, up (spiral), then along the baseline.
  const d = [
    `M0 ${u * 5}`,
    `H${u * 1}`, `V${u * 1}`, `H${u * 5}`, `V${u * 4}`, `H${u * 3}`, `V${u * 3}`, `H${u * 4}`, `V${u * 2}`, `H${u * 2}`, `V${u * 5}`, `H${w}`,
  ].join(' ');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<path d='${d}' fill='none' stroke='${color}' stroke-width='${strokeW}' stroke-linecap='square'/>` +
    `<path d='M0 ${u * 0.3} H${w} M0 ${h - u * 0.3} H${w}' stroke='${color}' stroke-width='${strokeW * 0.7}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Thin corner flourishes for panels: an L with a small diamond. */
export function cornerOrnament(cls = 'sr-corner'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1 23 V6 A5 5 0 0 1 6 1 H23" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <path d="M5 9 L9 5 L13 9 L9 13 Z" fill="currentColor" opacity="0.85" transform="translate(-1 -1) scale(0.75)"/>
  </svg>`;
}
