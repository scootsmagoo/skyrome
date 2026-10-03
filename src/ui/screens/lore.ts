/** Loading-screen quotations (authentic, with sources) and gameplay tips. */
import { codeLabel, type Action, type Bindings } from '../../core/Input';

export interface Quote {
  latin: string;
  english: string;
  source: string;
}

export const QUOTES: Quote[] = [
  { latin: 'Panem et circenses.', english: 'Bread and circuses.', source: 'Juvenal, Satires X.81' },
  { latin: 'Quis custodiet ipsos custodes?', english: 'Who will guard the guards themselves?', source: 'Juvenal, Satires VI' },
  { latin: 'Mens sana in corpore sano.', english: 'A sound mind in a sound body.', source: 'Juvenal, Satires X.356' },
  { latin: 'Ubi solitudinem faciunt, pacem appellant.', english: 'They make a desert and call it peace.', source: 'Tacitus, Agricola 30' },
  { latin: 'Tu regere imperio populos, Romane, memento.', english: 'Remember, Roman, to rule the peoples with your power.', source: 'Virgil, Aeneid VI.851' },
  { latin: 'Parcere subiectis et debellare superbos.', english: 'To spare the humbled and to war down the proud.', source: 'Virgil, Aeneid VI.853' },
  { latin: 'Sed fugit interea, fugit inreparabile tempus.', english: 'But meanwhile it flies — time flies, never to return.', source: 'Virgil, Georgics III.284' },
  { latin: 'Carpe diem, quam minimum credula postero.', english: 'Seize the day, trusting as little as possible in tomorrow.', source: 'Horace, Odes I.11' },
  { latin: 'Nihil est ab omni parte beatum.', english: 'Nothing is blessed in every part.', source: 'Horace, Odes II.16' },
  { latin: 'Omnia mutantur, nihil interit.', english: 'Everything changes; nothing perishes.', source: 'Ovid, Metamorphoses XV.165' },
  { latin: 'Festina lente.', english: 'Make haste slowly.', source: 'Augustus, in Suetonius, Augustus 25' },
  { latin: 'Fortes fortuna adiuvat.', english: 'Fortune favors the brave.', source: 'Terence, Phormio 203' },
  { latin: 'Multum, non multa.', english: 'Much, not many things.', source: 'Pliny the Younger, Letters VII.9' },
  { latin: 'Non est vivere, sed valere vita est.', english: 'Life is not merely living, but living well.', source: 'Martial, Epigrams VI.70' },
  { latin: 'Ave, imperator, morituri te salutant.', english: 'Hail, emperor — those about to die salute you.', source: 'Suetonius, Claudius 21' },
];

type TipFn = (key: (a: Action) => string) => string;

const TIPS: TipFn[] = [
  (k) => `Press ${k('toggleView')} to switch between first- and third-person views.`,
  (k) => `Hold ${k('block')} to raise your shield. Blocking with a scutum turns aside most of a blow.`,
  (k) => `${k('attack')} attacks; hold it for a slower, harder blow. ${k('readyWeapon')} draws or sheathes your weapon.`,
  (k) => `Press ${k('sneak')} to sneak. The eye above your crosshair opens as people notice you.`,
  (k) => `Press ${k('map')} for the map. Places you have discovered can be revisited.`,
  (k) => `Press ${k('journal')} for your journal. Track a quest to see its marker on the compass.`,
  (k) => `${k('walkToggle')} toggles walking. A citizen does not run through the Forum.`,
  () => 'Pietas grows when you honor the gods at their temples and shrines.',
  () => 'A crime seen by the Vigiles or the Urban Cohorts carries a bounty.',
  () => 'The Romans counted the hours from sunrise: the sixth hour, hora sexta, is always noon.',
  () => 'A denarius is worth four sestertii; a sestertius is worth four asses.',
  () => 'Shops close at dusk. Tabernae and popinae stay open late — and so do the thieves.',
  () => 'Read what you find. Some books will teach you a skill.',
  () => 'Trajan’s Column was dedicated in May of this year. The whole city is talking about it.',
  (k) => `The arrow keys turn the camera too, so you can play without the mouse.`,
];

export function tips(bindings: Bindings): string[] {
  const key = (a: Action) => codeLabel(bindings[a]?.find((c) => !c.startsWith('Wheel')) ?? '?');
  return TIPS.map((t) => t(key));
}
