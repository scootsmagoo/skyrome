/**
 * Icon set drawn on a 24×24 grid: map/compass location icons, item-type icons and UI glyphs.
 * Each icon is a list of paths so it can render as inline SVG (menus, HUD) and as Path2D on the
 * map canvas. Paths are filled (even-odd) unless `stroke` is set.
 */
import type { ItemDef } from '../rpg/types';
import type { MapIconKind } from './types';

export interface IconPath {
  d: string;
  stroke?: boolean;
  /** Stroke width in grid units (default 1.8). */
  width?: number;
}

export interface IconDef {
  paths: IconPath[];
  /** SVG transform applied to the whole icon (inline SVG only). */
  transform?: string;
}

const f = (d: string): IconPath => ({ d });
const s = (d: string, width = 1.8): IconPath => ({ d, stroke: true, width });

/** Circle sub-path. */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;

/** Sectors of a disc with gaps (panis quadratus, the scored Pompeian loaf). */
function sectors(cx: number, cy: number, r: number, r0: number, n: number, gapDeg: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = ((i * 360) / n + gapDeg / 2) * (Math.PI / 180);
    const a1 = (((i + 1) * 360) / n - gapDeg / 2) * (Math.PI / 180);
    const p = (a: number, rr: number) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
    d += `M${p(a0, r0)} L${p(a0, r)} A${r} ${r} 0 0 1 ${p(a1, r)} L${p(a1, r0)} Z `;
  }
  return d;
}

