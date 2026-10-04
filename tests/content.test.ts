/**
 * Content validity (src/content, src/quests/content, src/dialogue/content, src/npc/content):
 * every reference a quest, dialogue or NPC makes resolves (places, NPCs, items, dialogue nodes,
 * skills, factions, vendor kinds), every dialogue node renders, NPC schedules are well formed,
 * and the bark, vignette and text tables are complete.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_ROLES } from '../src/actors/avatar/variants';
import { ARCHETYPE_BARKS, DISTRICT_BARKS, DISTRICTS, FESTIVAL_BARKS, barkFits, districtAt, festivalsOn, pickBark, REACTION_BARKS } from '../src/content/barks';
import { CONTAINERS, STREET_CONTAINERS, UNOWNED_CONTAINERS, routePoint } from '../src/content/containers';
import { lampSpecs } from '../src/content/lamps';
import { CONTENT_LOCATIONS, CONTRACT_SPOT_IDS, STREET_SPOTS, isKnownPlace } from '../src/content/places';
import { GOLDEN_PATH_LENGTH, onPath, projectOnPath } from '../src/content/route';
import { thingPoint } from '../src/content/install';
import { SHRINES } from '../src/content/shrines';
import { THINGS } from '../src/content/things';
import { ALL_WALL_TEXTS, TEXT_ITEMS, WALL_TEXTS } from '../src/content/texts';
import { entryAt } from '../src/content/hours';
import { castSize, VIGNETTES } from '../src/content/vignettes';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import { dialogueModules, loadDialogueContent } from '../src/dialogue/DialogueSystem';
import { toGame } from '../src/world/coords';
import { loadNpcContent } from '../src/npc/registry';
import type { NpcDef } from '../src/npc/types';
import { loadQuestContent, questModules } from '../src/quests/QuestSystem';
import { NATURAL_WEAPONS } from '../src/rpg/data/combatants';
import { FACTIONS } from '../src/rpg/data/factions';
import { ITEMS } from '../src/rpg/data/items';
import { lootTable } from '../src/rpg/loot';
import { SKILLS } from '../src/rpg/data/skills';
import { VENDORS } from '../src/rpg/data/vendors';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

const quests = loadQuestContent();
const dialogues = loadDialogueContent();
const moduleItems = [...questModules(), ...dialogueModules()].flatMap((m) => m.items ?? []);
const moduleNpcs = [...questModules(), ...dialogueModules()].flatMap((m) => m.npcs ?? []);
const npcs: NpcDef[] = [...loadNpcContent(), ...moduleNpcs];
const npcIds = new Set(npcs.map((n) => n.id));
const itemIds = new Set([...ITEMS, ...moduleItems].map((d) => d.id));
const skillIds = new Set(SKILLS.map((s) => s.id));
const factionIds = new Set(FACTIONS.map((f) => f.id));
const dialogueById = new Map(dialogues.map((d) => [d.id, d]));
const DC_TIERS = [10, 25, 40, 55, 70, 85];

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Source text of every content file (for reference scans). */
function sources(dir: string): { file: string; text: string }[] {
  const root = join(__dirname, '..', 'src', dir);
  return readdirSync(root)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(root, f), 'utf8') }));
}
const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[1]);

describe('places', () => {
  it('has unique ids, finite positions and every contract spot', () => {
    const ids = CONTENT_LOCATIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of CONTENT_LOCATIONS) {
      expect(Number.isFinite(l.position.x) && Number.isFinite(l.position.z), l.id).toBe(true);
      expect(l.radius, l.id).toBeGreaterThan(0);
      if (l.parent) expect(isKnownPlace(l.parent), `${l.id} parent ${l.parent}`).toBe(true);
    }
    for (const id of CONTRACT_SPOT_IDS) expect(ids, id).toContain(id);
    // Atlas-landmark locations sit on their atlas centers (×0.6).
    const capena = CONTENT_LOCATIONS.find((l) => l.id === 'porta-capena')!;
    expect(capena.position.x).toBeCloseTo(LANDMARK_BY_ID['porta-capena'].center[0] * 0.6, 0);
  });

  it('keeps the courier ambush away from the spawn so the player is not ambushed on arrival', () => {
    const at = (id: string) => CONTENT_LOCATIONS.find((l) => l.id === id)!;
    const d = Math.hypot(at('spawn-capena').position.x - at('courier-ambush').position.x, at('spawn-capena').position.z - at('courier-ambush').position.z);
    expect(d).toBeGreaterThan(at('courier-ambush').radius + 4);
  });
});

