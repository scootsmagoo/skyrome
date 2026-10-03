/**
 * Ambient vignettes (GDD §12.3 tier 3: "every 15–30 s by day, 30–60 s at night", ≥ 25 types in
 * v0.1): tiny staged scenes the NPC/crowd module plays near the player. Pure data: who takes part
 * (by schedule archetype and avatar role), where and when, what they say, and a one-line staging
 * note. Nothing here is a quest; a vignette never blocks the street for more than ~20 s.
 *
 * Sources: Juvenal Sat. 3 (the city's dangers), Martial (noise, clients, the barber), the Pompeian
 * graffiti and the Roman day (docs/research/society.md §3). Inventions are plain [G] flavour.
 */
import type { AvatarRole } from '../actors/avatar/variants';
import type { DistrictId } from './barks';

export interface VignetteActor {
  /** Schedule archetype (§14.7) or a free role name for the staging module. */
  role: string;
  /** Avatar role for a generated look (src/actors/avatar/variants.ts). */
  look: AvatarRole;
  count?: number;
}

export interface VignetteLine {
  /**
   * Who speaks: an index into the cast expanded by `count` (cast [{ a, count: 2 }, { b }] gives
   * 0 and 1 = the two a's, 2 = b); -1 = an unseen voice (a window, a crowd).
   */
  by: number;
  text: string;
  /** Seconds after the previous line (default 2.5). */
  after?: number;
}

export interface VignetteDef {
  id: string;
  title: string;
  /** v0.1 districts where it may play ('any' = all). */
  districts: DistrictId[] | 'any';
  /** Game hours [from, to); wraps past midnight when from > to. */
  hours: [number, number];
  /** Only on these festival days (ids as in barks.ts). */
  festivals?: string[];
  cast: VignetteActor[];
  lines: VignetteLine[];
  /** What the staging module does: positions, idle loops, a prop, an exit. */
  staging: string;
  /** Relative frequency (default 1). */
  weight?: number;
  source?: string;
}

/** Number of people in a vignette (the cast expanded by count). */
export function castSize(v: Pick<VignetteDef, 'cast'>): number {
  return v.cast.reduce((n, c) => n + (c.count ?? 1), 0);
}

const DAY: [number, number] = [6, 19];
const NIGHT: [number, number] = [20.5, 4.5];