/** A scalloped wax seal. */
function seal(cx: number, cy: number, r: number, bumps: number): string {
  let d = '';
  const steps = bumps * 6;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 + 0.07 * Math.cos(a * bumps));
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)} `;
  }
  return d + 'Z';
}

export const LOCATION_ICONS: Record<MapIconKind, IconDef> = {
  temple: {
    paths: [
      f('M12 2.6 L22 8.2 H2 Z M12 4.9 L17.4 7.4 H6.6 Z'),
      f('M2.5 9.1 H21.5 V10.7 H2.5 Z'),
      f('M4 11.6 H6.1 V19 H4 Z M8.6 11.6 H10.7 V19 H8.6 Z M13.3 11.6 H15.4 V19 H13.3 Z M17.9 11.6 H20 V19 H17.9 Z'),
      f('M2.5 19.7 H21.5 V21.5 H2.5 Z'),
    ],
  },
  // A portico: flat entablature over columns and steps (the temple has a pediment instead).
  forum: {
    paths: [
      f('M2 3.4 H22 V5 H2 Z M3 5.8 H21 V8.2 H3 Z'),
      f('M4.2 9 H6.4 V17.8 H4.2 Z M8.6 9 H10.8 V17.8 H8.6 Z M13.2 9 H15.4 V17.8 H13.2 Z M17.6 9 H19.8 V17.8 H17.6 Z'),
      f('M3 18.6 H21 V20 H3 Z M2 20.6 H22 V22 H2 Z'),
    ],
  },
  baths: {
    paths: [
      s('M3.5 13 H20.5'),
      s('M5 13 V14.5 C5 17.5 7 19.5 10 19.5 H14 C17 19.5 19 17.5 19 14.5 V13'),
      s('M8 10 C6.8 8.8 9.2 7.6 8 6.4 C6.8 5.2 9.2 4 8 2.8', 1.5),
      s('M12 10 C10.8 8.8 13.2 7.6 12 6.4 C10.8 5.2 13.2 4 12 2.8', 1.5),
      s('M16 10 C14.8 8.8 17.2 7.6 16 6.4 C14.8 5.2 17.2 4 16 2.8', 1.5),
    ],
  },
  arena: {
    paths: [f(`${ellipse(12, 12, 10.2, 8)} ${ellipse(12, 12, 8.6, 6.6)} ${ellipse(12, 12, 6.9, 5.1)} ${ellipse(12, 12, 4.6, 3)}`)],
  },
  theatre: {
    paths: [f('M1.8 15.5 A10.2 10.2 0 0 1 22.2 15.5 H17.8 A5.8 5.8 0 0 0 6.2 15.5 Z'), f('M2.5 17.4 H21.5 V20 H2.5 Z')],
  },
  market: {
    paths: [
      f('M10 2.2 H14 V3.8 H13.4 V5.8 C17 7 18.8 9.8 18.8 13.2 C18.8 16.6 16.4 19.2 13.4 20.6 L12 22.6 L10.6 20.6 C7.6 19.2 5.2 16.6 5.2 13.2 C5.2 9.8 7 7 10.6 5.8 V3.8 H10 Z'),
      s('M10.6 5 C8.2 5 7.2 6.8 7.6 8.8', 1.4),
      s('M13.4 5 C15.8 5 16.8 6.8 16.4 8.8', 1.4),
    ],
  },
  gate: {
    paths: [f('M3 21.5 V7 L5.5 4.8 L8 7 V9 H16 V7 L18.5 4.8 L21 7 V21.5 H14.6 V15.6 A2.6 2.6 0 0 0 9.4 15.6 V21.5 Z')],
  },
  palace: {
    paths: [
      f('M2 21.5 V9.5 H22 V21.5 Z M10 21.5 V16 A2 2 0 0 1 14 16 V21.5 Z M4.6 12.4 H7 V15.4 H4.6 Z M17 12.4 H19.4 V15.4 H17 Z'),
      f('M5 6 H19 V8.4 H5 Z'),
      f('M12 1.8 L14 5 H10 Z'),
    ],
  },
  tavern: {
    paths: [
      f('M5.5 6.5 H18.5 L17.4 13.4 C17 16 14.8 17.8 12 17.8 C9.2 17.8 7 16 6.6 13.4 Z'),
      f('M11 17.6 H13 V19.6 H11 Z M8 19.6 H16 V21.4 H8 Z'),
      s('M6 8.6 C3.2 8.6 3.2 12.8 6.4 12.6', 1.5),
      s('M18 8.6 C20.8 8.6 20.8 12.8 17.6 12.6', 1.5),
    ],
  },
  shop: {
    paths: [f(`${circle(12, 12, 9.4)} ${circle(12, 12, 7.8)} ${circle(12, 12, 6.2)}`), f('M10.2 8.2 H11.8 V15.8 H10.2 Z M12.2 8.2 C15.4 8.2 16 10.4 16 12 C16 13.6 15.4 15.8 12.2 15.8 V14.3 C14 14.3 14.4 13.2 14.4 12 C14.4 10.8 14 9.7 12.2 9.7 Z')],
  },
  dungeon: {
    paths: [f('M1.8 21.5 C3 12.5 7 6 12 6 C17 6 21 12.5 22.2 21.5 Z M9.4 21.5 V15.6 A2.6 2.6 0 0 1 14.6 15.6 V21.5 Z'), f('M10 3.2 L12 1.4 L14 3.2 L12 4.6 Z')],
  },
  landmark: {
    paths: [f('M10.2 19.6 L11 6.2 L12 3 L13 6.2 L13.8 19.6 Z'), f('M7.4 19.8 H16.6 V22 H7.4 Z')],
  },
  monument: {
    paths: [
      f('M10.1 7.6 H13.9 V18.8 H10.1 Z'),
      f('M9 6 H15 V7.3 H9 Z M8.4 19 H15.6 V22 H8.4 Z'),
      f(`M11.1 2.6 H12.9 V5.8 H11.1 Z ${circle(12, 2.2, 1.1)}`),
    ],
  },
  camp: {
    paths: [
      f('M5 2.8 H19 A2.2 2.2 0 0 1 21.2 5 V19 A2.2 2.2 0 0 1 19 21.2 H5 A2.2 2.2 0 0 1 2.8 19 V5 A2.2 2.2 0 0 1 5 2.8 Z M5.2 5.2 V18.8 H18.8 V5.2 Z'),
      f('M11.1 5.2 H12.9 V18.8 H11.1 Z M5.2 11.1 H11.1 V12.9 H5.2 Z M12.9 11.1 H18.8 V12.9 H12.9 Z'),
    ],
  },
  bridge: {
    paths: [
      f('M1.5 7.5 H22.5 V10 H1.5 Z'),
      f('M1.5 10 H22.5 V18.5 H20.5 V15 A3.2 3.2 0 0 0 14.1 15 V18.5 H12.9 V16.4 A0.9 0.9 0 0 0 11.1 16.4 V18.5 H9.9 V15 A3.2 3.2 0 0 0 3.5 15 V18.5 H1.5 Z'),
      s('M1.5 21.2 C4 20 6 22.4 8.5 21.2 C11 20 13 22.4 15.5 21.2 C18 20 20 22.4 22.5 21.2', 1.2),
    ],
  },
  house: {
    paths: [f('M2.3 11.2 L12 3.4 L21.7 11.2 H19.6 V21.2 H4.4 V11.2 Z M10 21.2 V15.4 H14 V21.2 Z')],
  },
  garden: {
    paths: [
      f('M2.6 9.4 C2.6 6 7.6 4.2 12 4.2 C16.4 4.2 21.4 6 21.4 9.4 C21.4 11.4 17.4 12.2 12 12.2 C6.6 12.2 2.6 11.4 2.6 9.4 Z'),
      f('M11.1 11.6 L10.4 21.4 H13.6 L12.9 11.6 Z'),
    ],
  },
};

export type ItemIconKind =
  | 'blade' | 'spear' | 'blunt' | 'bow' | 'shield' | 'armor' | 'helmet' | 'clothing'
  | 'food' | 'potion' | 'drink' | 'ingredient' | 'scroll' | 'letter' | 'key' | 'tool' | 'lamp' | 'seal' | 'coin' | 'ammo' | 'bone';

export const ITEM_ICONS: Record<ItemIconKind, IconDef> = {
  blade: {
    transform: 'rotate(45 12 12)',
    paths: [
      f('M12 0.6 L14.3 4.4 L13.9 15 H10.1 L9.7 4.4 Z'),
      f('M7.6 15 H16.4 A0.9 0.9 0 0 1 16.4 16.8 H7.6 A0.9 0.9 0 0 1 7.6 15 Z'),
      f('M11 16.8 H13 V20.4 H11 Z'),
      f(circle(12, 21.7, 1.6)),
    ],
  },
  spear: {
    transform: 'rotate(45 12 12)',
    paths: [f('M11.4 7.4 H12.6 V23.4 H11.4 Z'), f('M12 0.4 C13.8 2.6 14.2 5 12.9 7.8 H11.1 C9.8 5 10.2 2.6 12 0.4 Z')],
  },
  blunt: {
    transform: 'rotate(45 12 12)',
    paths: [f('M10.6 23 L11.1 9.6 C9.4 7.6 9.4 3.4 12 1.6 C14.6 3.4 14.6 7.6 12.9 9.6 L13.4 23 Z')],
  },
  bow: {
    paths: [s('M6.5 2.5 C17.5 6.5 17.5 17.5 6.5 21.5', 2), s('M6.5 2.5 V21.5', 0.9), s('M4.5 12 H20', 1.2), f('M19 9.8 L22.6 12 L19 14.2 Z')],
  },
  shield: {
    paths: [
      f('M6.5 2.2 H17.5 C19 2.2 19.6 3.2 19.6 4.8 V19.2 C19.6 20.8 19 21.8 17.5 21.8 H6.5 C5 21.8 4.4 20.8 4.4 19.2 V4.8 C4.4 3.2 5 2.2 6.5 2.2 Z M11.4 3.6 V9.3 H12.6 V3.6 Z M11.4 14.7 V20.4 H12.6 V14.7 Z ' + circle(12, 12, 2.9)),
      f(circle(12, 12, 1.7)),
    ],
  },
  armor: {
    paths: [
      f('M7 3 L9.6 2 C10.6 3.6 13.4 3.6 14.4 2 L17 3 L19.6 6 L18 8.6 L17 8.1 V21.4 H7 V8.1 L6 8.6 L4.4 6 Z M7 10.8 V11.7 H17 V10.8 Z M7 14.1 V15 H17 V14.1 Z M7 17.4 V18.3 H17 V17.4 Z'),
    ],
  },
  helmet: {
    paths: [
      f('M4.2 12.6 C4.2 7.2 7.8 4 12.4 4 C17 4 19.8 7.4 19.8 12 L22.4 14.2 V15.8 L17.8 14.8 L17.2 14 H14.2 V19.8 C14.2 20.6 13.6 21.2 12.8 21.2 H10.8 C10 21.2 9.4 20.6 9.4 19.8 V14 H4.2 Z M4.2 10.8 V11.8 H15.4 V10.8 Z'),
      f('M11.4 1.8 H13.4 V4.4 H11.4 Z'),
    ],
  },
  clothing: {
    paths: [
      f('M8 3 L4 5 L2 10.2 L5 11.2 L6.6 8.6 V21.4 H17.4 V8.6 L19 11.2 L22 10.2 L20 5 L16 3 C15 4.6 9 4.6 8 3 Z M9.2 4.8 V21.4 H10.2 V4.8 Z M13.8 4.8 V21.4 H14.8 V4.8 Z'),
    ],
  },
  food: {
    paths: [f(sectors(12, 12, 9.6, 1.6, 8, 9))],
  },
  potion: {
    paths: [
      f('M10.4 2.2 H13.6 V3.8 H13 V8 C16.4 9.4 18 12 18 15.2 C18 18.8 15.4 21.6 12 21.6 C8.6 21.6 6 18.8 6 15.2 C6 12 7.6 9.4 11 8 V3.8 H10.4 Z M7.6 14.6 C7.6 14.8 7.6 15 7.6 15.2 C7.6 17.9 9.6 20 12 20 C14.4 20 16.4 17.9 16.4 15.2 C16.4 15 16.4 14.8 16.4 14.6 Z'),
    ],
  },
  drink: { paths: [] }, // filled from LOCATION_ICONS.tavern below
  ingredient: {
    paths: [
      s('M5 21 C8 15 12 10 19 4', 1.4),
      f('M8.6 15.4 C6.4 15 4.6 13.2 4.4 11 C6.6 11.2 8.4 13 8.6 15.4 Z M11.4 11.6 C9.2 11.2 7.4 9.4 7.2 7.2 C9.4 7.4 11.2 9.2 11.4 11.6 Z M14.6 8.4 C12.4 8 10.6 6.2 10.4 4 C12.6 4.2 14.4 6 14.6 8.4 Z'),
      f('M10.4 17.6 C10.8 15.4 12.6 13.6 14.8 13.4 C14.6 15.6 12.8 17.4 10.4 17.6 Z M13.6 13.4 C14 11.2 15.8 9.4 18 9.2 C17.8 11.4 16 13.2 13.6 13.4 Z'),
    ],
  },
  scroll: {
    paths: [
      f('M3.4 5 A2.1 2.1 0 0 1 7.6 5 V19 A2.1 2.1 0 0 1 3.4 19 Z M16.4 5 A2.1 2.1 0 0 1 20.6 5 V19 A2.1 2.1 0 0 1 16.4 19 Z'),
      f('M7.6 5.4 H16.4 V18.6 H7.6 Z M9.2 8 V8.9 H14.8 V8 Z M9.2 10.6 V11.5 H14.8 V10.6 Z M9.2 13.2 V14.1 H14.8 V13.2 Z M9.2 15.8 V16.7 H13 V15.8 Z'),
    ],
  },
  letter: {
    paths: [f('M2.5 5.6 H21.5 V18.4 H2.5 Z M4.2 7 L12 12.8 L19.8 7 H17.6 L12 11.1 L6.4 7 Z'), f(seal(12, 14.2, 2.6, 7))],
  },
  key: {
    paths: [
      f(`${circle(7, 9, 4.2)} ${circle(7, 9, 2.2)}`),
      f('M11 8.1 H21.6 V9.9 H11 Z M17 9.9 H18.6 V13.8 H17 Z M19.8 9.9 H21.4 V12.8 H19.8 Z'),
    ],
  },
  tool: {
    paths: [f('M3 4.6 H14.6 C15.6 4.6 16.6 5.6 16.6 6.8 V7.6 H14.6 V9 H3 Z'), f('M7.8 9 H10.2 V21.6 H7.8 Z')],
  },
  lamp: {
    paths: [
      f('M3.2 13 C3.2 10 7.2 8.6 11 8.6 C14 8.6 16 9.6 17.4 11 L21.4 10.6 C22.2 10.5 22.5 11.5 21.8 11.9 L18 14 C16.6 16 14 17.2 11 17.2 C7.2 17.2 3.2 16 3.2 13 Z ' + ellipse(10.4, 11.6, 1.5, 1.1)),
      s('M3.6 12.6 C1.8 11.6 2 9.4 3.8 9.4', 1.4),
      f('M21.2 9.4 C20.2 8 21 6.2 22.2 5 C22.6 6.6 23.4 8 21.9 9.4 Z'),
      f('M6 18.8 H15.6 V20.4 H6 Z'),
    ],
  },
  seal: {
    paths: [f(`${seal(12, 12, 9, 9)} ${circle(12, 12, 6)}`), f('M12 7.6 L13.3 10.6 L16.4 10.8 L14 12.8 L14.8 15.9 L12 14.2 L9.2 15.9 L10 12.8 L7.6 10.8 L10.7 10.6 Z')],
  },
  coin: {
    paths: [f(`${circle(12, 12, 9.4)} ${circle(12, 12, 7.9)}`), f('M8.4 8.4 L9.6 7.2 L12 9.6 L14.4 7.2 L15.6 8.4 L13.2 10.8 L15.6 13.2 L14.4 14.4 L12 12 L9.6 14.4 L8.4 13.2 L10.8 10.8 Z M8 16.4 H16 V17.6 H8 Z')],
  },
  // A knucklebone (talus), the Roman die.
  bone: {
    transform: 'rotate(-30 12 12)',
    paths: [f('M6.4 8.6 C4.2 8.8 2.6 7.2 3.4 5.4 C4.2 3.8 6.4 3.8 7.6 5.4 C8.6 6.6 9.4 7 12 7 C14.6 7 15.4 6.6 16.4 5.4 C17.6 3.8 19.8 3.8 20.6 5.4 C21.4 7.2 19.8 8.8 17.6 8.6 C16.6 10 16.6 14 17.6 15.4 C19.8 15.2 21.4 16.8 20.6 18.6 C19.8 20.2 17.6 20.2 16.4 18.6 C15.4 17.4 14.6 17 12 17 C9.4 17 8.6 17.4 7.6 18.6 C6.4 20.2 4.2 20.2 3.4 18.6 C2.6 16.8 4.2 15.2 6.4 15.4 C7.4 14 7.4 10 6.4 8.6 Z ' + circle(12, 12, 1.6))],
  },
  ammo: {
    transform: 'rotate(45 12 12)',
    paths: [
      f('M8.4 6.4 H9.4 V22 H8.4 Z M14.6 6.4 H15.6 V22 H14.6 Z'),
      f('M8.9 1.8 L10.6 6.6 H7.2 Z M15.1 1.8 L16.8 6.6 H13.4 Z'),
      f('M7.2 19 L8.4 18 V22 L7.2 23 Z M10.6 19 L9.4 18 V22 L10.6 23 Z M13.4 19 L14.6 18 V22 L13.4 23 Z M16.8 19 L15.6 18 V22 L16.8 23 Z'),
    ],
  },
};
ITEM_ICONS.drink = LOCATION_ICONS.tavern;

export type UiIconKind = 'eye' | 'eyeClosed' | 'check' | 'lock' | 'weight' | 'questMarker' | 'playerArrow' | 'plus' | 'minus' | 'target' | 'close' | 'leaf';

export const UI_ICONS: Record<UiIconKind, IconDef> = {
  eye: { paths: [f(`M1.4 12 C5 5.6 19 5.6 22.6 12 C19 18.4 5 18.4 1.4 12 Z ${circle(12, 12, 4.4)}`), f(circle(12, 12, 2.4))] },
  eyeClosed: { paths: [s('M2 11 C6 16 18 16 22 11', 2), s('M5.2 14.2 L3.6 16.4 M9.4 15.8 L8.8 18.4 M14.6 15.8 L15.2 18.4 M18.8 14.2 L20.4 16.4', 1.6)] },
  check: { paths: [s('M4.5 12.5 L9.8 17.6 L19.5 6.8', 2.6)] },
  lock: { paths: [s('M8 10.5 V7.6 A4 4 0 0 1 16 7.6 V10.5', 2), f('M5 10.4 H19 V21.4 H5 Z')] },
  weight: { paths: [f(`M6 9 H18 L20.6 21.4 H3.4 Z ${circle(12, 5.4, 2)}`), s(circle(12, 5.4, 2.6), 1.6)] },
  questMarker: { paths: [f('M12 21.5 L4.4 5.6 L12 9.4 L19.6 5.6 Z')] },
  playerArrow: { paths: [f('M12 1.8 L19.8 21.4 L12 16.8 L4.2 21.4 Z')] },
  plus: { paths: [f('M10.8 4 H13.2 V10.8 H20 V13.2 H13.2 V20 H10.8 V13.2 H4 V10.8 H10.8 Z')] },
  minus: { paths: [f('M4 10.8 H20 V13.2 H4 Z')] },
  target: { paths: [s(circle(12, 12, 6.5), 1.8), f(circle(12, 12, 2)), f('M11 1.5 H13 V6 H11 Z M11 18 H13 V22.5 H11 Z M1.5 11 H6 V13 H1.5 Z M18 11 H22.5 V13 H18 Z')] },
  close: { paths: [s('M6 6 L18 18 M18 6 L6 18', 2.2)] },
  leaf: { paths: [f('M12 2 C17.4 6 17.4 16 12 22 C6.6 16 6.6 6 12 2 Z')] },
};

/** Inline SVG markup for an icon (uses currentColor). */
export function iconSvg(icon: IconDef, cls = 'sr-icon'): string {
  const body = icon.paths
    .map((p) =>
      p.stroke
        ? `<path d="${p.d}" fill="none" stroke="currentColor" stroke-width="${p.width ?? 1.8}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${p.d}" fill="currentColor" fill-rule="evenodd"/>`,
    )
    .join('');
  const g = icon.transform ? `<g transform="${icon.transform}">${body}</g>` : body;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${g}</svg>`;
}