describe('quests', () => {
  it('ships the v0.1 quests with unique ids, a start stage and valid stage links', () => {
    const ids = quests.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['mq-01-madida-capena', 'mq-02-tabella', 'lud-01-sacramentum', 'misc-meta-sudans-rixa', 'misc-lemuria-fabae', 'misc-insula-nutans', 'misc-venus-cloacina']) expect(ids, id).toContain(id);
    for (const q of quests) {
      expect(q.stages.start, q.id).toBeTruthy();
      expect(q.summary.length, q.id).toBeGreaterThan(20);
      if (q.giver) expect(npcIds.has(q.giver), `${q.id} giver ${q.giver}`).toBe(true);
      if (q.faction) expect(factionIds.has(q.faction), q.id).toBe(true);
      const ends = Object.values(q.stages).filter((s) => s.end);
      expect(ends.length, `${q.id} has an ending`).toBeGreaterThan(0);
      for (const [sid, s] of Object.entries(q.stages)) {
        expect(s.journal.length, `${q.id}/${sid} journal`).toBeGreaterThan(20);
        if (s.next) expect(q.stages[s.next], `${q.id}/${sid} → ${s.next}`).toBeTruthy();
        for (const o of s.objectives ?? []) {
          const t = o.target;
          if (!t) continue;
          if (t.kind === 'location') expect(isKnownPlace(t.id), `${q.id}/${o.id} → place ${t.id}`).toBe(true);
          if (t.kind === 'npc') expect(npcIds.has(t.id), `${q.id}/${o.id} → npc ${t.id}`).toBe(true);
          if (t.kind === 'item') expect(itemIds.has(t.id), `${q.id}/${o.id} → item ${t.id}`).toBe(true);
        }
      }
      for (const it of q.rewards?.items ?? []) expect(itemIds.has(it.id), `${q.id} reward ${it.id}`).toBe(true);
      for (const r of q.rewards?.reputation ?? []) expect(factionIds.has(r.faction), `${q.id} reputation ${r.faction}`).toBe(true);
      for (const s of q.rewards?.skillXp ?? []) expect(skillIds.has(typeof s === 'string' ? s : s.id), `${q.id} skill`).toBe(true);
    }
  });

  it('every place, NPC, item, dialogue and node a quest file names exists', () => {
    for (const { file, text } of sources('quests/content')) {
      for (const id of all(/'(npc-[a-z0-9-]+)'/g, text)) expect(npcIds.has(id) || dialogueById.has(id), `${file}: ${id}`).toBe(true);
      const places = [
        ...all(/locationId === '([a-z0-9-]+)'/g, text),
        ...all(/isInside\?\.\('([a-z0-9-]+)'\)/g, text),
        ...all(/\bat: '([a-z0-9-]+)'/g, text),
        ...all(/fight\(q\.game,\s*[^,]+,\s*'[a-z-]+',\s*'([a-z0-9-]+)'/g, text),
      ];
      // `dun-*` ids are interior cells: the world side registers them (docs/CONTENT.md §1.4).
      for (const id of places) expect(isKnownPlace(id) || id.startsWith('dun-'), `${file}: place ${id}`).toBe(true);
      for (const id of all(/(?:giveItem|takeItem|hasItem)\(q, '([a-z0-9-]+)'/g, text)) expect(itemIds.has(id), `${file}: item ${id}`).toBe(true);
      const dlg = all(/dialogueId [!=]== '([a-z0-9-]+)'/g, text);
      for (const id of dlg) expect(dialogueById.has(id), `${file}: dialogue ${id}`).toBe(true);
      const nodes = new Set(dlg.flatMap((id) => Object.keys(dialogueById.get(id)?.nodes ?? {})));
      for (const n of all(/nodeId === '([a-zA-Z0-9]+)'/g, text)) expect(nodes.has(n), `${file}: node ${n}`).toBe(true);
    }
  });
});

describe('dialogue', () => {
  it('attaches to existing NPCs; every NPC dialogue exists; every goto, check and bribe lands on a node', () => {
    const ids = dialogues.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(dialogues.some((d) => d.npcs.includes('*')), 'generic citizen dialogue').toBe(true);
    for (const d of dialogues) {
      for (const n of d.npcs) if (n !== '*') expect(npcIds.has(n), `${d.id} → npc ${n}`).toBe(true);
      for (const [nid, node] of Object.entries(d.nodes)) {
        if (node.next) expect(d.nodes[node.next], `${d.id}/${nid} next ${node.next}`).toBeTruthy();
        for (const ch of node.choices ?? []) {
          for (const g of [ch.goto, ch.check?.pass, ch.check?.fail, ch.bribe?.goto]) if (g) expect(d.nodes[g], `${d.id}/${nid} → ${g}`).toBeTruthy();
          if (ch.check) {
            expect(skillIds.has(ch.check.skill), `${d.id}/${nid} check skill`).toBe(true);
            expect(DC_TIERS, `${d.id}/${nid} DC`).toContain(ch.check.difficulty);
          }
        }
      }
    }
    for (const n of npcs) if (n.dialogue) expect(dialogueById.has(n.dialogue), `${n.id} → dialogue ${n.dialogue}`).toBe(true);
  });

  it('has Rhetoric checks (AC: dialogue with a Rhetoric check), including persuade, intimidate, lie and a bribe', () => {
    const checks = dialogues.flatMap((d) => Object.values(d.nodes).flatMap((n) => n.choices ?? [])).filter((c) => c.check?.skill === 'rhetoric');
    expect(checks.length).toBeGreaterThanOrEqual(12);
    const kinds = new Set(checks.map((c) => c.check!.kind ?? 'persuade'));
    for (const k of ['persuade', 'intimidate', 'lie']) expect(kinds.has(k as never), k).toBe(true);
    expect(dialogues.some((d) => Object.values(d.nodes).some((n) => n.choices?.some((c) => c.bribe)))).toBe(true);
  });

  it('every node and choice renders without throwing, in a fresh game and with every quest at every stage', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'hispanus' });
    const render = () => {
      for (const d of dialogues) {
        const npc = d.npcs.find((n) => n !== '*') ?? 'crowd-1';
        const ctx = rpg.dialogue.context(npc);
        for (const [nid, node] of Object.entries(d.nodes)) {
          const at = `${d.id}/${nid}`;
          expect(() => (typeof node.text === 'function' ? node.text(ctx) : node.text), at).not.toThrow();
          for (const ch of node.choices ?? []) {
            expect(() => (typeof ch.text === 'function' ? ch.text(ctx) : ch.text), at).not.toThrow();
            expect(() => ch.if?.(ctx), at).not.toThrow();
            expect(() => ch.enabled?.(ctx), at).not.toThrow();
          }
        }
        for (const n of d.npcs) {
          const who = n === '*' ? 'crowd-1' : n;
          // A dialogue may decline (empty entry: the NPC's next dialogue speaks), e.g. the watch's brawl questions.
          if (!d.start(rpg.dialogue.context(who))) continue;
          const v = rpg.dialogue.start(who, { dialogueId: d.id, name: 'Citizen' });
          expect(v, `${d.id} starts for ${n}`).toBeTruthy();
          expect(d.nodes[v!.nodeId], `${d.id} start node`).toBeTruthy();
          rpg.dialogue.end();
        }
      }
    };
    render();
    for (const q of quests) {
      for (const s of Object.keys(q.stages)) {
        rpg.quests.restore({ states: { [q.id]: { status: 'running', stage: s, objectives: {}, vars: {}, journal: [] } } });
        render();
      }
    }
    const complaints = [...warn.mock.calls, ...error.mock.calls].map((c) => String(c[0])).filter((m) => m.startsWith('[dialogue]'));
    expect(complaints).toEqual([]);
  });

  it('dialogue effects only give, take or check items that exist', () => {
    for (const { file, text } of sources('dialogue/content')) {
      for (const id of all(/c\.(?:giveItem|takeItem|hasItem)\('([a-z0-9-]+)'/g, text)) expect(itemIds.has(id), `${file}: item ${id}`).toBe(true);
      // 'npc-…' literals are NPC ids or dialogue ids (shared dialogues such as 'npc-vigiles').
      for (const id of all(/'(npc-[a-z0-9-]+)'/g, text)) expect(npcIds.has(id) || dialogueById.has(id), `${file}: ${id}`).toBe(true);
    }
  });
});

