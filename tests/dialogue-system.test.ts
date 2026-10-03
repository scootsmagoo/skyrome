import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueSystem } from '../src/dialogue/DialogueSystem';
import { defineDialogue, type DialogueDef } from '../src/dialogue/types';
import { NpcRegistry } from '../src/npc/registry';
import type { NpcDef } from '../src/npc/types';
import { ITEMS } from '../src/rpg/data/items';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { FactionSystem } from '../src/rpg/factions';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';
import { fakeGame, record } from './rpg-fakes';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const appearance: NpcDef['appearance'] = { sex: 'male', age: 'adult', build: 'average', height: 1.7, skin: '#c69c7a', hair: { style: 'cropped', color: '#2a2018' }, garments: [{ kind: 'tunica', color: '#9c8462' }] };

/** A fixed-roll RNG: every roll returns `v`. */
const fixed = (v: number) => ({ next: () => v });

function setup(defs: DialogueDef[], roll = 0.5) {
  const fg = fakeGame();
  const sheet = new CharacterSheetImpl({ events: fg.events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events: fg.events, sheet });
  Object.assign(fg.game.player, { sheet, inventory });
  fg.game.npcs = new NpcRegistry([
    { id: 'marcus', name: 'Marcus the Cobbler', appearance },
    { id: 'chosen', name: 'Chosen One', appearance, dialogue: 'special' },
    { id: 'senator', name: 'Senator Bassus', appearance, tags: ['elite'], combat: { tier: 'civilian', band: 0, health: 30, stamina: 50, armor: 0, aggression: 0, blockSkill: 0, skill: 5 } },
    { id: 'miles', name: 'A Soldier', appearance, tags: ['soldier', 'baetican'], combat: { tier: 'miles', band: 2, health: 70, stamina: 100, armor: 50, aggression: 0.5, blockSkill: 0.5, skill: 35 } },
    { id: 'cato', name: 'Cato the Honest', appearance, tags: ['official', 'incorruptible'] },
  ]);
  const dialogue = new DialogueSystem(fg.game, { defs, rng: fixed(roll) });
  return { ...fg, sheet, inventory, dialogue };
}

const cobbler = defineDialogue({
  id: 'cobbler',
  npcs: ['marcus'],
  priority: 1,
  start: (c) => (c.memory.met ? 'again' : 'hello'),
  nodes: {
    hello: {
      text: 'Salve! Shoes?',
      effects: (c) => (c.memory.met = true),
      choices: [
        { text: 'Tell me a story.', once: true, goto: 'story' },
        { text: 'Lower your prices.', check: { skill: 'rhetoric', difficulty: 30, pass: 'yes', fail: 'no' } },
        { text: 'Here is a coin for your trouble.', bribe: { amount: 3, goto: 'yes' } },
        { text: 'Secret option', if: (c) => c.flag('secret') === true, goto: 'yes' },
        { text: 'Pay the debt (10 d)', enabled: (c) => c.denarii() >= 10, goto: 'yes', effects: (c) => void c.pay(10) },
        { text: 'Fight me!', goto: 'fight' },
        { text: 'Vale.', end: true },
      ],
    },
    again: { text: (c) => `Back again, after ${c.memory._talks} visits.`, choices: [{ text: 'Story?', once: true, goto: 'story' }, { text: 'Bye.' }] },
    story: { speaker: 'player', text: 'I once walked from Ostia barefoot.', next: 'reply' },
    reply: { text: 'And now you need shoes.', next: 'hello' },
    yes: { text: 'Fine, fine.', end: true, effects: (c) => c.setFlag('discount', true) },
    no: { text: 'No.', end: true },
    fight: { text: 'Outside!', effects: (c) => c.attack() },
  },
});