/** Item → icon by type/weapon class/slot. `ItemDef.icon` (emoji) is ignored on purpose. */
export function itemIconKind(def: ItemDef): ItemIconKind {
  switch (def.type) {
    case 'weapon': {
      const c = def.weapon?.class;
      if (c === 'spear' || c === 'thrown') return 'spear';
      if (c === 'blunt' || c === 'unarmed') return 'blunt';
      if (c === 'bow' || c === 'sling') return 'bow';
      return 'blade';
    }
    case 'ammo': return 'ammo';
    case 'shield': return 'shield';
    case 'armor': return def.slot === 'head' ? 'helmet' : 'armor';
    case 'clothing': return 'clothing';
    case 'consumable': {
      const t = def.tags ?? [];
      if (t.includes('drink')) return 'drink';
      if (t.includes('potion') || t.includes('medicine')) return 'potion';
      return 'food';
    }
    case 'ingredient': return 'ingredient';
    case 'book': return def.tags?.includes('letter') ? 'letter' : 'scroll';
    case 'key': return 'key';
    case 'tool': return 'tool';
    case 'quest': return 'seal';
    default:
      if (def.tags?.includes('lamp')) return 'lamp';
      if (def.tags?.includes('dice')) return 'bone';
      if (def.tags?.includes('coin')) return 'coin';
      return def.questItem ? 'seal' : 'lamp';
  }
}

export function itemIconSvg(def: ItemDef, cls = 'sr-icon'): string {
  return iconSvg(ITEM_ICONS[itemIconKind(def)], cls);
}

/** Cached Path2D objects for canvas rendering. */
const pathCache = new Map<IconDef, { path: Path2D; stroke?: boolean; width?: number }[]>();
export function iconPaths(icon: IconDef) {
  let p = pathCache.get(icon);
  if (!p) {
    p = icon.paths.map((ip) => ({ path: new Path2D(ip.d), stroke: ip.stroke, width: ip.width }));
    pathCache.set(icon, p);
  }
  return p;
}

/** Draw an icon on a canvas centered at (x, y) with the given pixel size. */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: IconDef, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  for (const p of iconPaths(icon)) {
    if (p.stroke) {
      ctx.lineWidth = p.width ?? 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(p.path);
    } else ctx.fill(p.path, 'evenodd');
  }
  ctx.restore();
}