describe('NPCs', () => {
  it('have unique ids, plausible appearances, valid factions, tags, vendors and trainers', () => {
    const ids = npcs.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(npcs.length).toBeGreaterThanOrEqual(45);
    for (const n of npcs) {
      const a = n.appearance;
      expect(a.height, n.id).toBeGreaterThan(1.3);
      expect(a.height, n.id).toBeLessThan(1.95);
      expect(a.garments.length, n.id).toBeGreaterThan(0);
      expect(a.skin, n.id).toMatch(/^#[0-9a-f]{6}$/i);
      if (n.faction) expect(factionIds.has(n.faction), `${n.id} faction`).toBe(true);
      if (n.rank && n.faction) expect(FACTIONS.find((f) => f.id === n.faction)!.ranks.some((r) => r.id === n.rank), `${n.id} rank ${n.rank}`).toBe(true);
      for (const t of n.tags ?? []) {
        if (t.startsWith('vendor:')) expect(VENDORS[t.slice(7)], `${n.id} ${t}`).toBeTruthy();
        if (t.startsWith('dignitas:')) expect(['peregrinus', 'latinus-iunianus', 'alexandrinus', 'libertus', 'civis', 'cliens-notus', 'eques', 'senator'], `${n.id} ${t}`).toContain(t.slice(9));
      }
      for (const s of n.vendor?.stock ?? []) expect(itemIds.has(s.id), `${n.id} sells ${s.id}`).toBe(true);
      if (n.vendor) {
        const kind = n.tags?.find((t) => t.startsWith('vendor:'))?.slice(7);
        if (kind) expect(n.vendor.denarii, `${n.id} purse = §7.3 ${kind}`).toBe(VENDORS[kind].purse);
      }
      if (n.trainer) expect(skillIds.has(n.trainer.skill), `${n.id} trains`).toBe(true);
      if (n.combat?.weapon) expect(itemIds.has(n.combat.weapon) || n.combat.weapon in NATURAL_WEAPONS || n.combat.weapon === 'fists', `${n.id} wields ${n.combat.weapon}`).toBe(true);
      if (n.combat?.shield) expect(itemIds.has(n.combat.shield), `${n.id} shield ${n.combat.shield}`).toBe(true);
    }
  });

  it('live in known places, with schedules in order and patrol routes of known places', () => {
    for (const n of npcs) {
      if (n.home) expect(isKnownPlace(n.home), `${n.id} home ${n.home}`).toBe(true);
      let prev = -1;
      for (const e of n.schedule ?? []) {
        expect(isKnownPlace(e.at), `${n.id} schedule ${e.at}`).toBe(true);
        expect(e.from, `${n.id} schedule order`).toBeGreaterThan(prev);
        expect(e.from).toBeLessThan(24);
        prev = e.from;
        for (const r of e.route ?? []) expect(isKnownPlace(r), `${n.id} route ${r}`).toBe(true);
        if (e.activity === 'patrol') expect(e.route?.length, `${n.id} patrol route`).toBeGreaterThan(1);
      }
    }
  });

  it('cover the cast the brief asks for', () => {
    const cast = [
      // the main quest, the Castor strongrooms and the knife-men
      'npc-festus', 'npc-dromo', 'npc-mus', 'npc-philetus', 'npc-chrysippus', 'npc-gratus',
      // the Ludus: lanista-side people, the doctor, the medicus, a thraex, Nereus
      'npc-glaucus', 'npc-celer', 'npc-hermippus', 'npc-successus', 'npc-asiaticus', 'npc-pullus', 'npc-auctus', 'npc-nereus',
      // the arms dealer on the Sacra Via, the popina keeper, vigiles and the urban cohorts
      'npc-euhodus', 'npc-chreste', 'npc-primigenius', 'npc-crescens', 'npc-verecundus', 'npc-miles-valens', 'npc-miles-severus',
      // the colourful Romans
      'npc-iuvenalis', 'npc-apollodorus', 'npc-vestalis-maxima', 'npc-patron-vettius', 'npc-arruns', 'npc-zenon', 'npc-cerinthus', 'npc-philadelphus', 'npc-cerdo', 'npc-talarius', 'npc-lurco', 'npc-florus', 'npc-prima', 'npc-callistus',
    ];
    for (const id of cast) expect(npcIds.has(id), id).toBe(true);
    expect(npcs.find((n) => n.id === 'npc-nereus')!.combat).toMatchObject({ health: 300, yieldAt: 0.15, weapon: 'tridens-lusorius', ranged: 'rete' });
    expect(npcs.find((n) => n.id === 'npc-iuvenalis')!.essential).toBe(true);
    // 15+ colourful Romans beyond the quest people (the street people and the historical figures)
    const colourful = npcs.filter((n) => n.tags?.some((t) => ['plebs', 'elite', 'servus', 'mendicus', 'otiosus', 'arena-fan', 'augur'].includes(t)));
    expect(colourful.length).toBeGreaterThanOrEqual(15);
  });

  it('give everyone a voice: every NPC has a dialogue that exists, a few barks and something to say', () => {
    for (const n of npcs) {
      expect(n.dialogue, `${n.id} has a dialogue`).toBeTruthy();
      expect(dialogueById.has(n.dialogue!), `${n.id} → ${n.dialogue}`).toBe(true);
      expect(n.barks?.length ?? 0, `${n.id} barks`).toBeGreaterThanOrEqual(1);
      expect(n.name.length, n.id).toBeGreaterThan(2);
    }
    expect(npcs.length).toBeGreaterThanOrEqual(75);
  });

  it('never use "travel" to mean offstage: sleepers are not spawned, travellers would stand around', () => {
    for (const n of npcs) for (const e of n.schedule ?? []) expect(e.activity, `${n.id}`).not.toBe('travel');
  });
});

describe('items and texts', () => {
  it('adds no duplicate ids; texts are readable with a kind tag; quest items are quest items', () => {
    const ids = [...ITEMS, ...moduleItems].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEXT_ITEMS) {
      expect(t.type, t.id).toBe('book');
      expect(t.text!.length, t.id).toBeGreaterThan(80);
      expect(t.description.length, t.id).toBeGreaterThan(10);
      expect(ITEMS).toContain(t);
    }
    // Every readable thing in the catalogue: the bible's letters, tablets, curses and the extras.
    const readable = ITEMS.filter((d) => d.text);
    expect(readable.length).toBeGreaterThanOrEqual(12);
    const kinds = new Set(readable.flatMap((t) => t.tags ?? []));
    for (const k of ['letter', 'tablet', 'note', 'curse']) expect(kinds.has(k), k).toBe(true);
    for (const t of readable) expect(t.text!.length, t.id).toBeGreaterThan(8);
    const tablet = ITEMS.find((d) => d.id === 'quest-tabella-signata')!;
    expect(tablet).toMatchObject({ type: 'quest', questItem: true, value: 0 });
    expect(tablet.text).toContain('PVDENTI');
    for (const d of ITEMS.filter((x) => x.id.startsWith('quest-'))) {
      expect(d.type, d.id).toBe('quest');
      expect(d.questItem, d.id).toBe(true);
      expect(d.weight, d.id).toBe(0);
    }
    // The Ludus lends its shields with the catalogue's stats and no resale value.
    const lent = ITEMS.find((d) => d.id === 'scutum-ludi')!;
    expect(lent.shield).toEqual(ITEMS.find((d) => d.id === 'scutum')!.shield);
    expect(lent.value).toBe(0);
  });

  it('places every wall text somewhere known', () => {
    const ids = ALL_WALL_TEXTS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WALL_TEXTS.length).toBeGreaterThanOrEqual(20);
    expect(ALL_WALL_TEXTS.length).toBeGreaterThanOrEqual(30);
    for (const w of ALL_WALL_TEXTS) {
      expect(isKnownPlace(w.at), `${w.id} at ${w.at}`).toBe(true);
      expect(w.source.length, w.id).toBeGreaterThan(5);
    }
  });
});

