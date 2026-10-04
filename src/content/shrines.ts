/**
 * Small shrines the player can pray at (docs/CONTENT.md §8.2; GDD §14.6, AC-18): the six crossroads
 * shrines (compita), the statue of Vortumnus, the shrine of Venus Cloacina, the spring of Juturna,
 * Vulcan's shrine, the Lacus Curtius, the Janus Geminus and Mercury's spring. Praying gives +5 Pietas
 * once a day at each (the compitum rule) and the Lares favor, on the Lemuria too: crossroads shrines
 * and open-air shrines stay open while the temple cellae are shut. The bible's proposals add a small
 * favour to some: Cloacina's purification removes `sordidus`, Juturna's water heals 10 HP and washes.
 *
 * (Temples with an offering and a blessing are the aedituus' business: src/dialogue/content/vendors.ts.)
 */
export interface ShrineSpec {
  /** Location id (also the id devotion remembers a day's prayer under). */
  id: string;
  name: string;
  latin?: string;
  /** Extra effect after the prayer. */
  boon?: 'purify' | 'heal-and-purify';
  /** Text shown after praying. */
  line: string;
}

export const SHRINES: ShrineSpec[] = [
  { id: 'compitum-capenae', name: 'Crossroads shrine by the Capena Gate', latin: 'Compitum Capenae', line: 'You pray to the Lares of the crossroads. The lamp burns a little brighter.' },
  { id: 'compitum-circi', name: 'Crossroads shrine below the Palatine', latin: 'Compitum Circi', line: 'You pray to the Lares of the crossroads. A pinch of incense, a few words, and the street feels kinder.' },
  { id: 'compitum-vici-tusci', name: 'Crossroads shrine of the Vicus Tuscus', latin: 'Compitum Vici Tusci', line: 'You pray to the Lares Augusti and the Genius of Caesar. The old altar is warm from the sun.' },
  { id: 'compitum-velabri', name: 'Crossroads shrine of the Velabrum', latin: 'Compitum Velabri', line: 'You pray to the Lares of the Velabrum. Somebody has left a few black beans on the step.' },
  { id: 'compitum-boarii', name: 'Crossroads shrine of the Cattle Market', latin: 'Compitum Boarii', line: 'You pray to the Lares of the cattle market. The offerings smell of hay and smoke.' },
  { id: 'compitum-acili', name: 'Crossroads shrine of Acilius', latin: 'Compitum Acili', line: 'You pray at the little distyle shrine on the Velia, set up in the year of the divine Augustus.' },
  { id: 'signum-vortumni', name: 'Statue of Vortumnus', latin: 'signum Vortumni', line: 'You greet Vortumnus, god of change and exchange, at the end of his street. Everything here is for sale.' },
  { id: 'shrine-venus-cloacina', name: 'Shrine of Venus Cloacina', latin: 'Sacellum Veneris Cloacinae', boon: 'purify', line: 'Venus the Purifier takes the sewer’s stain from you, as she did for the Romans and the Sabines with myrtle.' },
  { id: 'lacus-juturnae', name: 'Spring of Juturna', latin: 'Lacus Iuturnae', boon: 'heal-and-purify', line: 'You drink from Juturna’s spring, where the Twins watered their horses. The water is cold and bright.' },
  { id: 'volcanal', name: 'Shrine of Vulcan', latin: 'Volcanal', line: 'You greet Vulcan in his old open-air sanctuary. The stone is scorched with old fires.' },
  { id: 'lacus-curtius', name: 'The Lacus Curtius', latin: 'Lacus Curtius', line: 'You toss a quadrans into the old chasm for the health of Caesar, as the people did for Augustus.' },
  { id: 'janus-geminus', name: 'Shrine of Janus Geminus', latin: 'Ianus Geminus', line: 'You greet Janus at his shrine. The doors stand open, as they have for Parthia.' },
  { id: 'fons-mercurii', name: 'Mercury’s Spring', latin: 'aqua Mercurii', line: 'You dip your fingers in Mercury’s spring and ask the god for good dealing.' },
];