export const VIGNETTES: VignetteDef[] = [
  {
    id: 'vig-pots-from-window', title: 'Something from a window', districts: ['dist-velabrum-boarium', 'dist-circus-maximus', 'dist-forum-holitorium'], hours: [18, 2],
    cast: [{ role: 'passer-by', look: 'plebeian-man' }],
    lines: [{ by: -1, text: 'Look out below!' }, { by: 0, text: 'Gods! Missed me by a hand! Make your will before you walk home, they say. They’re right.', after: 1.2 }],
    staging: 'A pot shatters a few meters ahead of the player; the passer-by jumps back and shakes a fist at an upper window.',
    source: 'Juvenal 3.268–277',
  },
  {
    id: 'vig-dog-sausage', title: 'The dog and the sausage', districts: ['dist-velabrum-boarium', 'dist-forum-romanum', 'dist-vallis-colossei'], hours: DAY,
    cast: [{ role: 'tabernarius', look: 'plebeian-man' }, { role: 'dog', look: 'child' }],
    lines: [{ by: 0, text: 'Thief! Stop that dog! That was a Lucanian sausage!' }, { by: 0, text: 'Mercury guide your teeth, then, you mangy philosopher.', after: 3 }],
    staging: 'A stray runs past with a sausage; the stallholder chases a few steps and gives up. (The dog uses the child slot until animals exist.)',
  },
  {
    id: 'vig-night-cart', title: 'Night carts', districts: ['dist-circus-maximus', 'dist-velabrum-boarium', 'dist-forum-romanum'], hours: NIGHT,
    cast: [{ role: 'plaustrarius', look: 'plebeian-man' }, { role: 'plaustrarius', look: 'slave' }],
    lines: [{ by: 0, text: 'Hup! Hup! Move, you misbegotten mule!' }, { by: 1, text: 'The left wheel’s squealing again.' }, { by: 0, text: 'Let it squeal. Everybody else in this city does.' }],
    staging: 'A loaded cart creaks past at walking pace with a driver and a boy at the mule’s head; carts are legal only at night.',
    source: 'Caesar’s Lex Iulia municipalis on daytime wheeled traffic; Juvenal 3.236–238',
    weight: 2,
  },
  {
    id: 'vig-compitum-offering', title: 'An offering at the crossroads', districts: 'any', hours: [5, 10],
    cast: [{ role: 'matrona', look: 'matron' }, { role: 'servus', look: 'slave' }],
    lines: [{ by: 0, text: 'Lares of the crossroads, keep this house and this street.' }, { by: 1, text: 'The honey cake, domina.' }],
    staging: 'At a compitum shrine, a woman places a honey cake and a pinch of incense; the slave holds a small lamp.',
  },
  {
    id: 'vig-schoolmaster', title: 'The schoolmaster at dawn', districts: ['dist-forum-romanum', 'dist-velabrum-boarium'], hours: [5.5, 9],
    cast: [{ role: 'ludi-magister', look: 'greek' }, { role: 'puer', look: 'child', count: 3 }],
    lines: [{ by: 0, text: 'Again! “Arma virumque cano…”' }, { by: 1, text: '…Troiae qui primus ab oris…' }, { by: 0, text: 'Louder! The coppersmiths can hear you, so can I!' }],
    staging: 'Under a shop awning, a teacher with a cane drills three children on benches.',
    source: 'Martial 9.68, 12.57 (schoolmasters at dawn)',
  },
  {
    id: 'vig-baker-dawn', title: 'Bread before dawn', districts: ['dist-velabrum-boarium'], hours: [3.5, 6.5],
    cast: [{ role: 'pistor', look: 'freedman' }, { role: 'servus', look: 'slave', count: 2 }],
    lines: [{ by: 0, text: 'Faster with the loaves! The Forum wakes in an hour and it wakes hungry.' }],
    staging: 'Two slaves carry boards of round loaves out of a bakery into the dark street.',
    source: 'Martial 12.57 (bakers before dawn)',
  },
  {
    id: 'vig-money-changer', title: 'A bad coin', districts: ['dist-forum-romanum'], hours: DAY,
    cast: [{ role: 'nummularius', look: 'merchant' }, { role: 'cliens', look: 'plebeian-man' }],
    lines: [{ by: 0, text: 'Plated. Bronze under silver. Look, the edge.' }, { by: 1, text: 'I had it from a senator’s steward!' }, { by: 0, text: 'Then the senator has a bronze steward.' }],
    staging: 'At a table by the Basilica Aemilia, a money-changer bites a denarius and slides it back.',
  },
  {
    id: 'vig-litter', title: 'A litter comes through', districts: ['dist-forum-romanum', 'dist-velia', 'dist-fora-imperialia'], hours: DAY,
    cast: [{ role: 'lecticarius', look: 'slave', count: 4 }, { role: 'patronus', look: 'patrician-man' }],
    lines: [{ by: 0, text: 'Make way! Way for the litter!' }, { by: -1, text: 'Watch your elbows!' }],
    staging: 'Four bearers shoulder through the crowd with a curtained litter; the crowd parts and closes behind.',
    source: 'Juvenal 3.239–248',
  },
  {
    id: 'vig-crier-column', title: 'The crier', districts: ['dist-forum-romanum', 'dist-fora-imperialia'], hours: [7, 17], festivals: ['fest-columna-eve'],
    cast: [{ role: 'praeco', look: 'freedman' }],
    lines: [{ by: 0, text: 'Hear, citizens! Tomorrow at the first hour the Senate and People dedicate the Column of the emperor in his Forum!' }, { by: 0, text: 'The road from the Forum to the Forum of Trajan will be closed at dawn! Bring no carts! Bring no dogs!' }],
    staging: 'A crier on an upturned crate, with a small crowd gathering and drifting off.',
  },
  {
    id: 'vig-dice-steps', title: 'Dice on the steps', districts: ['dist-forum-romanum'], hours: DAY,
    cast: [{ role: 'otiosus', look: 'plebeian-man', count: 3 }],
    lines: [{ by: 0, text: 'Venus! Venus! Pay up!' }, { by: 1, text: 'Again. Double or nothing.' }, { by: 2, text: 'Aedile! … No, it’s a priest. Carry on.' }],
    staging: 'Three idlers squat over a gaming board cut into the Basilica Julia steps, tossing knucklebones.',
    source: 'Gaming boards on the Basilica Julia steps [A]; dice illegal outside the Saturnalia [A]',
    weight: 2,
  },
  {
    id: 'vig-fullers', title: 'The fullers', districts: ['dist-velabrum-boarium'], hours: DAY,
    cast: [{ role: 'fullo', look: 'slave', count: 2 }],
    lines: [{ by: 0, text: 'Tread, tread, tread. Minerva, why did you make fullers?' }, { by: 1, text: 'Because someone has to wash the senators.' }],
    staging: 'Two workers tread cloth in vats at a fullery door, singing in time.',
  },
  {
    id: 'vig-beggar-gate', title: 'The old soldier', districts: ['dist-circus-maximus'], hours: DAY,
    cast: [{ role: 'mendicus', look: 'elderly' }],
    lines: [{ by: 0, text: 'An as for a man who held the line at Tapae! Eh? You weren’t there. I was.' }],
    staging: 'An old man with a crutch sits under the Porta Capena arches holding out a bowl.',
  },
  {
    id: 'vig-fans-argue', title: 'Fans of the arena', districts: ['dist-vallis-colossei'], hours: DAY,
    cast: [{ role: 'fan', look: 'plebeian-man', count: 2 }],
    lines: [{ by: 0, text: 'A retiarius is a fish-catcher in a skirt.' }, { by: 1, text: 'And your murmillo is a fish in a pot. Nereus will have him.' }, { by: 0, text: 'Say that by the Meta Sudans and see what happens.' }],
    staging: 'Two men argue nose to nose, then are pulled apart by friends. (Seeds misc-meta-sudans-rixa.)',
  },
  {
    id: 'vig-gladiator-drill', title: 'Drill at the posts', districts: ['dist-vallis-colossei'], hours: [7, 12],
    cast: [{ role: 'gladiator', look: 'murmillo', count: 2 }, { role: 'doctor', look: 'plebeian-man' }],
    lines: [{ by: 2, text: 'Again! Shield up, point out, step!' }, { by: 0, text: 'Hah!' }],
    staging: 'Inside the Ludus, recruits strike wooden posts with the rudis on the trainer’s count.',
  },
  {
    id: 'vig-sacrifice', title: 'A small sacrifice', districts: ['dist-forum-romanum', 'dist-capitolium', 'dist-velabrum-boarium'], hours: [7, 12],
    cast: [{ role: 'sacerdos', look: 'priest' }, { role: 'victimarius', look: 'slave' }, { role: 'tibicen', look: 'greek' }],
    lines: [{ by: 0, text: 'Favete linguis!' }, { by: -1, text: '(A pipe plays to drown out ill-omened words.)' }],
    staging: 'Before a temple altar, a veiled priest, a flute-player and an attendant with a cockerel. Bystanders fall silent.',
    source: 'Pliny NH 28.11 (the flute-player masks ill-omened sounds)',
  },
  {
    id: 'vig-barber', title: 'At the barber’s', districts: ['dist-forum-romanum'], hours: DAY,
    cast: [{ role: 'tonsor', look: 'freedman' }, { role: 'cliens', look: 'plebeian-man' }],
    lines: [{ by: 1, text: 'Ow! Gently!' }, { by: 0, text: 'Hold still and you’ll have a face like Trajan’s. Move and you’ll have a face like Hannibal’s.' }],
    staging: 'A barber shaves a customer on a stool in the street; a bowl of water, a razor, a small crowd of waiting chins.',
    source: 'Martial 11.84 (the slow barber)',
  },
  {
    id: 'vig-water-carrier', title: 'Water for the upper floors', districts: ['dist-velabrum-boarium', 'dist-circus-maximus'], hours: DAY,
    cast: [{ role: 'aquarius', look: 'slave' }],
    lines: [{ by: 0, text: 'Water! Water up the stairs, an as a jar! The fifth floor gets the fresh!' }],
    staging: 'A man fills jars at a street fountain and hauls them toward an insula door.',
  },
  {
    id: 'vig-vigiles-patrol', title: 'The watch goes by', districts: 'any', hours: NIGHT,
    cast: [{ role: 'vigil', look: 'vigil', count: 3 }],
    lines: [{ by: 0, text: 'Water in every flat! Lamps out! The prefect’s order!' }, { by: 1, text: 'Smell that? … No. Bread. Somebody’s baking.' }],
    staging: 'Three vigiles with a lantern, buckets and a hook pass at a steady walk, glancing at upper windows.',
    weight: 2,
  },
  {
    id: 'vig-lemuria-rite', title: 'Beans for the dead', districts: ['dist-velabrum-boarium', 'dist-circus-maximus', 'dist-forum-holitorium'], hours: [23, 1.5], festivals: ['fest-lemuria'],
    cast: [{ role: 'paterfamilias', look: 'elderly' }],
    lines: [{ by: 0, text: 'These I send; with these beans I redeem me and mine.' }, { by: 0, text: 'Ghosts of my fathers, go out!', after: 6 }],
    staging: 'In a doorway, a barefoot old man throws black beans over his shoulder without looking back, nine times, then clashes a bronze pan.',
    source: 'Ovid, Fasti 5.429–444',
  },
  {
    id: 'vig-lemuria-glimpse', title: 'At the edge of the lamplight', districts: ['dist-forum-romanum', 'dist-velabrum-boarium', 'dist-circus-maximus'], hours: [22, 3], festivals: ['fest-lemuria'],
    cast: [{ role: 'figure', look: 'elderly' }],
    lines: [{ by: -1, text: '(Someone in a pale cloak stands at the end of the street. When you look again, the street is empty.)' }],
    staging: 'GDD §2.4: only at night, only at the edge of vision, never in combat; the figure steps into a side alley when the player approaches within 25 m and despawns. A cloak on a hook is left behind.',
    weight: 0.5,
  },
  {
    id: 'vig-column-garlands', title: 'Garlands for tomorrow', districts: ['dist-fora-imperialia', 'dist-forum-romanum'], hours: [8, 19], festivals: ['fest-columna-eve'],
    cast: [{ role: 'servus-baiulus', look: 'slave', count: 2 }, { role: 'foreman', look: 'freedman' }],
    lines: [{ by: 2, text: 'Higher on the left! It’s for Venus, not for your mother!' }],
    staging: 'Workers hang laurel and myrtle swags from a portico on ladders.',
  },
  {
    id: 'vig-recruiter', title: 'The recruiter', districts: ['dist-forum-romanum', 'dist-circus-maximus'], hours: DAY,
    cast: [{ role: 'miles', look: 'legionary' }, { role: 'puer', look: 'plebeian-man' }],
    lines: [{ by: 0, text: 'Twenty-five years, a fair wage, a plot of land at the end. And the East is full of gold.' }, { by: 1, text: 'And Parthian arrows.' }, { by: 0, text: 'Those too.' }],
    staging: 'A soldier with a centurion’s staff tucked under his arm talks to a gangling youth by a portico.',
  },
  {
    id: 'vig-dacian-captives', title: 'Men from the frieze', districts: ['dist-fora-imperialia'], hours: DAY,
    cast: [{ role: 'captivus', look: 'dacian', count: 2 }, { role: 'overseer', look: 'freedman' }],
    lines: [{ by: 0, text: '(In Dacian) They carved our king on it. Taller than he was.' }, { by: 2, text: 'Less talk. More rope.' }],
    staging: 'Two bearded men haul a scaffold beam under an overseer’s eye near the Column court.',
  },
  {
    id: 'vig-astrologer', title: 'Your stars', districts: ['dist-circus-maximus'], hours: DAY,
    cast: [{ role: 'mathematicus', look: 'syrian' }, { role: 'matrona', look: 'plebeian-woman' }],
    lines: [{ by: 0, text: 'Saturn in your eighth house. A journey, a loss, a letter.' }, { by: 1, text: 'You said that to my sister.' }, { by: 0, text: 'Then it is a family matter.' }],
    staging: 'Under the Circus arcades, an astrologer chalks a chart on a board for a client.',
    source: 'Juvenal 6.582–591; Horace Sat. 1.6.113–114',
  },
  {
    id: 'vig-porters-ship', title: 'The barges are in', districts: ['dist-velabrum-boarium'], hours: [6, 14],
    cast: [{ role: 'saccarius', look: 'slave', count: 3 }],
    lines: [{ by: 0, text: 'Oil from Baetica! Mind the amphora, it costs more than you do!' }],
    staging: 'Porters carry amphorae on their shoulders from the river port toward the warehouses.',
  },
  {
    id: 'vig-insula-quarrel', title: 'Upstairs, downstairs', districts: ['dist-velabrum-boarium', 'dist-circus-maximus'], hours: [18, 23],
    cast: [{ role: 'inquilinus', look: 'plebeian-woman' }, { role: 'inquilinus', look: 'plebeian-man' }],
    lines: [{ by: -1, text: 'Whose water is dripping through my ceiling?' }, { by: -1, text: 'The gods’! It rained!' }, { by: -1, text: 'It hasn’t rained since the Ides!' }],
    staging: 'Shouting between windows above the street; a shutter slams.',
    source: 'Juvenal 3.197–202 (life on the top floor)',
  },
  {
    id: 'vig-drunk-popina', title: 'Closing time', districts: ['dist-velabrum-boarium', 'dist-forum-romanum'], hours: [21, 2],
    cast: [{ role: 'ebrius', look: 'plebeian-man' }, { role: 'copa', look: 'plebeian-woman' }],
    lines: [{ by: 0, text: 'Whose sour wine are you full of, eh? Whose beans?' }, { by: 1, text: 'Yours, Sextus. Go home.' }],
    staging: 'A drunk is steered out of a popina door; he sways, bows to the player and wanders off.',
    source: 'Juvenal 3.292–293',
  },
  {
    id: 'vig-vestal-passes', title: 'A Vestal passes', districts: ['dist-forum-romanum'], hours: [9, 16],
    cast: [{ role: 'virgo-vestalis', look: 'vestal' }, { role: 'lictor', look: 'plebeian-man' }],
    lines: [{ by: 1, text: 'Make way for the Virgin of Vesta!' }],
    staging: 'A lictor clears the path and a Vestal walks by with an attendant; people stop talking and step aside.',
    source: 'Vestals were escorted by a lictor [A]',
  },
];