describe('barks and vignettes', () => {
  it('cover every v0.1 district by day and by night, with anchors in the atlas', () => {
    for (const d of DISTRICTS) {
      const lines = DISTRICT_BARKS[d.id];
      expect(lines.some((l) => barkFits(l, 10)), `${d.id} day`).toBe(true);
      expect(lines.some((l) => barkFits(l, 23)), `${d.id} night`).toBe(true);
      for (const a of d.anchors) expect(LANDMARK_BY_ID[a], `${d.id} anchor ${a}`).toBeTruthy();
    }
    for (const a of ['tabernarius', 'faber', 'patronus', 'cliens', 'matrona', 'servus-baiulus', 'miles-urbanus', 'vigil', 'sacerdos', 'gladiator', 'otiosus', 'mendicus', 'plaustrarius', 'grassator', 'puer']) expect(ARCHETYPE_BARKS[a]?.length, a).toBeGreaterThan(0);
    expect(FESTIVAL_BARKS['fest-lemuria'].some((l) => barkFits(l, 0))).toBe(true);
    expect(Object.keys(REACTION_BARKS)).toEqual(expect.arrayContaining(['sordidus', 'toga-woman', 'armed', 'bounty']));
  });

  it('pickBark respects the hour and the speaker, weighs reactions, and is deterministic', () => {
    let s = 0.123;
    const rng = () => (s = (s * 9301 + 0.49297) % 1);
    for (let i = 0; i < 200; i++) {
      const l = pickBark({ district: 'dist-forum-romanum', archetype: 'vigil', hour: 2, rng })!;
      expect(barkFits(l, 2)).toBe(true);
    }
    expect(pickBark({ archetype: 'matrona', hour: 10, sex: 'male', rng: () => 0.5 })).toBeNull();
    const reacted = Array.from({ length: 50 }, (_, i) => pickBark({ district: 'dist-velia', hour: 12, reactions: ['sordidus'], rng: () => i / 50 })!.text);
    expect(reacted.filter((t) => REACTION_BARKS.sordidus.some((l) => l.text === t)).length).toBeGreaterThan(20);
    expect(pickBark({ district: 'dist-velia', hour: 12, rng: () => 0.3 })).toEqual(pickBark({ district: 'dist-velia', hour: 12, rng: () => 0.3 }));
    expect(festivalsOn(4, 11)).toEqual(['fest-lemuria', 'fest-columna-eve']);
    expect(festivalsOn(4, 12)).toEqual([]);
  });

  it('districtAt finds the district from a game position', () => {
    expect(districtAt(0, 0)).toBe('dist-forum-romanum');
    expect(districtAt(525, 171)).toBe('dist-vallis-colossei');
    expect(districtAt(304, 573)).toBe('dist-circus-maximus');
    expect(districtAt(5000, 5000)).toBeNull();
  });

  it('has at least 25 vignette types with valid casts and lines', () => {
    expect(VIGNETTES.length).toBeGreaterThanOrEqual(25);
    const ids = VIGNETTES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of VIGNETTES) {
      expect(v.cast.length, v.id).toBeGreaterThan(0);
      for (const c of v.cast) expect(AVATAR_ROLES, `${v.id} look ${c.look}`).toContain(c.look);
      for (const l of v.lines) expect(l.by === -1 || (l.by >= 0 && l.by < castSize(v)), `${v.id} line by ${l.by}`).toBe(true);
      expect(v.hours[0] >= 0 && v.hours[0] < 24 && v.hours[1] >= 0 && v.hours[1] <= 24, v.id).toBe(true);
      if (v.districts !== 'any') for (const d of v.districts) expect(DISTRICT_BARKS[d], `${v.id} ${d}`).toBeTruthy();
    }
    expect(VIGNETTES.some((v) => v.festivals?.includes('fest-lemuria'))).toBe(true);
  });
});

