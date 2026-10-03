/**
 * Resolves an Appearance's garment list into layered rules the mesh builders follow: which
 * garment is outermost where, hem and sleeve lengths, belts, cloak kind, scabbards.
 */
import * as THREE from 'three';
import type { Appearance, ArmorLook, Garment } from '../../appearance';
import { srgb } from './common';

export type Hem = 'short' | 'knee' | 'long';
export type Sleeve = 'none' | 'short' | 'elbow' | 'long';

export interface Cloth {
  color: THREE.Color;
  trim?: THREE.Color;
}

export interface Outfit {
  tunic: (Cloth & { hem: Hem; sleeve: Sleeve; clavi?: 'wide' | 'narrow' }) | null;
  toga: Cloth | null;
  stola: Cloth | null;
  palla: Cloth | null;
  cloak: (Cloth & { kind: 'paenula' | 'lacerna' | 'sagum' }) | null;
  subligaculum: Cloth | null;
  apron: Cloth | null;
  braccae: Cloth | null;
  /** Belt at the waist (tunic cinch) or a military cingulum with its studded apron. */
  belt: { color: THREE.Color; military: boolean; high: boolean } | null;
  armor: ArmorLook;
  footwear: 'calcei' | 'caligae' | 'soleae' | 'barefoot';
  /** Military neck scarf. */
  focale: THREE.Color | null;
  /** Retiarius' high shoulder guard on the left shoulder. */
  galerus: boolean;
  /** Scabbard on the right hip (legionary gladius) or left (officers, spatha), or none. */
  scabbard: 'R' | 'L' | null;
  /** True when no garment covers the chest (gladiators, laborers). */
  bareChest: boolean;
  /** Derived: hem height class of the longest lower garment. */
  hem: Hem | null;
}

const PURPLE = '#4f1838';

export function resolveOutfit(app: Appearance): Outfit {
  const female = app.sex === 'female';
  const find = (k: Garment['kind']) => app.garments.find((g) => g.kind === k);
  const cloth = (g?: Garment): Cloth | null => (g ? { color: srgb(g.color), trim: g.trim ? srgb(g.trim) : undefined } : null);

  const tg = find('tunica') ?? find('tunica-long') ?? find('tunica-short');
  let tunic: Outfit['tunic'] = null;
  if (tg) {
    let hem: Hem = tg.kind === 'tunica-long' ? 'long' : tg.kind === 'tunica-short' ? 'short' : 'knee';
    if (female && tg.kind === 'tunica') hem = 'long';
    let sleeve: Sleeve = tg.kind === 'tunica-short' ? 'none' : hem === 'long' ? 'elbow' : 'short';
    if (tg.sleeves) sleeve = tg.sleeves;
    tunic = { color: srgb(tg.color), trim: tg.trim ? srgb(tg.trim) : tg.clavi ? srgb(PURPLE) : undefined, hem, sleeve, clavi: tg.clavi };
  }

  const armor = app.armor ?? {};
  const braccae = cloth(find('braccae'));
  const military = !!armor.body || app.footwear === 'caligae';
  const toga = cloth(find('toga'));
  const stola = cloth(find('stola'));
  const palla = cloth(find('palla'));
  const cg = find('paenula') ?? find('lacerna') ?? find('sagum');
  const cloak = cg ? { ...cloth(cg)!, kind: cg.kind as 'paenula' | 'lacerna' | 'sagum' } : null;
  const subligaculum = cloth(find('subligaculum'));
  const apron = cloth(find('apron'));
  const bg = find('balteus');

  let belt: Outfit['belt'] = null;
  if (bg) belt = { color: srgb(bg.color), military, high: false };
  else if (military && (armor.body || tunic)) belt = { color: srgb('#3b2a1c'), military: true, high: false };
  else if (tunic && !toga && !stola) belt = { color: srgb(female ? '#8a6a4a' : '#5a4330'), military: false, high: female };
  if (subligaculum && !tunic) belt = { color: srgb(bg?.color ?? '#6b4a2e'), military: false, high: false };

  const weapon = app.weapon ?? 'none';
  let scabbard: Outfit['scabbard'] = null;
  if (weapon === 'gladius' && military) scabbard = 'R';
  else if (weapon === 'spatha') scabbard = 'L';
  else if (weapon === 'gladius') scabbard = 'L';

  const hems: Hem[] = [];
  if (tunic) hems.push(tunic.hem);
  if (toga || stola) hems.push('long');
  if (palla && !stola && !tunic) hems.push('knee');
  const order: Hem[] = ['short', 'knee', 'long'];
  const hem = hems.length ? hems.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a)) : null;

  return {
    tunic,
    toga,
    stola,
    palla,
    cloak,
    subligaculum,
    apron,
    braccae,
    belt,
    armor,
    footwear: app.footwear ?? (military ? 'caligae' : 'soleae'),
    focale: armor.body && armor.body.kind !== 'leather' && armor.body.kind !== 'padded' && armor.body.kind !== 'manica-only' ? srgb('#d9cfb8') : null,
    galerus: !armor.helmet && (weapon === 'trident' || weapon === 'net') && !!armor.manica,
    scabbard,
    bareChest: !tunic && !toga && !stola && !armor.body,
    hem,
  };
}
