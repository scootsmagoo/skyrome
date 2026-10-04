/**
 * What the player can do in the Forum: the Forum builders hand their spots to the running game
 * through `game.interactions` (the public extension point), once the services exist.
 *
 *  - 'inscription' spots → "Read": the Latin as carved, an English translation and the confidence
 *    grade of the text ([A] survives, [B] attested in substance, [C] the game's own) in the book
 *    reader (`FORUM_INSCRIPTIONS`). Interaction ids are `forum:read:<spot id>`.
 *  - 'vista' spots → "Look": a line of what the view shows (`FORUM_LOOKS`), as a subtitle.
 *  - 'shrine' and 'door' spots with a text in `FORUM_LOOKS` → "Honour" / "Look inside": a line of
 *    flavour. Doors the quest team needs (the Castor strongroom, the aerarium, the Carcer…) keep
 *    their spot ids: a quest registers its own interactable at the spot (`game.landmarks`) and
 *    sets `FORUM_LOOKS` aside by id, or disables this one with `game.interactions.remove`.
 *
 * Builders work in LOCAL space; the spots are converted to world space with the placement
 * buildLandmarks() uses. Everything is a no-op without a running game (unit tests), and nothing is
 * created per frame.
 */
import * as THREE from 'three';
import type { Game, System } from '../../../core/Game';
import { bearingToRotationY } from '../../../core/math';
import { latinize } from '../../../arch/common/inscription';
import type { LandmarkContext, Spot } from '../types';
import { FORUM_INSCRIPTIONS, type InscriptionText } from './forum-data';

// ---------------------------------------------------------------- texts

/** What the reader sees about a confidence grade. */
export const CONFIDENCE: Record<InscriptionText['conf'], string> = {
  A: '[A] The text survives, on the stone or in the ancient sources.',
  B: '[B] Attested in substance: the wording is reconstructed.',
  C: '[C] The game\'s own wording: no ancient text is known.',
};

/** Titles of the readable things whose spot id is not a landmark's id. */
const TITLES: Record<string, string> = {
  'rostra-duilius': 'Column of Duilius',
  'forum-statue-base': 'Honorific statue base',
  'arch-augustus-fasti': 'Fasti Triumphales',
  'arch-titus-spoils': 'Relief of the spoils of Jerusalem',
  'arch-titus-triumph': 'Relief of the triumph of Titus',
  'lacus-curtius-naevius': 'Bronze letters of Naevius',
  'lacus-juturnae-puteal': 'Well-head of Juturna',
  'regia-fasti': 'Fasti Consulares',
  'lapis-niger': 'The Black Stone',
  'acta-diurna': 'Acta Diurna',
  'tabernae-aemiliae-notice': 'Notice on a pier of the Basilica Paulli',
  'basilica-iulia-lampoon': 'Chalk on the step',
  'basilica-iulia-tabula-lusoria': 'Gaming boards on the steps',
  'castor-loculi-plaque': 'Plaque of the deposit vaults',
  'atrium-vestae-statue': 'Statue base of a Vestal',
  'basilica-aemilia-lucius': 'Dedication to Lucius Caesar',
  'porticus-margaritaria': 'Sign of the Pearl-Sellers\' Arcade',
};

/** The title and the book text of a readable spot, or null when the id has no text. Pure. */
export function readable(id: string, landmarkName?: string): { title: string; text: string } | null {
  const t = FORUM_INSCRIPTIONS[id];
  if (!t) return null;
  const latin = t.latin.length ? `${t.latin.map((l) => latinize(l)).join(' / ')}\n\n` : '';
  const note = t.note ? `\n\n${t.note}` : '';
  return { title: TITLES[id] ?? landmarkName ?? id, text: `${latin}*${t.english}*\n\n${CONFIDENCE[t.conf]}${note}` };
}

export interface Look {
  verb: string;
  label: string;
  line: string;
}