// ------------------------------------------------------------------ the golden path (the owner's "bland corridor" feedback)

/** Game position of a place id (content places, then atlas landmarks), or null. */
function placeAt(id: string): { x: number; z: number } | null {
  const l = CONTENT_LOCATIONS.find((x) => x.id === id);
  if (l) return { x: l.position.x, z: l.position.z };
  const lm = LANDMARK_BY_ID[id];
  if (lm) return { x: lm.center[0] * 0.6, z: lm.center[1] * 0.6 };
  return null;
}

/** Named people out and about on the corridor at an hour: distance along it (real m) and how far off. */
function corridorFolk(hour: number): { id: string; d: number; off: number }[] {
  const out: { id: string; d: number; off: number }[] = [];
  for (const n of npcs) {
    const e = entryAt(n.schedule, hour);
    const at = e ? e.at : n.home;
    if (!at || e?.activity === 'sleep') continue;
    const p = placeAt(at);
    if (!p) continue;
    const pr = projectOnPath(p.x / 0.6, p.z / 0.6);
    if (pr.off <= 110) out.push({ id: n.id, ...pr });
  }
  return out;
}

describe('the golden path is populated', () => {
  it('measures about 1.27 km (760 game m) from the cart stand to the Forum, and its stations lie on it', () => {
    expect(GOLDEN_PATH_LENGTH).toBeGreaterThan(1200);
    expect(GOLDEN_PATH_LENGTH).toBeLessThan(1330);
    for (const s of STREET_SPOTS) {
      const pr = projectOnPath(s.position.x / 0.6, s.position.z / 0.6);
      expect(pr.off, `${s.id} off the path`).toBeLessThan(14);
    }
    const [x, z] = onPath(0, 0);
    expect([x, z]).toEqual([523, 974]);
  });

  it('has someone with a name every 70 m or so along the walk at the first hours after dawn (no empty stretch)', () => {
    for (const hour of [5.5, 7, 9]) {
      const folk = corridorFolk(hour);
      expect(folk.length, `named people on the corridor at ${hour}`).toBeGreaterThanOrEqual(24);
      let worst = 0;
      let at = 0;
      for (let d = 0; d <= GOLDEN_PATH_LENGTH; d += 10) {
        const nearest = Math.min(...folk.map((f) => Math.abs(f.d - d)));
        if (nearest > worst) (worst = nearest), (at = d);
      }
      // 130 real m between people = 78 game m: a gap you can see across.
      expect(worst, `the longest empty stretch at ${hour}:00 is ${Math.round(worst * 2)} m, around d=${Math.round(at)}`).toBeLessThanOrEqual(65);
    }
  });

  it('has the dawn shift out before the first hour (the player arrives at 04:30)', () => {
    const early = corridorFolk(4.6).map((f) => f.id);
    for (const id of ['npc-festus', 'npc-dromo', 'npc-capito', 'npc-crescens', 'npc-miles-valens', 'npc-gaudens', 'npc-mancinus', 'npc-epagathus', 'npc-cornix', 'npc-trophimus', 'npc-sabinus', 'npc-dorcas']) expect(early, id).toContain(id);
  });

  it('gives each station someone to talk to and the shrines on the way their attendants', () => {
    const homes = new Set(npcs.flatMap((n) => [n.home, ...(n.schedule ?? []).map((e) => e.at)]));
    for (const s of STREET_SPOTS) expect(homes.has(s.id), `${s.id} has someone`).toBe(true);
    for (const id of ['compitum-capenae', 'compitum-circi', 'compitum-vici-tusci']) expect(homes.has(id), id).toBe(true);
  });

  it('lights it: lamps at the gate, the shrines, the stations and the shops, and every ~45 m of street', () => {
    const lamps = lampSpecs();
    expect(lamps.length).toBeGreaterThanOrEqual(60);
    for (const l of lamps) if (typeof l.at === 'string') expect(isKnownPlace(l.at), `lamp at ${l.at}`).toBe(true);
    const along = lamps.filter((l) => typeof l.at !== 'string').map((l) => (l.at as { d: number }).d);
    for (let d = 100; d < GOLDEN_PATH_LENGTH - 100; d += 20) expect(Math.min(...along.map((x) => Math.abs(x - d))), `a lamp near d=${d}`).toBeLessThanOrEqual(30);
  });
});