const generic = defineDialogue({ id: 'generic', npcs: ['*'], start: () => 'hi', nodes: { hi: { text: 'Ave.', end: true } } });
const lowPrio = defineDialogue({ id: 'low', npcs: ['marcus'], priority: 0, start: () => 'x', nodes: { x: { text: 'Low.', end: true } } });
const silent = defineDialogue({ id: 'silent', npcs: ['marcus'], priority: 5, start: () => '', nodes: {} });
const special = defineDialogue({ id: 'special', npcs: [], start: () => 'x', nodes: { x: { text: 'Destiny.', end: true } } });

describe('selection', () => {
  it('picks the highest-priority dialogue that has something to say, then falls back to *', () => {
    const { dialogue } = setup([generic, lowPrio, cobbler, silent, special]);
    expect(dialogue.candidates('marcus').map((d) => d.id)).toEqual(['silent', 'cobbler', 'low', 'generic']);
    expect(dialogue.start('marcus')!.dialogueId).toBe('cobbler');
    expect(dialogue.start('someone_random', { name: 'Fishmonger' })).toMatchObject({ dialogueId: 'generic', speakerName: 'Fishmonger', text: 'Ave.' });
    expect(dialogue.start('chosen')!.dialogueId).toBe('special');
    expect(dialogue.start('marcus', { dialogueId: 'low' })!.text).toBe('Low.');
  });

  it('returns null when nobody has anything to say', () => {
    const { dialogue } = setup([silent]);
    expect(dialogue.start('marcus')).toBeNull();
    expect(dialogue.active).toBe(false);
  });
});

