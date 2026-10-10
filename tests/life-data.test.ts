/**
 * The life data validator (docs/design/world-life.md §3.6): the real data (src/life/data/**) and the
 * worked examples are clean against the world's ids, and a broken fixture reports every planted
 * error. The quests phase 2 adds (jobs and the six side quests) pass the same history lint.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISTRICTS as BARK_DISTRICTS } from '../src/content/barks';
import { dialogueModules } from '../src/dialogue/DialogueSystem';
import { FESTIVALS } from '../src/game/calendar';
import examples from '../src/life/data/_examples';
import { LIFE, lintText, mergeLife, validateLife, walkStrings, withExamples, type LifeRefs } from '../src/life/registry';
import type { KeeperDef, LifeData, OptionDef } from '../src/life/types';
import { STATIONS } from '../src/npc/crowd/stations';
import { loadNpcContent } from '../src/npc/registry';
import { loadQuestContent, questModules } from '../src/quests/QuestSystem';
import { CONDITIONS } from '../src/rpg/data/conditions';
import { FACTIONS } from '../src/rpg/data/factions';
import { ITEMS } from '../src/rpg/data/items';
import { SKILLS } from '../src/rpg/data/skills';
import { VENDORS } from '../src/rpg/data/vendors';

/** The crowd's districts (crowd/districts.ts) and the barks' (content/barks.ts). */
const CROWD_DISTRICTS = ['dist-forum-romanum', 'dist-fora-imperialia', 'dist-velia', 'dist-vallis-colossei', 'dist-subura', 'dist-velabrum-boarium', 'dist-circus-maximus', 'dist-porta-capena'];

const modules = [...questModules(), ...dialogueModules()];
const quests = loadQuestContent();

const REFS: LifeRefs = {
  items: new Set([...ITEMS, ...modules.flatMap((m) => m.items ?? [])].map((d) => d.id)),
  npcs: new Set([...loadNpcContent(), ...modules.flatMap((m) => m.npcs ?? [])].map((n) => n.id)),
  stations: new Map(STATIONS.map((s) => [s.id, s])),
  vendors: new Set(Object.keys(VENDORS)),
  quests: new Set(quests.map((q) => q.id)),
  festivals: new Set(FESTIVALS.map((f) => f.id)),
  skills: new Set(SKILLS.map((s) => s.id)),
  conditions: new Set(CONDITIONS.map((c) => c.id)),
  factions: new Set(FACTIONS.map((f) => f.id)),
  districts: new Set([...CROWD_DISTRICTS, ...BARK_DISTRICTS.map((d) => d.id)]),
};

describe('life data', () => {
  it('the real data is clean', () => {
    expect(validateLife(LIFE as Required<LifeData>, REFS)).toEqual([]);
    // The examples ('_' files) stay out of the game's data.
    expect(LIFE.keepers.some((k) => k.id.startsWith('keeper-example'))).toBe(false);
    expect(LIFE.activities.some((a) => a.id.startsWith('act.example'))).toBe(false);
  });

  it('every ServiceSet reaches its person: a hand-written dialogue spreads their lifeChoices', () => {
    // A ServiceSet does nothing until the person's own conversation splices in lifeChoices(npc)
    // (§3.3 "Services for existing NPCs"); a missing spread hides the services, the bench or the job.
    const dir = join(__dirname, '../src/dialogue/content');
    const src = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    for (const s of LIFE.services) expect(src.includes(`lifeChoices('${s.npc}'`), s.npc).toBe(true);
  });

  it('the worked examples are clean, with the real data', () => {
    expect(validateLife(withExamples(LIFE as Required<LifeData>, examples), REFS)).toEqual([]);
    const ex = mergeLife([examples]);
    // One of every type.
    for (const lane of ['keepers', 'services', 'activities', 'recipes', 'wagers', 'rumours'] as const) expect(ex[lane].length, lane).toBeGreaterThan(0);
  });

  it('an example gives way to real data on the same post', () => {
    const real = mergeLife([{ keepers: [{ ...examples.keepers![0], id: 'keeper-subura-vinarius' }] }]);
    const both = withExamples(real, examples);
    expect(both.keepers.map((k) => k.id)).toEqual(['keeper-subura-vinarius']);
  });

  it('the phase-2 quests pass the history lint', () => {
    const LIFE_QUESTS = /^job-|^misc-(hilara|urna-aenea|fur-balnearius|tesserae-falsae|mercuralia|servus-aesculapii)$/;
    for (const q of quests.filter((x) => LIFE_QUESTS.test(x.id))) {
      walkStrings({ title: q.title, summary: q.summary, stages: q.stages }, (s) => expect(lintText(s), `${q.id}: ${s}`).toEqual([]));
    }
  });
});