describe('street containers, shrines and texts', () => {
  it('has at least 40 street containers (AC-23), 20 of them unowned, with known places, tables and owners', () => {
    expect(STREET_CONTAINERS.length).toBeGreaterThanOrEqual(40);
    expect(UNOWNED_CONTAINERS.filter((c) => !['silt-niche', 'cista-regis-cloacae'].includes(c.kind)).length).toBeGreaterThanOrEqual(40);
    const ids = CONTAINERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONTAINERS) {
      if (typeof c.at === 'string') expect(isKnownPlace(c.at), `${c.id} at ${c.at}`).toBe(true);
      else expect(Math.abs(c.at.side), c.id).toBeLessThanOrEqual(10);
      expect(lootTable(c.table), `${c.id} table ${c.table}`).toBeTruthy();
      if (c.key) expect(itemIds.has(c.key), `${c.id} key`).toBe(true);
      if (c.owner?.startsWith('npc-') && !c.interior) expect(npcIds.has(c.owner), `${c.id} owner ${c.owner}`).toBe(true);
      if (c.kind === 'arca-compiti') expect(c.table).toBe('shrine');
    }
    // Every kind that appears has a style, and the points of path-bound ones are on the street.
    for (const c of STREET_CONTAINERS) if (typeof c.at !== 'string') expect(projectOnPath(...(routePoint(c.at) as [number, number])).off).toBeLessThan(11);
    // Both flavours of loot: the bible's tables and the fixed ones.
    for (const t of ['cache.street', 'amphora.wine', 'locker.ludus', 'cloaca.silt', 'cista-muris', 'cista-regis-cloacae']) expect(lootTable(t), t).toBeTruthy();
  });

  it('has shrines at the six crossroads and the small gods of the Forum', () => {
    const ids = SHRINES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['compitum-capenae', 'compitum-circi', 'compitum-vici-tusci', 'compitum-velabri', 'compitum-boarii', 'compitum-acili']) expect(ids, id).toContain(id);
    for (const s of SHRINES) expect(isKnownPlace(s.id), s.id).toBe(true);
  });
});

