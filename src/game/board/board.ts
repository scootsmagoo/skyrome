/**
 * The conspiracy board (*Tabula Coniuratorum*, GDD §10.2; docs/STORY.md chapter 5): four groups
 * of plotters ("cells"), three hidden members in each, and the clues the player carries pinned
 * under them. Pudens opens it in mq-05-tabula (flag `board-open`); from then on it is a page of
 * the journal.
 *
 * Pure: the view is computed from what the player has and the saved flags. Act II unmasks a member
 * by setting the flag `board:<member id>` and breaks a cell when all three are unmasked; breaking
 * three cells is the goal ("unmask enough of them to break three groups").
 */

export type CellId = 'purse' | 'aurum' | 'falx' | 'toga';

export interface BoardMember {
  id: string;
  /** Their name, shown once unmasked. */
  name: string;
  /** What they are, shown once unmasked. */
  role: string;
}

export interface BoardCell {
  id: CellId;
  title: string;
  latin: string;
  /** One line: who these people are. */
  blurb: string;
  members: [BoardMember, BoardMember, BoardMember];
  /** Pudens's first lead: where to start on this cell. */
  lead: string;
}

/** What the board reads from the game. */
export interface BoardState {
  hasItem(id: string): boolean;
  flag(name: string): number | string | boolean | undefined;
}

export interface BoardClue {
  id: string;
  /** The cell it is pinned under, or null for the note about the camp. */
  cell: CellId | null;
  title: string;
  text: string;
  /** Is it on the board? */
  known(s: BoardState): boolean;
}

/** The flag mq-05 sets when Pudens shows the board. */
export const BOARD_FLAG = 'board-open';
/** Cells to break before October (GDD §10.2: three of four unlock Act III). */
export const CELLS_NEEDED = 3;

export const CELLS: BoardCell[] = [
  {
    id: 'purse',
    title: 'The Purse',
    latin: 'Sacculus',
    blurb: 'The money men: whoever pays for knives and bows.',
    members: [
      { id: 'pinarius-avitus', name: 'Sextus Pinarius Avitus', role: 'contractor for the army’s grain' },
      { id: 'euhodus', name: 'Tiberius Claudius Euhodus', role: 'freedman, dealer in arms' },
      { id: 'hermogenes', name: 'Hermogenes', role: 'banker at the Basilica Aemilia' },
    ],
    lead: 'Half a name isn’t a name. But “…NARIVS AVIT…” buys grain for the army, and a man who sells grain for a war wants the war.',
  },
  {
    id: 'aurum',
    title: 'The Eastern Gold',
    latin: 'Aurum Parthicum',
    blurb: 'Where the Parthian silver comes into Rome.',
    members: [
      { id: 'mercator-piperis', name: 'The pepper merchant', role: 'dealer in silk and pepper at the Horrea Piperataria' },
      { id: 'asclepiodotus', name: 'Asclepiodotus', role: 'Chaldaean astrologer' },
      { id: 'mardonius', name: 'Mardonius', role: 'a courier of the Castra Peregrina' },
    ],
    lead: 'The Pepper Warehouses, on the Sacred Way. Gratus was asking questions there. That’s why they shot him.',
  },
  {
    id: 'falx',
    title: 'The Dacian Blades',
    latin: 'Falx',
    blurb: 'The knives: Dacians with a grudge, and the men who arm them.',
    members: [
      { id: 'mucapor', name: 'Mucapor', role: 'falx champion' },
      { id: 'daizus', name: 'Daizus', role: 'a freed builder on the Baths of Trajan' },
      { id: 'tarbus', name: 'Tarbus', role: 'a trainer at the Ludus Dacicus' },
    ],
    lead: 'Mucapor. A fighter’s name. Ask at the Dacian school, by the Colosseum.',
  },
  {
    id: 'toga',
    title: 'The Toga',
    latin: 'Toga',
    blurb: 'Someone high, who wants something money can’t buy.',
    members: [
      { id: 'valerius-asper', name: 'Quintus Valerius Asper', role: 'a disgraced senator' },
      { id: 'naevius-vitulus', name: 'Sextus Naevius Vitulus, “Vitis”', role: 'a praetorian centurion gone rogue' },
      { id: 'chrysogonus', name: 'Marcus Ulpius Chrysogonus', role: 'a freedman scribe of the imperial chancery' },
    ],
    lead: 'Someone knew where Caesar would stand and where the praetorians would be. Someone high. I’ve nothing on him yet.',
  },
];

