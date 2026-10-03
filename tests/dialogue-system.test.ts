import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueSystem } from '../src/dialogue/DialogueSystem';
import { defineDialogue, type DialogueDef } from '../src/dialogue/types';
import { NpcRegistry } from '../src/npc/registry';
import type { NpcDef } from '../src/npc/types';
import { ITEMS } from '../src/rpg/data/items';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
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
      ['Lower your prices.', true, 'Persuade 40%'],
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

  it('skill checks roll on the seeded RNG; success trains the skill; persuade.chance helps', () => {
    const fail = setup([cobbler], 0.99);
    fail.dialogue.start('marcus');
    const checks = record(fail.events, ['dialogue:check']);
    expect(fail.dialogue.choose(1)).toMatchObject({ nodeId: 'no' });
    expect(checks[0].e).toMatchObject({ skill: 'rhetoric', chance: 0.4, pass: false });
    expect(fail.sheet.skillXp('rhetoric')).toBe(0);

    const pass = setup([cobbler], 0.39);
    pass.dialogue.start('marcus');
    expect(pass.dialogue.choose(1)).toMatchObject({ nodeId: 'yes' });
    expect(pass.sheet.skillXp('rhetoric')).toBeGreaterThan(0);
    expect(pass.dialogue.flags.get('discount')).toBe(true);

    const charm = setup([cobbler], 0.99);
    charm.sheet.setSkill('rhetoric', 30);
    charm.dialogue.start('marcus');
    expect(charm.dialogue.view!.choices[1].tag).toBe('Persuade 100%');
    expect(charm.dialogue.choose(1)!.nodeId).toBe('yes');
    const wine = setup([cobbler]);
    wine.sheet.setModifierSource('wine', { 'persuade.chance': 0.2 });
    expect(wine.dialogue.start('marcus')!.choices[1].tag).toBe('Persuade 60%');
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