describe('conversation flow', () => {
  it('builds a UI view, hides `if` choices, disables unaffordable ones, tags checks and bribes', () => {
    const { dialogue, events } = setup([cobbler]);
    const log = record(events, ['dialogue:started', 'dialogue:node', 'dialogue:ended']);
    const v = dialogue.start('marcus')!;
    expect(v).toMatchObject({ npcId: 'marcus', speakerName: 'Marcus the Cobbler', text: 'Salve! Shoes?', canContinue: false, willEnd: false });
    expect(v.choices.map((c) => [c.text, c.enabled, c.tag ?? ''])).toEqual([
      ['Tell me a story.', true, ''],
      ['Lower your prices.', true, 'Persuade 30%'],
      ['Here is a coin for your trouble.', false, 'Bribe 3 d'],
      ['Pay the debt (10 d)', false, ''],
      ['Fight me!', true, ''],
      ['Vale.', true, ''],
    ]);
    expect(dialogue.choose(3)).toBe(v); // disabled: ignored
    expect(dialogue.choose(5)).toBeNull();
    expect(log.map((l) => l.type)).toEqual(['dialogue:started', 'dialogue:node', 'dialogue:ended']);
  });

  it('follows next/advance, labels player lines, and removes once-choices for good', () => {
    const { dialogue } = setup([cobbler]);
    dialogue.start('marcus');
    let v = dialogue.choose(0)!;
    expect(v).toMatchObject({ nodeId: 'story', speaker: 'player', speakerName: 'You', canContinue: true });
    expect(dialogue.choose(0)).toBe(v); // no choices: choose does nothing
    v = dialogue.advance()!;
    expect(v.nodeId).toBe('reply');
    v = dialogue.advance()!;
    expect(v.nodeId).toBe('hello');
    expect(v.choices.map((c) => c.text)).not.toContain('Tell me a story.');
    dialogue.end();
    v = dialogue.start('marcus')!;
    expect(v.nodeId).toBe('again');
    expect(v.text).toBe('Back again, after 2 visits.');
    expect(v.choices.map((c) => c.text)).toEqual(['Story?', 'Bye.']);
    expect(dialogue.choose(1)).toBeNull(); // no goto → ends
  });

  it('checks follow §14.5 — p = 0.50 + (skill + mods − DC) / 100, between 5% and 95% — on the seeded RNG; XP 10 × tier or 2', () => {
    const fail = setup([cobbler], 0.99);
    fail.dialogue.start('marcus');
    const checks = record(fail.events, ['dialogue:check']);
    expect(fail.dialogue.choose(1)).toMatchObject({ nodeId: 'no' });
    expect(checks[0].e).toMatchObject({ skill: 'rhetoric', chance: 0.3, pass: false });
    expect(fail.sheet.skillXp('rhetoric')).toBe(2);

    const pass = setup([cobbler], 0.29);
    pass.dialogue.start('marcus');
    expect(pass.dialogue.choose(1)).toMatchObject({ nodeId: 'yes' });
    expect(pass.sheet.skillXp('rhetoric')).toBe(20); // DC 30 is tier 2 (Mediocris)
    expect(pass.dialogue.flags.get('discount')).toBe(true);

    const charm = setup([cobbler], 0.94);
    charm.sheet.setSkill('rhetoric', 80);
    charm.dialogue.start('marcus');
    expect(charm.dialogue.view!.choices[1].tag).toBe('Persuade 95%');
    expect(charm.dialogue.choose(1)!.nodeId).toBe('yes');
    const wine = setup([cobbler]);
    wine.sheet.setModifierSource('wine', { 'persuade.chance': 0.2 });
    expect(wine.dialogue.start('marcus')!.choices[1].tag).toBe('Persuade 50%');
    const lucky = setup([cobbler], 0.99);
    lucky.sheet.applyEffects('invocation:patronus-fortuna', [{ kind: 'flag', target: 'fortuna.nextRoll', amount: 1, duration: 600 }]);
    lucky.dialogue.start('marcus');
    expect(lucky.dialogue.choose(1)!.nodeId).toBe('yes');
    expect(lucky.sheet.hasFlag('fortuna.nextRoll')).toBe(false);
  });

  it('a failed approach is locked with that NPC for 24 game hours', () => {
    const { dialogue, game } = setup([cobbler], 0.99);
    dialogue.start('marcus');
    dialogue.choose(1);
    // Back to the hello node through the story loop.
    expect(dialogue.start('marcus')!.nodeId).toBe('again');
    dialogue.choose(0);
    dialogue.advance();
    const hello = dialogue.advance()!;
    expect(hello.nodeId).toBe('hello');
    expect(hello.choices.find((c) => c.text === 'Lower your prices.')).toMatchObject({ enabled: false, tag: 'Persuade — failed; try again tomorrow' });
    expect(dialogue.retryIn(cobbler.nodes.hello.choices![1].check!, 'marcus')).toBe(24);
    dialogue.end();
    game.time.advanceHours(24);
    expect(dialogue.retryIn(cobbler.nodes.hello.choices![1].check!, 'marcus')).toBe(0);
  });

  it('bribes pay and always pass; enabled() gates; flags reveal hidden choices', () => {
    const { dialogue, inventory } = setup([cobbler]);
    inventory.addDenarii(12);
    dialogue.flags.set('secret', true);
    const v = dialogue.start('marcus')!;
    expect(v.choices.find((c) => c.kind === 'bribe')!.enabled).toBe(true);
    expect(v.choices.map((c) => c.text)).toContain('Secret option');
    expect(dialogue.choose(2)!.nodeId).toBe('yes');
    expect(inventory.denarii).toBe(9);
    dialogue.end();
    const again = dialogue.start('marcus')!;
    expect(again.nodeId).toBe('again');
  });

  it('attack() ends the conversation and tells combat; openService emits', () => {
    const { dialogue, events } = setup([cobbler]);
    const log = record(events, ['dialogue:attack', 'dialogue:service', 'dialogue:ended']);
    dialogue.start('marcus');
    expect(dialogue.choose(4)).toBeNull();
    expect(dialogue.active).toBe(false);
    dialogue.context('marcus').openService('barter');
    expect(log.map((l) => l.type)).toEqual(['dialogue:attack', 'dialogue:ended', 'dialogue:service']);
  });

  it('notifies listeners with each view and null at the end', () => {
    const { dialogue } = setup([cobbler]);
    const seen: (string | null)[] = [];
    dialogue.onChange((v) => seen.push(v?.nodeId ?? null));
    dialogue.start('marcus');
    dialogue.choose(0);
    dialogue.advance();
    dialogue.end();
    expect(seen).toEqual(['hello', 'story', 'reply', null]);
  });

  it('survives broken content: throwing conditions/texts and unknown nodes', () => {
    const broken = defineDialogue({
      id: 'broken', npcs: ['marcus'], start: () => 'a',
      nodes: { a: { text: () => { throw new Error('x'); }, choices: [{ text: 'boom', if: () => { throw new Error('y'); } }, { text: 'nowhere', goto: 'missing' }] } },
    });
    const { dialogue } = setup([broken]);
    const v = dialogue.start('marcus')!;
    expect(v.text).toBe('…');
    expect(v.choices.map((c) => c.text)).toEqual(['nowhere']);
    expect(dialogue.choose(0)).toBeNull();
    expect(dialogue.active).toBe(false);
  });
});