export const CLUES: BoardClue[] = [
  {
    id: 'tabula-rasa',
    cell: 'purse',
    title: 'The scraped tablet',
    text: 'From Festus’s satchel. Three half-names still show in the wax: “…NARIVS AVIT…”, “…VHOD…”, “HERMOG…”.',
    known: (s) => s.hasItem('quest-tabula-rasa'),
  },
  {
    id: 'drachma',
    cell: 'aurum',
    title: 'A Parthian drachm',
    text: 'Silver of King Osroes, found in a Roman killer’s purse.',
    known: (s) => s.hasItem('quest-drachma-parthica'),
  },
  {
    id: 'pepper',
    cell: 'aurum',
    title: 'The man who smelled of pepper',
    text: 'Syrian rings, a smell of pepper: he paid the Mouse, and he paid the archer.',
    known: () => true,
  },
  {
    id: 'tessera',
    cell: 'falx',
    title: 'The bone token',
    text: 'Scratched with a curved Dacian blade and the letters MVCAPOR.',
    known: (s) => s.hasItem('quest-tessera-mucaporis'),
  },
  {
    id: 'sagitta',
    cell: 'falx',
    title: 'The Dacian arrow',
    text: 'Barbed, with red bands on the shaft. Crito pulled it out of Gratus.',
    known: (s) => s.hasItem('quest-sagitta-dacica'),
  },
  {
    id: 'bitus',
    cell: 'falx',
    title: 'Bitus, in Pudens’s cells',
    text: 'The archer from the Column. Alive, and talking.',
    known: (s) => s.flag('bitus-fate') === 'spared',
  },
  {
    id: 'leak',
    cell: null,
    title: 'The camp leaks',
    text: 'Festus’s road and hour were sold from inside the Castra Peregrina.',
    known: () => true,
  },
  {
    id: 'tabula-sicarii',
    cell: null,
    title: 'The knife-man’s tablet',
    text: '“THE NEW ONE. CAELIAN. BEFORE THE CAMP.” Written on the couriers’ own red wax.',
    known: (s) => s.hasItem('quest-tabula-sicarii'),
  },
];

export interface BoardMemberView {
  id: string;
  unmasked: boolean;
  /** "Unknown" until unmasked. */
  name: string;
  role: string | null;
}

export interface BoardCellView {
  id: CellId;
  title: string;
  latin: string;
  blurb: string;
  members: BoardMemberView[];
  clues: { id: string; title: string; text: string }[];
  lead: string;
  broken: boolean;
}

export interface BoardView {
  cells: BoardCellView[];
  /** Clues about the camp itself (not pinned under a cell). */
  notes: { id: string; title: string; text: string }[];
  broken: number;
  needed: number;
}

export const isBoardOpen = (s: BoardState): boolean => s.flag(BOARD_FLAG) === true;
export const isUnmasked = (s: BoardState, memberId: string): boolean => s.flag(`board:${memberId}`) === true;

/** The board as the player knows it (null until Pudens has shown it). */
export function boardView(s: BoardState): BoardView | null {
  if (!isBoardOpen(s)) return null;
  const pin = (c: BoardClue) => ({ id: c.id, title: c.title, text: c.text });
  const cells = CELLS.map((cell): BoardCellView => {
    const members = cell.members.map((m) => {
      const unmasked = isUnmasked(s, m.id);
      return { id: m.id, unmasked, name: unmasked ? m.name : 'Unknown', role: unmasked ? m.role : null };
    });
    return {
      id: cell.id,
      title: cell.title,
      latin: cell.latin,
      blurb: cell.blurb,
      members,
      clues: CLUES.filter((c) => c.cell === cell.id && c.known(s)).map(pin),
      lead: cell.lead,
      broken: members.every((m) => m.unmasked),
    };
  });
  return {
    cells,
    notes: CLUES.filter((c) => c.cell === null && c.known(s)).map(pin),
    broken: cells.filter((c) => c.broken).length,
    needed: CELLS_NEEDED,
  };
}
