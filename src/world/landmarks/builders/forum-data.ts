/**
 * Data for the Forum Romanum / Velia builders: the paved forum square, the road corridors left
 * open in it for the city module, and the texts of the inscriptions the player can read (spot ids
 * of kind 'inscription'). Pure data and geometry, no Three.js.
 *
 * Inscription confidence: [A] the text survives (CIL), [B] attested in substance (coins, ancient
 * authors), [C] a plausible reconstruction for the game. Never present [C] texts as fact in the codex.
 */
import { LANDMARK_BY_ID, ROADS } from '../../../data/atlas';

export type P2 = [number, number];

/**
 * The paved Forum square in atlas REAL metres: from the Rostra and the temples under the Capitol
 * (W) to the Temple of Divus Iulius (E), between the steps of the Basilica Iulia (S) and the portico
 * of the Basilica Aemilia (N), including the Comitium and the area of the Volcanal. Built by the
 * miliarium-aureum builder (the world origin, so local = real × 0.6).
 */
export const FORUM_PLAZA: P2[] = [
  [12.5, -50.5], // Concord, N end of its front
  [22, -46],
  [30, -26],
  [67, -40.5], // Curia front
  [80, -26],
  [92.5, -17], // Basilica Aemilia, W corner
  [176, 38], // Basilica Aemilia, E corner
  [158.5, 57], // Divus Iulius, NE corner
  [131.5, 41.5], // Divus Iulius, front N corner
  [117.7, 65.6], // Divus Iulius, front S corner
  [127, 82.8], // Castor, front E part (by the Arch of Augustus)
  [100.5, 70.3], // Castor, front W corner
  [90.3, 63.7], // Basilica Iulia, E corner
  [-2, 22.6], // Basilica Iulia, W corner
  [-5, 9.7], // Saturn, front E corner
  [-23, -3], // Saturn, front W corner
  [-19.5, -19], // Vespasian, front N corner
  [-10.5, -12.5], // Concord, S end of its front
];

/**
 * Streets that cross the square keep their own paving (city module): their corridors are cut out
 * of the plaza (atlas road id, extra margin in metres).
 */
export const PLAZA_ROAD_GAPS: { id: string; margin: number }[] = [
  { id: 'via-sacra', margin: 0.1 },
  { id: 'argiletum', margin: 0.1 },
  { id: 'clivus-capitolinus', margin: 0.1 },
  { id: 'vicus-iugarius', margin: 0.1 },
  { id: 'vicus-tuscus', margin: 0.1 },
  { id: 'clivus-argentarius', margin: 0.1 },
];

/** A polyline buffered to a closed polygon (mitred joins, flat caps), half width `hw`. Pure. */
export function bufferPolyline(pts: readonly (readonly [number, number])[], hw: number): P2[] {
  if (pts.length < 2) return [];
  const n = pts.length;
  const left: P2[] = [];
  const right: P2[] = [];
  const dirs: P2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dz = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dz) || 1;
    dirs.push([dx / l, dz / l]);
  }
  for (let i = 0; i < n; i++) {
    const a = dirs[Math.max(0, i - 1)];
    const b = dirs[Math.min(n - 2, i)];
    // left normal of a direction (dx, dz) is (dz, −dx); average for a mitre, clamp the length
    let nx = a[1] + b[1];
    let nz = -a[0] - b[0];
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    const cos = nx * b[1] + nz * -b[0];
    const k = hw / Math.max(0.35, cos);
    left.push([pts[i][0] + nx * k, pts[i][1] + nz * k]);
    right.push([pts[i][0] - nx * k, pts[i][1] - nz * k]);
  }
  return [...left, ...right.reverse()];
}

/** Road corridors cut out of the plaza, in atlas real metres. */
export function plazaRoadGaps(): P2[][] {
  const out: P2[][] = [];
  for (const g of PLAZA_ROAD_GAPS) {
    const r = ROADS.find((x) => x.id === g.id);
    if (!r) continue;
    out.push(bufferPolyline(r.points, r.width / 2 + g.margin));
  }
  return out;
}

/** Signed area (positive = counter-clockwise in x/z as listed). */
export function polygonArea(p: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** True when no two non-adjacent edges of the polygon cross. */
export function isSimplePolygon(p: readonly P2[]): boolean {
  const n = p.length;
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const c = p[j];
      const d = p[(j + 1) % n];
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return false;
    }
  }
  return true;
}