const approaches = defineDialogue({
  id: 'approaches',
  npcs: ['senator', 'miles', 'cato', 'marcus'],
  start: () => 'a',
  nodes: {
    a: {
      text: 'Well?',
      choices: [
        { text: 'Persuade', check: { skill: 'rhetoric', difficulty: 40, pass: 'ok', fail: 'no' } },
        { text: 'Intimidate', check: { skill: 'rhetoric', difficulty: 40, kind: 'intimidate', pass: 'ok', fail: 'no' } },
        { text: 'Invoke my patron', check: { skill: 'rhetoric', difficulty: 40, kind: 'invoke-patron', pass: 'ok', fail: 'no' } },
        { text: 'Bribe', bribe: { dc: 20, goto: 'ok' } },
      ],
    },
    ok: { text: 'Very well.', end: true },
    no: { text: 'No.', end: true },
  },
});

describe('approaches and mods (GDD §14.5)', () => {
  const tags = (v: { choices: { tag?: string; enabled: boolean }[] }) => v.choices.map((c) => [c.tag, c.enabled]);

  it('Dignitas steps and dress count with elites; intimidation is impossible against them; officials take no bribes if incorruptible', () => {
    const { dialogue, game, sheet } = setup([approaches]);
    game.standing = new Standing(game.events);
    // Senator (Dignitas 4) vs a citizen (2): −10.
    expect(tags(dialogue.start('senator')!)).toEqual([
      ['Persuade 10%', true], // 10 − 10 vs 40
      ['Intimidate — impossible', false],
      ['Invoke patron — you have no patron', false],
      ['Bribe 50 d', false], // DC 20 × 0.5 × 5 (officials and elites)
    ]);
    dialogue.end();
    sheet.setSkill('rhetoric', 50);
    sheet.setFlagSource('equip:cloak', ['dress.toga']);
    expect(dialogue.start('senator')!.choices[0].tag).toBe('Persuade 60%'); // 50 − 10 (Dignitas) + 10 (toga) vs 40
    dialogue.end();
    expect(tags(dialogue.start('cato')!)[3]).toEqual(['Bribe — refused', false]);
  });

  it('formal dress follows sex (§3.7): a stola with a palla for a woman; a woman in a toga gets no bonus and −15 disposition (underworld +5)', () => {
    const { dialogue, sheet, game } = setup([approaches]);
    game.standing = new Standing(game.events);
    game.standing.sex = 'female';
    sheet.setSkill('rhetoric', 50);
    sheet.setFlagSource('equip:body', ['dress.stola']);
    expect(dialogue.start('senator')!.choices[0].tag).toBe('Persuade 50%'); // stola alone is not formal dress
    dialogue.end();
    sheet.setFlagSource('equip:cloak', ['dress.palla']);
    expect(dialogue.start('senator')!.choices[0].tag).toBe('Persuade 60%');
    dialogue.end();
    sheet.setFlagSource('equip:body', null);
    sheet.setFlagSource('equip:cloak', ['dress.toga']);
    expect(dialogue.disposition('senator')).toBe(-15);
    expect(dialogue.start('senator')!.choices[0].tag).toBe('Persuade 35%'); // 50 − 10 (Dignitas) − 15 vs 40
    dialogue.end();
    game.standing.sex = 'male';
    expect(dialogue.start('senator')!.choices[0].tag).toBe('Persuade 60%');
  });

  it('intimidation compares bands (§14.5): +10 per band above the target’s (yours = 1 + level/8), +10 armed and armored; it sours the NPC', () => {
    const { dialogue, sheet, inventory, game } = setup([approaches], 0.99);
    game.standing = new Standing(game.events);
    sheet.setSkill('rhetoric', 40);
    // A new character is band 1: against a band-2 soldier, −10.
    expect(dialogue.start('miles')!.choices[1].tag).toBe('Intimidate 40%');
    dialogue.end();
    sheet.addXp(3750); // level 16 → band 3
    expect(sheet.level).toBe(16);
    expect(dialogue.start('miles')!.choices[1].tag).toBe('Intimidate 60%');
    dialogue.end();
    inventory.add('gladius');
    inventory.equip('gladius');
    inventory.add('thorax-coriaceus');
    inventory.equip('thorax-coriaceus');
    expect(dialogue.start('miles')!.choices[1].tag).toBe('Intimidate 70%');
    dialogue.choose(1);
    expect(dialogue.disposition('miles')).toBe(-5);
    expect(dialogue.start('miles')!.choices[0].tag).toBe('Persuade 45%'); // disposition −5
    dialogue.end();
    sheet.setFlagSource('origin', ['trait-caesars-countryman']);
    expect(dialogue.disposition('miles')).toBe(5);
  });

  it('invoking a patron needs Clientela rank amicus-minor: +15, +15 more with the perk; bribes cost DC × 0.5 × status', () => {
    const { dialogue, sheet, game, inventory } = setup([approaches]);
    game.factions = new FactionSystem(undefined, game.events);
    game.factions.join('clientela');
    expect(dialogue.start('marcus')!.choices[2]).toMatchObject({ enabled: false, tag: 'Invoke patron — you have no patron' });
    dialogue.end();
    game.factions.grantRank('clientela', 'amicus-minor');
    expect(dialogue.start('marcus')!.choices[2].tag).toBe('Invoke patron 35%'); // 10 + 15 vs 40
    dialogue.end();
    sheet.grantPerk('perk-rhetoric-clientela');
    expect(dialogue.start('marcus')!.choices[2].tag).toBe('Invoke patron 50%');
    expect(dialogue.view!.choices[3]).toMatchObject({ tag: 'Bribe 10 d', enabled: false });
    dialogue.end();
    inventory.addDenarii(20);
    expect(dialogue.start('miles')!.choices[3]).toMatchObject({ tag: 'Bribe 20 d', enabled: true });
    expect(dialogue.choose(3)!.nodeId).toBe('ok');
    expect(inventory.denarii).toBe(0);
  });
});

describe('memory persistence', () => {
  it('saves per-NPC memory and once-choices', () => {
    const a = setup([cobbler]);
    a.dialogue.start('marcus');
    a.dialogue.choose(0);
    a.dialogue.end();
    const saved = JSON.parse(JSON.stringify(a.dialogue.serialize()));
    const b = setup([cobbler]);
    b.dialogue.restore(saved);
    expect(b.dialogue.memoryOf('marcus').met).toBe(true);
    expect(b.dialogue.start('marcus')!.nodeId).toBe('again');
    b.dialogue.choose(0);
    b.dialogue.advance();
    expect(b.dialogue.view!.choices.map((c) => c.text)).not.toContain('Tell me a story.');
  });
});