/** Vistas, shrines and doors the player can look at, by spot id. */
export const FORUM_LOOKS: Record<string, Look> = {
  // vistas
  'rostra-vista': { verb: 'Look', label: 'From the Rostra', line: 'From the speaker\'s platform the whole square lies open: the Basilica Iulia to the south, the Basilica Paulli to the north, and beyond the Regia the little round roof of Vesta.' },
  'equus-domitiani-site': { verb: 'Look', label: 'The empty paving', line: 'Here stood Domitian\'s great bronze horse. The Senate pulled it down, and the paving that replaced it is whiter than the rest.' },
  'tabularium-gallery-vista': { verb: 'Look', label: 'The Tabularium gallery', line: 'Twenty metres up, between the arches, the Forum lies below like a plan: roofs, columns, the crowd as small as ants.' },
  'dei-consentes-vista': { verb: 'Look', label: 'The Twelve Gods', line: 'Six gods and six goddesses in gilded bronze stand shoulder to shoulder above the road, gazing down at the Forum.' },
  'castor-tribunal-vista': { verb: 'Look', label: 'From the podium of Castor', line: 'The high podium of Castor is a speaker\'s platform too: from it the whole lower Forum and the Sacra Via are in view.' },
  'colossus-sol': { verb: 'Look', label: 'The Colossus', line: 'Thirty metres of bronze, once Nero\'s face, now the Sun\'s, with the seven rays of his crown caught by the light. Zenodorus cast him for Nero, and Vespasian gave him the rays of the Sun.' },
  'velia-vista': { verb: 'Look', label: 'The Velia', line: 'From the colonnade of the old Golden House vestibule the Sacra Via drops away toward the Forum, and the Arch of Titus stands white on the ridge behind.' },
  'arch-titus-vista': { verb: 'Look', label: 'The Arch of Titus', line: 'The single white bay of the arch frames the street and the Forum below it: the road of every triumph, and the arch that remembers the spoils of Jerusalem.' },
  'summa-sacra-via-vista': { verb: 'Look', label: 'The top of the Sacra Via', line: 'The causeway climbs to the Velia: on its summit stand the arch and, beyond it, the great bronze Sun.' },
  // shrines
  'umbilicus-urbis': { verb: 'Honour', label: 'The Navel of the City', line: 'The Umbilicus Urbis, the navel of the city. The Golden Milestone beside it is where the roads of the empire begin.' },
  mundus: { verb: 'Look', label: 'The mundus', line: 'A round stone over the pit where the first fruits of the city were laid. It is lifted only three days a year, when the dead may walk.' },
  volcanal: { verb: 'Honour', label: 'The Volcanal', line: 'An open-air shrine of Vulcan, older than the Forum itself, with a rock altar behind a bronze railing. At the Volcanalia in August live fish are thrown into his fire here.' },
  'lacus-curtius': { verb: 'Honour', label: 'The Lacus Curtius', line: 'The pit where Marcus Curtius is said to have leapt in armour to save Rome. Passers-by throw in a coin for the Emperor\'s health.' },
  'shrine-venus-cloacina': { verb: 'Honour', label: 'Venus Cloacina', line: 'The shrine of Venus the Purifier, over the great drain that carries the city\'s water to the Tiber. Myrtle is carried here still, as when the Romans and the Sabines made peace.' },
  'lacus-servilius': { verb: 'Look', label: 'The Servilian basin', line: 'A basin where Agrippa\'s bronze hydra spits water. In Sulla\'s time the heads of the proscribed were set out beside it.' },
  'janus-geminus': { verb: 'Look', label: 'The Temple of Janus', line: 'The bronze doors of Janus Geminus stand open, as the custom is when Rome is at war. All the talk in the Forum is of the Parthians.' },
  'puteal-libonis': { verb: 'Look', label: 'The Puteal Libonis', line: 'A marble well-head over a spot struck by lightning, garlanded with lyres. The moneylenders meet beside it.' },
  'signum-vortumni': { verb: 'Honour', label: 'Vortumnus', line: 'The statue of Vertumnus, god of the turning year and of trade, at the end of the Vicus Tuscus. Shopkeepers hang flowers on his base.' },
  'divus-iulius-altar': { verb: 'Honour', label: 'The altar of Divus Julius', line: 'On this spot Caesar\'s body was burned; an altar of marble marks it, and the Actian rams look down from the rostra above.' },
  'curia-victory-altar': { verb: 'Honour', label: 'The Altar of Victory', line: 'Every senator burns a pinch of incense here before he speaks, under the golden Victory Augustus brought from Tarentum.' },
  'porticus-dei-consentes': { verb: 'Honour', label: 'The Twelve Gods', line: 'Each of the twelve has his portrait in gilded bronze; the Romans call them the Consenting Gods.' },
  'temple-vesta-fire': { verb: 'Honour', label: 'The sacred fire', line: 'The Vestals keep the hearth of Rome. If it ever goes out, they say, the city\'s luck goes with it.' },
  'regia-ancilia': { verb: 'Look', label: 'The shields of Mars', line: 'The twelve bronze shields of Mars, one fallen from heaven in the days of Numa, the eleven copies made so no thief could tell which.' },
  'lacus-juturnae': { verb: 'Honour', label: 'The Spring of Juturna', line: 'The nymph who gives the water is nursed here with offerings; Castor and Pollux watered their horses here after Lake Regillus.' },
  'temple-jupiter-stator': { verb: 'Honour', label: 'Jupiter Stator', line: 'Jupiter the Stayer, who halted the fleeing Romans when Romulus prayed. The temple is old, small and hard to find.' },
  'horrea-agrippiana-genius': { verb: 'Honour', label: 'The Genius of the warehouse', line: 'Warehouse hands leave a bit of bread for the Genius of the place, who keeps the cloth from the moths.' },
  // doors
  'castor-strongroom': { verb: 'Look inside', label: 'The deposit vaults', line: 'LOCVLI · DEPOSITORVM. A grated door in the podium of Castor: the vaults where Romans leave their money and their documents in the keeping of the gods. The aedituus keeps the key.' },
  'castor-weights-office': { verb: 'Look inside', label: 'The standard weights', line: 'The standard weights and measures of the city are kept in the podium of Castor; the aediles inspect the merchants\' scales against them.' },
  'aerarium-door': { verb: 'Look inside', label: 'The Aerarium', line: 'The treasury of the Roman people, in the podium of Saturn. Behind the bronze door lie the standards, the laws on bronze tablets and the public gold.' },
  'carcer-door': { verb: 'Look inside', label: 'The Tullianum', line: 'The state prison is a dark hole beneath the road. Jugurtha, Vercingetorix and the Catilinarian conspirators ended here, and nobody wishes to be reminded.' },
  'tabularium-door': { verb: 'Look inside', label: 'The Tabularium', line: 'The state archive: treaties and decrees, thousands of bronze tablets, filed in the vaults under the Capitol.' },
  'atrium-vestae-door': { verb: 'Look inside', label: 'House of the Vestals', line: 'The house of the Vestal Virgins: a long court of pools and statues behind the temple of Vesta.' },
  'regia-door': { verb: 'Look inside', label: 'The Regia', line: 'The old king\'s house, now the office of the Pontifex Maximus, who is the Emperor himself.' },
  'statio-cohortium-urbanarum': { verb: 'Look inside', label: 'Station of the Urban Cohorts', line: 'The Urban Cohorts keep the peace of the city from posts like this one; they answer to the City Prefect.' },
  'palatine-ramp-gate': { verb: 'Look', label: 'The ramp to the Palace', line: 'The Praetorians guard the ramp that leads up from the Forum to the Palace of Domitian. Nobody goes up without business.' },
  'curia-julia': { verb: 'Look inside', label: 'The Senate House', line: 'The bronze doors of the Curia stand open for the sitting. Inside, the senators sit on three broad steps of marble.' },
  'velia-vestibule-gate': { verb: 'Look', label: 'The vestibule of the Golden House', line: 'The vestibule of Nero\'s Golden House has been opened to the public again, its garden court full of trees and strollers.' },
  'cloaca-maxima-grate': { verb: 'Look', label: 'The Cloaca Maxima', line: 'A grating in the paving over the great drain. A damp breath comes up; the Romans say Cloacina, the goddess, lives below.' },
  'cloaca-grate-aemiliae': { verb: 'Look', label: 'A drain of the Cloaca', line: 'A drain grate by the Basilica Paulli. The water below runs toward the Tiber under the street.' },
};

