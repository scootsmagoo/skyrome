/**
 * Crimes, bounties and jurisdictions. GDD §14.1 (law) is pending; ids follow the GDD's Latin
 * (furtum, caedes-supplicis, usurpatio-togae, falsum) and bounties keep Skyrim's proportions
 * (assault 40, murder 1000, theft = half the value). Jurisdiction is by authority (research
 * §B9.7, society §8.2): the Vigiles by night, the Urban Cohorts by day, the Praetorians at the palace.
 */
import type { CrimeDef, CrimeId } from '../types';

export const CRIMES: Record<CrimeId, CrimeDef> = {
  violatio: { id: 'violatio', name: 'Trespassing', latin: 'violatio domus', bounty: 5 },
  effractura: { id: 'effractura', name: 'Breaking a lock', latin: 'effractura', bounty: 5 },
  furtum: { id: 'furtum', name: 'Theft', latin: 'furtum', bounty: 0, valueMult: 0.5 },
  'furtum-zonae': { id: 'furtum-zonae', name: 'Pickpocketing', latin: 'furtum ex zona', bounty: 25, valueMult: 0.5 },
  iniuria: { id: 'iniuria', name: 'Assault', latin: 'iniuria', bounty: 40 },
  caedes: { id: 'caedes', name: 'Murder', latin: 'caedes', bounty: 1000 },
  'caedes-supplicis': { id: 'caedes-supplicis', name: 'Killing one who yielded', latin: 'caedes supplicis', bounty: 1000 },
  damnum: { id: 'damnum', name: 'Killing livestock', latin: 'damnum', bounty: 20 },
  sacrilegium: { id: 'sacrilegium', name: 'Sacrilege', latin: 'sacrilegium', bounty: 200, valueMult: 1 },
  incendium: { id: 'incendium', name: 'Arson', latin: 'incendium', bounty: 500 },
  veneficium: { id: 'veneficium', name: 'Poisoning or sorcery', latin: 'veneficium', bounty: 500 },
  falsum: { id: 'falsum', name: 'Forgery', latin: 'falsum', bounty: 1000 },
  'usurpatio-togae': { id: 'usurpatio-togae', name: 'Wearing the toga without citizenship', latin: 'usurpatio togae', bounty: 500 },
  'usurpatio-anuli': { id: 'usurpatio-anuli', name: 'Wearing the gold ring without rank', latin: 'usurpatio anuli', bounty: 250 },
  fuga: { id: 'fuga', name: 'Escaping custody', latin: 'fuga e carcere', bounty: 100 },
  resistentia: { id: 'resistentia', name: 'Resisting arrest', latin: 'resistentia', bounty: 50 },
};

export interface JurisdictionDef {
  id: string;
  name: string;
  /** Faction whose guards enforce it. */
  guards: string;
  /** Where the player is held. */
  jail: string;
}

export const JURISDICTIONS: JurisdictionDef[] = [
  { id: 'cohortes-urbanae', name: 'Urban Cohorts (by day)', guards: 'cohortes-urbanae', jail: 'carcer-tullianum' },
  { id: 'vigiles', name: 'Vigiles (by night)', guards: 'vigiles', jail: 'carcer-tullianum' },
  { id: 'praetoriani', name: 'Praetorian Guard (the palace)', guards: 'praetoriani', jail: 'castra-praetoria' },
];

/** Crimes the Vigiles take at any hour (fire and burglary are theirs). */
export const VIGILES_CRIMES: readonly CrimeId[] = ['incendium', 'effractura'];