describe('AC-23: a "thing" at every tier-1 landmark of the v0.1 districts', () => {
  it('has a note, an inscription or a vista for every landmark of the nine districts (and nothing for unknown ones)', () => {
    const anchors = DISTRICTS.flatMap((d) => d.anchors);
    expect(anchors.length).toBeGreaterThanOrEqual(40);
    const have = new Set(THINGS.map((t) => t.at));
    for (const a of anchors) expect(have.has(a), `a thing for ${a}`).toBe(true);
    for (const t of THINGS) {
      expect(LANDMARK_BY_ID[t.at], `${t.at} is an atlas landmark`).toBeTruthy();
      expect(t.text.length, t.at).toBeGreaterThan(120);
      expect(t.text.length, t.at).toBeLessThan(700);
      expect(t.title.length, t.at).toBeGreaterThan(5);
      expect(t.source.length, t.at).toBeGreaterThan(5);
      expect(['inscription', 'vista', 'note']).toContain(t.kind);
      if (t.kind === 'inscription') expect(t.latin, `${t.at} inscription has its Latin`).toBeTruthy();
      if (t.latin) expect(t.latin, t.at).toBe(t.latin.toUpperCase());
      const p = thingPoint(t)!;
      const lm = LANDMARK_BY_ID[t.at];
      const [cx, cz] = toGame(lm.center[0], lm.center[1]);
      expect(Math.hypot(p.x - cx, p.z - cz), `${t.at} thing is near the landmark`).toBeLessThan(260);
    }
    expect(new Set(THINGS.map((t) => t.at)).size).toBe(THINGS.length);
    // Nothing from after AD 113 is promised.
    for (const t of THINGS) expect(t.text, t.at).not.toMatch(/Hadrian|Severus|Constantine|Caracalla|Diocletian|Aurelian|Venus and Roma/);
    expect(THINGS.filter((t) => t.kind === 'vista').length).toBeGreaterThanOrEqual(8);
  });
});