// ---------------------------------------------------------------- queue

interface Pending {
  items: { id: string; p: THREE.Vector3; verb: string; label: string; act: (g: Game) => void }[];
  system: ForumInteractionSystem | null;
}

const pending = new WeakMap<object, Pending>();

function live(game: Game | undefined): Game | null {
  return game && typeof (game as { addSystem?: unknown }).addSystem === 'function' && game.scene ? game : null;
}

function queue(game: Game): Pending {
  let q = pending.get(game);
  if (!q) {
    q = { items: [], system: null };
    pending.set(game, q);
  }
  if (!q.system) {
    q.system = new ForumInteractionSystem(game, q);
    game.addSystem(q.system);
  }
  return q;
}

/** Local → world placement of a landmark (the one buildLandmarks applies). */
function placement(ctx: Pick<LandmarkContext, 'game' | 'lm' | 'S'>): { m: THREE.Matrix4; rotY: number } {
  const { lm, S } = ctx;
  const gx = lm.center[0] * S;
  const gz = lm.center[1] * S;
  const hm = ctx.game.heightmap;
  const y = hm ? hm.heightAt(gx, gz) : 0;
  const rotY = bearingToRotationY(lm.rotation);
  return { m: new THREE.Matrix4().makeRotationY(rotY).setPosition(gx, y, gz), rotY };
}