/** Point in polygon (even-odd). */
export function pointInPolygon(x: number, z: number, p: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Atlas centre of a landmark (real metres). */
export function centerOf(id: string): P2 {
  const lm = LANDMARK_BY_ID[id];
  return [lm.center[0], lm.center[1]];
}

// ---------------------------------------------------------------- inscriptions

export interface InscriptionText {
  /** The lines as carved (latinize() adds interpuncts and V for U). */
  latin: string[];
  english: string;
  conf: 'A' | 'B' | 'C';
  note?: string;
}

/** Texts by spot id (spots of kind 'inscription' carry these ids). */
export const FORUM_INSCRIPTIONS: Record<string, InscriptionText> = {
  'miliarium-aureum': {
    latin: ['Imp Caesar Divi F Augustus', 'Curator Viarum'],
    english: 'Imperator Caesar Augustus, son of the Divine, curator of the roads.',
    conf: 'C',
    note: 'Augustus set the milestone up as curator viarum (20 BC); what it said is unknown (atlas FLAG). The list of cities is a modern conjecture and is not shown.',
  },
  'rostra-duilius': {
    latin: ['C Duilius M F M N Cos', 'Classeis Poenicas Primos', 'Ornavet Navebos Cepet'],
    english: 'Gaius Duilius, son of Marcus, grandson of Marcus, consul: he first fitted out a fleet and took the Punic ships.',
    conf: 'B',
    note: 'Abridged from the elogium on the Columna Rostrata (CIL VI 1300, an early imperial re-cutting in archaising Latin).',
  },
  'curia-julia': {
    latin: ['Senatus'],
    english: 'The Senate.',
    conf: 'C',
    note: 'A label for the Senate House; the façade inscription of Domitian\'s restoration is lost.',
  },
  'temple-saturn': {
    latin: ['L Munatius L F Plancus Imp Iter De Manibiis'],
    english: 'Lucius Munatius Plancus, son of Lucius, twice hailed imperator, (built this) from the spoils of war.',
    conf: 'B',
    note: 'Plancus rebuilt the temple from war booty after 42 BC (his epitaph at Gaeta: aedem Saturni fecit de manibiis). The frieze wording is reconstructed.',
  },
  'temple-vespasian-titus': {
    latin: ['Divo Vespasiano Augusto S P Q R'],
    english: 'To the Divine Vespasian Augustus, the Senate and People of Rome.',
    conf: 'B',
    note: 'The surviving architrave adds a Severan restoration line, which is later and not shown.',
  },
  'temple-concord': {
    latin: ['Concordiae Augustae'],
    english: 'To Augustan Concord.',
    conf: 'C',
    note: 'Tiberius rededicated the temple to Concordia Augusta in AD 10 in his own and his dead brother Drusus\' names.',
  },
  'temple-castor-pollux': {
    latin: ['Ti Caesar Augusti F Divi N et Nero Claudius Drusus Germanicus'],
    english: 'Tiberius Caesar, son of Augustus, grandson of the Divine, and Nero Claudius Drusus Germanicus.',
    conf: 'C',
    note: 'Suetonius (Tib. 20): Tiberius dedicated the temple of Castor and Pollux in AD 6 in his own and his brother\'s name. Wording reconstructed.',
  },
  'temple-divus-julius': {
    latin: ['Divo Iulio'],
    english: 'To the Divine Julius.',
    conf: 'B',
    note: 'Octavian\'s coins show DIVO IVL on the architrave.',
  },
  'temple-divus-augustus': {
    latin: ['Divo Augusto'],
    english: 'To the Divine Augustus.',
    conf: 'C',
  },
  'basilica-aemilia-lucius': {
    latin: ['L Caesari Augusti F Divi N', 'Principi Iuventutis Cos Desig', 'Cum Esset Ann Nat XIIII Aug', 'Senatus'],
    english: 'To Lucius Caesar, son of Augustus, grandson of the Divine, Prince of the Youth, consul-designate at the age of fourteen, an augur: the Senate.',
    conf: 'A',
    note: 'CIL VI 36908, from the Porticus of Gaius and Lucius in front of the Basilica Aemilia.',
  },
  'arch-augustus': {
    latin: ['Senatus Populusque Romanus', 'Imp Caesari Divi F Augusto', 'Civibus et Signis Militaribus', 'A Parthis Recuperatis'],
    english: 'The Senate and People of Rome to Imperator Caesar Augustus, son of the Divine, for the citizens and military standards recovered from the Parthians.',
    conf: 'C',
    note: 'The wording follows CIL VI 31277 / the SIGNIS RECEPTIS coinage; which arch carried which text is debated.',
  },
  'arch-tiberius': {
    latin: ['Ti Caesari Divi Augusti F Augusto', 'Ob Signa cum Varo Amissa', 'Ductu Germanici Auspiciis Tiberi Recepta'],
    english: 'To Tiberius Caesar Augustus, son of the Divine Augustus, for the standards lost with Varus, recovered under the command of Germanicus and the auspices of Tiberius.',
    conf: 'B',
    note: 'After Tacitus, Annals 2.41; the surviving fragments are too small to restore the exact text.',
  },
  'fornix-fabianus': {
    latin: ['Q Fabius Q F Maxsumus', 'Aed Cur Rest'],
    english: 'Quintus Fabius Maximus, son of Quintus, curule aedile, restored (it).',
    conf: 'A',
    note: 'CIL VI 1303–1304 (the 57 BC restoration by the grandson of the builder).',
  },
  'arch-titus': {
    latin: ['Senatus', 'Populusque Romanus', 'Divo Tito Divi Vespasiani F', 'Vespasiano Augusto'],
    english: 'The Senate and People of Rome to the Divine Titus Vespasianus Augustus, son of the Divine Vespasian.',
    conf: 'A',
    note: 'CIL VI 945, on the attic facing the amphitheatre.',
  },
  'arch-titus-spoils': {
    latin: [],
    english: 'Relief: soldiers crowned with laurel carry the spoils of the Temple at Jerusalem, the seven-branched lampstand, the table and the silver trumpets, through a triumphal arch.',
    conf: 'A',
  },
  'arch-titus-triumph': {
    latin: [],
    english: 'Relief: Titus in his four-horse chariot, crowned by Victory, led by Roma; lictors with fasces walk ahead.',
    conf: 'A',
  },
  'carcer-tullianum': {
    latin: ['C Vibius C F Rufinus M Cocceius Nerva Cos', 'Ex S C'],
    english: 'Gaius Vibius Rufinus, son of Gaius, and Marcus Cocceius Nerva, consuls, by decree of the Senate.',
    conf: 'A',
    note: 'CIL VI 1539, on the travertine façade.',
  },
  tabularium: {
    latin: ['Q Lutatius Q F Q N Catulus Cos', 'Substructionem et Tabularium', 'De S S Faciundum Coeravit Eidemque Probavit'],
    english: 'Quintus Lutatius Catulus, son of Quintus, grandson of Quintus, consul, had the substructure and the record office built by decree of the Senate, and approved the work.',
    conf: 'A',
    note: 'CIL VI 1314 (78 BC).',
  },
  'lacus-curtius-naevius': {
    latin: ['L Naevius L F Surdinus Pr', 'Inter Cives et Peregrinos'],
    english: 'Lucius Naevius Surdinus, son of Lucius, praetor for cases between citizens and foreigners (paved this).',
    conf: 'A',
    note: 'CIL VI 1468, bronze letters set in the travertine paving beside the Lacus Curtius (Augustan).',
  },
  'lacus-juturnae-puteal': {
    latin: ['M Barbatius Pollio Aed Cur', 'Iuturnai Sacrum Rest'],
    english: 'Marcus Barbatius Pollio, curule aedile, restored (this) sacred to Juturna.',
    conf: 'A',
    note: 'CIL VI 36807, on the marble well-head of the spring.',
  },
  'regia-fasti': {
    latin: ['Fasti Consulares', 'L Iunius M F Brutus', 'L Tarquinius Egeri F Collatinus', 'P Valerius Vol F Poplicola'],
    english: 'The list of consuls: Lucius Junius Brutus, Lucius Tarquinius Collatinus, Publius Valerius Poplicola (509 BC)…',
    conf: 'C',
    note: 'The Augustan Fasti were inscribed on the Regia or on the Arch of Augustus (debated).',
  },
  'atrium-vestae-statue': {
    latin: ['Virgini Vestali Maximae', 'Ob Merita'],
    english: 'To the Chief Vestal Virgin, for her merits.',
    conf: 'C',
    note: 'Most surviving Vestal statue bases are 3rd century; a few honours in 113 are a guess.',
  },
};