// ------------------------------------------------------------------ a broken fixture

const ok: OptionDef = { id: 'ok', text: 'Fine', effects: [], result: 'Done.' };
const keeper = (patch: Partial<KeeperDef>): KeeperDef => ({
  id: 'keeper-test-ok',
  district: 'dist-subura',
  station: 'st-subura-tonsor',
  member: 1,
  name: 'Gaius Testius',
  title: 'Tester',
  talk: { greet: 'Salve.', topics: [{ ask: 'a', say: 'b' }, { ask: 'c', say: 'd' }] },
  period: '[G]',
  ...patch,
});

/** Each planted error and what the validator must say about it. */
const PLANTED: [string, LifeData, RegExp][] = [
  ['bad keeper prefix', { keepers: [keeper({ id: 'shop-x' })] }, /keeper shop-x: id must start with 'keeper-'/],
  ['duplicate id', { keepers: [keeper({}), keeper({ member: 0 })] }, /keeper keeper-test-ok: id used twice/],
  ['post claimed twice', { keepers: [keeper({}), keeper({ id: 'keeper-test-two' })] }, /post st-subura-tonsor#1 is already claimed/],
  ['unknown station', { keepers: [keeper({ station: 'st-nowhere' })] }, /unknown station 'st-nowhere'/],
  ['member out of range', { keepers: [keeper({ member: 9 })] }, /member 9: station 'st-subura-tonsor' has 3 members/],
  ['unknown district', { keepers: [keeper({ district: 'dist-atlantis' })] }, /unknown district 'dist-atlantis'/],
  ['unknown vendor kind', { keepers: [keeper({ shop: { vendor: 'alchemist', stock: [{ id: 'panis', count: 1 }] } })] }, /unknown vendor kind 'alchemist'/],
  ['shop without stock', { keepers: [keeper({ shop: { vendor: 'pistor', stock: [] } })] }, /a shop with no stock/],
  ['unknown stock item', { keepers: [keeper({ shop: { vendor: 'pistor', stock: [{ id: 'panis-aureus', count: 2 }] } })] }, /unknown item 'panis-aureus'/],
  ['one topic', { keepers: [keeper({ talk: { greet: 'Salve.', topics: [{ ask: 'a', say: 'b' }] } })] }, /1 topics \(at least 2\)/],
  ['new station without prefix', { keepers: [keeper({ station: { id: 'st-new', when: ['morning'], members: [{ role: 'merchant', out: 1, side: 0, loop: 'stand' }] }, member: 0 })] }, /new station 'st-new' must start with 'st-life-'/],
  ['real person as keeper', { keepers: [keeper({ name: 'Gaius Plinius Secundus' })] }, /real people never speak/],
  ['price not in quadrantes', { keepers: [keeper({ services: [{ ...ok, price: 0.01 }] })] }, /price 0\.01: must be above 0 in whole quadrantes/],
  ['zero price', { keepers: [keeper({ services: [{ ...ok, price: 0 }] })] }, /price 0: must be above 0/],
  ['bad hour mark', { activities: [{ id: 'act.test.x', name: 'X', verb: 'Use', at: { place: 'rostra' }, open: [{ from: 'h13' as never, to: 'h2' }], options: [ok], period: '[G]' }] }, /'h13' is not a Roman hour mark/],
  ['unknown quest in a gate', { keepers: [keeper({ services: [{ ...ok, gate: { questDone: 'mq-99-nowhere' } }] })] }, /unknown quest 'mq-99-nowhere'/],
  ['unknown festival', { keepers: [keeper({ services: [{ ...ok, gate: { festival: 'fest-saturnalia-in-may' } }] })] }, /unknown festival 'fest-saturnalia-in-may'/],
  ['unknown skill', { keepers: [keeper({ services: [{ ...ok, effects: [{ kind: 'skillXp', skill: 'alchemy', amount: 5 }] }] })] }, /unknown skill 'alchemy'/],
  ['unknown condition', { keepers: [keeper({ services: [{ ...ok, effects: [{ kind: 'condition', id: 'blessed-by-isis-twice' }] }] })] }, /unknown condition 'blessed-by-isis-twice'/],
  ['unknown faction', { keepers: [keeper({ services: [{ ...ok, effects: [{ kind: 'fama', faction: 'guild-of-thieves', amount: 1 }] }] })] }, /unknown faction 'guild-of-thieves'/],
  ['unknown NPC for a service set', { services: [{ npc: 'npc-nobody', services: [ok] }] }, /unknown NPC 'npc-nobody'/],
  ['duplicate option id', { services: [{ npc: 'npc-dama', services: [ok, ok] }] }, /option ok: id used twice by one owner/],
  ['recipe makes its own input', { recipes: [{ id: 'rec.mortar.loop', bench: 'mortar', name: 'Loop', minLevel: 0, inputs: [{ item: 'mel', count: 1 }], output: { item: 'mel', count: 2 }, hours: 1, xp: 5, period: '[G]' }] }, /the output 'mel' is one of its inputs/],
  ['unknown bench', { recipes: [{ id: 'rec.anvil.nail', bench: 'anvil' as never, name: 'Nails', minLevel: 0, inputs: [{ item: 'mel', count: 1 }], output: { item: 'panis', count: 1 }, hours: 1, xp: 5, period: '[G]' }] }, /unknown bench 'anvil'/],
  ['wager stake not in quadrantes', { wagers: [{ id: 'wgr.tali.test', game: 'tali', stakes: [0.07], bank: 3, period: '[G]' }] }, /stake 0\.07/],
  ['rumour too long', { rumours: [{ id: 'rum.test.long', kind: 'talk', text: 'x'.repeat(281) }] }, /text is 281 characters \(talk at most 280\)/],
  ['notice too long', { rumours: [{ id: 'rum.test.notice', kind: 'notice', text: 'x'.repeat(401) }] }, /text is 401 characters \(notice at most 400\)/],
  ['unknown board', { rumours: [{ id: 'rum.test.board', kind: 'notice', boards: ['board-mars'], text: 'Hear!' }] }, /unknown board 'board-mars'/],
  ['unknown hook', { rumours: [{ id: 'rum.test.hook', kind: 'talk', hook: 'misc-nowhere', text: 'Hear!' }] }, /unknown quest 'misc-nowhere'/],
  ['bad rumour prefix', { rumours: [{ id: 'rumour.x', kind: 'talk', text: 'Hear!' }] }, /rumour rumour\.x: id must start with 'rum\.'/],
  ['a building after 113', { rumours: [{ id: 'rum.test.baths', kind: 'talk', text: 'Meet me at the Baths of Caracalla.' }] }, /names Caracalla/],
  ['Hadrian as emperor', { rumours: [{ id: 'rum.test.hadrian', kind: 'talk', text: 'Long live the emperor Hadrian!' }] }, /names Hadrian as emperor/],
  ['the Pepper Warehouses', { rumours: [{ id: 'rum.test.pepper', kind: 'talk', text: 'Strange men at the Horrea Piperataria.' }] }, /names the Pepper Warehouses/],
  ['pepper in keeper talk', { keepers: [keeper({ talk: { greet: 'Salve.', topics: [{ ask: 'a', say: 'Down at the pepper warehouse, they say…' }, { ask: 'c', say: 'd' }] } })] }, /keeper keeper-test-ok: names the Pepper Warehouses/],
  ['Hermogenes', { rumours: [{ id: 'rum.test.banker', kind: 'talk', text: 'Hermogenes the banker lends at twelve in the hundred.' }] }, /Hermogenes is protected/],
  ['Euhodus beyond repairs', { services: [{ npc: 'npc-euhodus', services: [{ ...ok, effects: [{ kind: 'give', item: 'panis' }] }] }] }, /Euhodus gets the repair choice only/],
  ['activity with nothing to do', { activities: [{ id: 'act.test.empty', name: 'Empty', verb: 'Look', at: { place: 'rostra' }, period: '[G]' }] }, /nothing to do/],
  ['unknown station dressing', { activities: [{ id: 'act.test.dress', name: 'D', verb: 'Use', at: { station: 'st-subura-tonsor', dressing: 0 }, options: [ok], period: '[G]' }] }, /station 'st-subura-tonsor' has no dressing #0/],
];

describe('validateLife on a broken fixture', () => {
  for (const [name, data, want] of PLANTED) {
    it(`reports: ${name}`, () => {
      const problems = validateLife(mergeLife([data]), REFS);
      expect(problems.some((p) => want.test(p)), `${problems.join('\n')}`).toBe(true);
    });
  }

  it('reports every planted error at once', () => {
    const all = mergeLife(PLANTED.map(([, d]) => d));
    const problems = validateLife(all, REFS);
    for (const [name, , want] of PLANTED) expect(problems.some((p) => want.test(p)), name).toBe(true);
  });
});
