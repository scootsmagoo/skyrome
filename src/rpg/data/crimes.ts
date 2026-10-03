/**
 * PROVISIONAL crimes, bounties and jurisdictions (GDD pending). Bounties are in denarii and use
 * Skyrim's proportions (assault 40, murder 1000, theft = half the value).
 */
import type { CrimeDef, CrimeId } from '../types';

export const CRIMES: Record<CrimeId, CrimeDef> = {
  trespass: { id: 'trespass', name: 'Trespassing', latin: 'violatio domus', bounty: 5 },
  lockpick: { id: 'lockpick', name: 'Breaking a lock', latin: 'effractura', bounty: 5 },
  theft: { id: 'theft', name: 'Theft', latin: 'furtum', bounty: 0, valueMult: 0.5 },
  pickpocket: { id: 'pickpocket', name: 'Pickpocketing', latin: 'furtum ex zona', bounty: 25, valueMult: 0.5 },
  assault: { id: 'assault', name: 'Assault', latin: 'iniuria', bounty: 40 },
  murder: { id: 'murder', name: 'Murder', latin: 'homicidium', bounty: 1000 },
  animal: { id: 'animal', name: 'Killing livestock', latin: 'damnum', bounty: 20 },
  sacrilege: { id: 'sacrilege', name: 'Sacrilege', latin: 'sacrilegium', bounty: 200, valueMult: 1 },
  arson: { id: 'arson', name: 'Arson', latin: 'incendium', bounty: 500 },
  veneficium: { id: 'veneficium', name: 'Poisoning or sorcery', latin: 'veneficium', bounty: 500 },
  escape: { id: 'escape', name: 'Escaping custody', latin: 'fuga e carcere', bounty: 100 },
  resist: { id: 'resist', name: 'Resisting arrest', latin: 'resistentia', bounty: 0 },
};

export interface JurisdictionDef {
  id: string;
  name: string;
  /** Faction whose guards enforce it. */
  guards: string;
  /** Where the player is jailed. */
  jail: string;
}

export const JURISDICTIONS: JurisdictionDef[] = [
  { id: 'roma', name: 'Rome', guards: 'urbaniciani', jail: 'carcer-tullianum' },
  { id: 'ostia', name: 'Ostia', guards: 'vigiles', jail: 'ostia-carcer' },
  { id: 'latium', name: 'Latium', guards: 'urbaniciani', jail: 'carcer-tullianum' },
];
