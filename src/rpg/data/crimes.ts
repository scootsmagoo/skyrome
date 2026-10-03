/**
 * Crimes, bounties and ledgers — docs/GDD.md §14.1. Bounties go on the city ledger (`urbs`),
 * enforced by the Urban Cohorts by day and the Vigiles by night, or on the Praetorians' separate
 * Palatine ledger (`palatium`: the Palatine and treason).
 */
import type { CrimeDef, CrimeId } from '../types';

export const CRIMES: Record<CrimeId, CrimeDef> = {
  trespass: { id: 'trespass', name: 'Trespassing', latin: 'violatio domus', bounty: 5 },
  furtum: { id: 'furtum', name: 'Theft', latin: 'furtum', bounty: 0, valueMult: 2, min: 5 },
  'furtum-personae': { id: 'furtum-personae', name: 'Pickpocketing', latin: 'furtum personae', bounty: 25, valueMult: 2 },
  effractio: { id: 'effractio', name: 'Lockpicking', latin: 'effractio', bounty: 10 },
  rixa: { id: 'rixa', name: 'Starting a brawl', latin: 'rixa', bounty: 10, violent: true },
  vis: { id: 'vis', name: 'Assault', latin: 'vis', bounty: 40, violent: true },
  sacrilegium: { id: 'sacrilegium', name: 'Sacrilege', latin: 'sacrilegium', bounty: 250 },
  'violatio-sepulcri': { id: 'violatio-sepulcri', name: 'Tomb violation', latin: 'violatio sepulcri', bounty: 150 },
  usurpatio: { id: 'usurpatio', name: 'Usurping a status', latin: 'usurpatio', bounty: 100 },
  falsum: { id: 'falsum', name: 'Forgery', latin: 'falsum', bounty: 500 },
  homicidium: { id: 'homicidium', name: 'Murder', latin: 'homicidium', bounty: 1000, violent: true, murder: true },
  'caedes-supplicis': { id: 'caedes-supplicis', name: 'Killing one who yielded', latin: 'caedes supplicis', bounty: 1000, violent: true, murder: true },
  incendium: { id: 'incendium', name: 'Arson', latin: 'incendium', bounty: 1500, violent: true },
  maiestas: { id: 'maiestas', name: 'Treason', latin: 'maiestas', bounty: 5000, violent: true, ledger: 'palatium' },
  fuga: { id: 'fuga', name: 'Escaping custody', latin: 'fuga', bounty: 100 },
};

/** Status crimes (§3.2, §8.2): the toga without citizenship 100, the gold ring without rank 200. */
export const USURPATIO_BOUNTY = { toga: 100, anulus: 200 };

export interface LedgerDef {
  id: string;
  name: string;
  /** Who enforces it: by day / by night. */
  guards: { day: string; night: string };
  /** Where the player is held. */
  jail: string;
}

export const LEDGERS: LedgerDef[] = [
  { id: 'urbs', name: 'The City', guards: { day: 'cohortes-urbanae', night: 'vigiles' }, jail: 'carcer-tullianum' },
  { id: 'palatium', name: 'The Palatine', guards: { day: 'praetoriani', night: 'praetoriani' }, jail: 'castra-praetoria' },
];