/**
 * Hand a landmark's LOCAL spots to the game: a "Read" for each inscription with a text, a "Look" or
 * "Honour" for each vista, shrine and door with a line of flavour. The thing sits about a metre
 * ahead of the spot and 1.4 m up, so it is in front of the reader's eyes.
 */
export function forumInteractions(ctx: LandmarkContext, spots: readonly Spot[]) {
  const game = live(ctx.game);
  if (!game) return;
  const { m, rotY } = placement(ctx);
  let q: Pending | null = null;
  for (const s of spots) {
    let item: Pending['items'][number] | null = null;
    const at = () => {
      const h = (s.heading ?? 0) + rotY;
      return s.position.clone().applyMatrix4(m).add(new THREE.Vector3(Math.sin(h), 1.4, Math.cos(h)));
    };
    if (s.kind === 'inscription') {
      const r = readable(s.id, ctx.lm.name);
      if (r) item = { id: `forum:read:${s.id}`, p: at(), verb: 'Read', label: r.title, act: (g) => g.ui?.openBook({ title: r.title, kind: 'tablet', text: r.text }) };
    } else if (s.kind === 'vista' || s.kind === 'shrine' || s.kind === 'door') {
      const l = FORUM_LOOKS[s.id];
      if (l) item = { id: `forum:look:${s.id}`, p: at(), verb: l.verb, label: l.label, act: (g) => g.ui?.subtitle(l.line, undefined, 9000) };
    }
    if (!item) continue;
    q ??= queue(game);
    q.items.push(item);
  }
}

class ForumInteractionSystem implements System {
  readonly name = 'forum-interactions';
  readonly priority = 94;
  private frames = 0;

  constructor(
    private readonly game: Game,
    private readonly q: Pending,
  ) {}

  lateUpdate() {
    const { game, q } = this;
    // Two frames, so a burst of landmark builds finishes queueing before the first flush.
    if (++this.frames < 2) return;
    if (q.items.length && game.interactions) {
      for (const r of q.items) {
        game.interactions.add({
          id: r.id,
          position: () => r.p,
          reach: 3.2,
          verb: () => r.verb,
          label: () => r.label,
          interact: r.act,
        });
      }
      q.items.length = 0;
    }
    // Stay registered only while something still waits for the interaction service.
    if (!q.items.length || this.frames > 36_000) {
      game.removeSystem(this);
      q.system = null;
    }
  }
}
