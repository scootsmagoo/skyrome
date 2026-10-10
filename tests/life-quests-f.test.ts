/**
 * Scripted runs of the first three phase-2 side quests (docs/design/world-life.md §4.8, QUESTS I;
 * acceptance F/G 1–3): Hilara, The Bronze Pot, The Bath Thief, from the offer to every ending, against
 * the real QuestSystem, the dialogue engine, the RPG services and the life module with the real data.
 * The player talks (choosing lines by their text), walks (into named places), fights (by events) and
 * waits (the clock). Also: the tracker stays on the main quest, and a hooked rumour or notice is told
 * until its quest starts and not after.
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import type { DialogueView } from '../src/dialogue/DialogueSystem';
import { installLife, type LifeService } from '../src/life/install';
import { LIFE } from '../src/life/registry';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  const logged = errors.mock.calls.map((c: unknown[]) => String(c[0]));
  vi.restoreAllMocks();
  // Handler errors are logged, not thrown: a quest that threw is a failed test.
  expect(logged.filter((m: string) => m.startsWith('[quests]') || m.startsWith('[dialogue]') || m.startsWith('[content]') || m.startsWith('[life]'))).toEqual([]);
});

const HILARA = 'misc-hilara';
const POT = 'misc-urna-aenea';
const BATH = 'misc-fur-balnearius';
const PRIMUS = 'keeper-tuscus-aerarius';
const FELIX = 'keeper-tuscus-aerarius-felix';
const CRISPINA = 'keeper-subura-receptatrix';

async function world(hour = 12) {
  const fg = fakeGame();
  const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
  rpg.quests.restore({});
  const game = fg.game as Game;
  game.time.advanceHours(hour - game.time.hour);
  const life = (await installLife(game)) as LifeService;
  // The background's own cloak is not the one in these tests (the baths take it, the quest returns it).
  const own = rpg.inventory.count('paenula');
  if (own) rpg.inventory.remove('paenula', own, { reason: 'dropped' });
  // The opening is over and the courier has been dealt with; the main quest runs and is tracked.
  rpg.quests.start('mq-01-madida-capena');
  rpg.quests.complete('mq-01-madida-capena');
  rpg.quests.start('mq-02-tabella');
  return { ...fg, game, rpg, life };
}
type World = Awaited<ReturnType<typeof world>>;

/** Talk to someone, picking the choice whose text contains each string (continuing through text-only nodes). */
function talk(w: World, npc: string, ...picks: string[]): DialogueView | null {
  let v = w.rpg.dialogue.start(npc);
  if (!v) throw new Error(`${npc} has nothing to say`);
  for (const p of picks) v = pick(w, p);
  return v;
}

function pick(w: World, p: string): DialogueView | null {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  if (!v) throw new Error(`no conversation open for "${p}"`);
  const i = v.choices.findIndex((c) => c.text.includes(p));
  if (i < 0) throw new Error(`${v.npcId}/${v.nodeId}: no choice "${p}" in ${JSON.stringify(v.choices.map((c) => c.text))}`);
  return w.rpg.dialogue.choose(i);
}

function close(w: World) {
  let v = w.rpg.dialogue.view;
  while (v && !v.choices.length && v.canContinue) v = w.rpg.dialogue.advance();
  w.rpg.dialogue.end();
}

const has = (w: World, npc: string, text: string) => {
  const v = w.rpg.dialogue.start(npc);
  const found = !!v?.choices.some((c) => c.text.includes(text));
  w.rpg.dialogue.end();
  return found;
};

const status = (w: World, id: string) => w.rpg.quests.status(id);
const lastJournal = (w: World, id: string) => w.rpg.quests.state(id)!.journal.at(-1)!.text;
const money = (w: World) => w.rpg.inventory.denarii;
const goTo = (w: World, id: string) => {
  const l = w.rpg.locations.get(id);
  if (!l) throw new Error(`no place ${id}`);
  (w.game.player!.position as Vector3).set(l.position.x, 0, l.position.z);
  w.step(20);
};
/** Advance the clock to the next time it is `hour` o'clock (fires 'time:hour' on the way). */
function waitUntil(w: World, hour: number) {
  const now = w.game.time.hour;
  w.game.time.advanceHours(((hour - now + 24) % 24) || 24);
}
/** May this rumour be told now? */
const told = (w: World, id: string) => (w.life as unknown as { mill: { allowed(r: unknown): boolean } }).mill.allowed(LIFE.rumours.find((r) => r.id === id)!);

describe('the data', () => {
  it('every quest has a hooked notice and a hooked rumour that stop once it has started', async () => {
    const w = await world();
    for (const [quest, ids] of [
      [HILARA, ['rum.quests-f.hilara-notice', 'rum.quests-f.hilara-talk']],
      [POT, ['rum.quests-f.pot-notice', 'rum.quests-f.pot-talk']],
      [BATH, ['rum.quests-f.bath-talk', 'rum.quests-f.bath-notice']],
    ] as const) {
      for (const id of ids) {
        expect(LIFE.rumours.find((r) => r.id === id)?.hook).toBe(quest);
        // mq-02 is running here, so the Bath Thief's (gated on its being done) is off until then.
        if (quest !== BATH) expect(told(w, id)).toBe(true);
      }
    }
    w.rpg.quests.complete('mq-02-tabella');
    for (const id of ['rum.quests-f.bath-talk', 'rum.quests-f.bath-notice']) expect(told(w, id)).toBe(true);
    for (const q of [HILARA, POT, BATH]) {
      w.rpg.quests.start(q);
    }
    for (const id of LIFE.rumours.filter((r) => r.hook && [HILARA, POT, BATH].includes(r.hook)).map((r) => r.id)) expect(told(w, id)).toBe(false);
  });

  it('before the opening is done no hook is told', async () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
    rpg.quests.restore({});
    const life = (await installLife(fg.game as Game)) as LifeService;
    const mill = (life as unknown as { mill: { allowed(r: unknown): boolean } }).mill;
    for (const r of LIFE.rumours.filter((x) => x.id.startsWith('rum.quests-f.') && x.hook)) expect(mill.allowed(r)).toBe(false);
  });

  it('the keepers stand at their posts and Crispina is a fence', async () => {
    const w = await world();
    for (const id of [PRIMUS, FELIX, CRISPINA]) expect(w.life.keeper(id)).toBeTruthy();
    expect(w.life.keeper(CRISPINA)?.shop?.vendor).toBe('receptator');
    expect(w.rpg.barter).toBeTruthy();
  });
});

describe('Hilara', () => {
  it('Tryphon offers it, Fuscus gives the lead, a sausage, and Tryphon pays', async () => {
    const w = await world(17);
    // Tryphon's life line starts it (the notice's "Note it down" and Cerdo's cry do the same).
    const svc = LIFE.services.find((s) => s.npc === 'npc-tryphon')!.services![0];
    expect(w.life.visible(svc)).toBe(true);
    expect(w.life.apply('npc-tryphon', svc).ok).toBe(true);
    expect(status(w, HILARA)?.running).toBe(true);
    expect(status(w, HILARA)?.stage).toBe('start');
    // The tracker stays on the main quest throughout.
    expect(w.rpg.quests.tracked).toBe('mq-02-tabella');
    expect(w.life.visible(svc)).toBe(false);

    // The lead from Fuscus.
    expect(has(w, 'npc-fuscus-carcerum', 'looking for a lost dog')).toBe(true);
    talk(w, 'npc-fuscus-carcerum', 'looking for a lost dog');
    close(w);
    expect(status(w, HILARA)?.stage).toBe('hunt');
    expect(lastJournal(w, HILARA)).toMatch(/at dusk/);

    // Tryphon won't take her yet.
    const v = w.rpg.dialogue.start('npc-tryphon');
    expect(v?.nodeId).not.toBe('returned');
    w.rpg.dialogue.end();

    // Hilara takes a sausage (the prompt on her emits this when the player has one).
    w.events.emit('content:interact', { id: 'hilara-sausage' });
    expect(status(w, HILARA)?.stage).toBe('follow');
    expect(w.rpg.quests.tracked).toBe('mq-02-tabella');

    const before = money(w);
    const plebs = w.rpg.factions.reputation('plebs');
    const v2 = w.rpg.dialogue.start('npc-tryphon')!;
    expect(v2.dialogueId).toBe('misc-hilara-tryphon');
    expect(v2.nodeId).toBe('returned');
    pick(w, 'She was in the yard');
    close(w);
    expect(status(w, HILARA)?.completed).toBe(true);
    expect(money(w)).toBeCloseTo(before + 5, 5);
    expect(w.rpg.factions.reputation('plebs')).toBe(plebs + 2);
    expect(w.rpg.quests.flags.get('hilara-returned')).toBe(true);
    expect(lastJournal(w, HILARA)).toMatch(/free/);
  });

  it('a notice starts it too, and it keeps on until the lead is found', async () => {
    const w = await world(10);
    w.rpg.quests.start(HILARA);
    expect(w.rpg.quests.tracked).toBe('mq-02-tabella');
    // Before the lead, the hunt can't begin: a sausage at nobody does nothing.
    w.events.emit('content:interact', { id: 'hilara-sausage' });
    expect(status(w, HILARA)?.stage).toBe('start');
  });

  it('the lead rumour is told only while the quest runs, in the Circus district', async () => {
    const w = await world();
    const lead = LIFE.rumours.find((r) => r.id === 'rum.quests-f.hilara-lead')!;
    expect(told(w, lead.id)).toBe(false);
    w.rpg.quests.start(HILARA);
    expect(told(w, lead.id)).toBe(true);
    expect(lead.districts).toEqual(['dist-circus-maximus']);
  });
});

describe('The Bronze Pot', () => {
  /** Offer through Primus's own talk, then through Felix's confession by way of the dice. */
  async function toFence(w: World) {
    expect(has(w, PRIMUS, 'That notice by your shop')).toBe(true);
    talk(w, PRIMUS, 'That notice by your shop', 'I’ll look into it');
    close(w);
    expect(status(w, POT)?.stage).toBe('start');
    expect(w.rpg.quests.tracked).toBe('mq-02-tabella');
    expect(has(w, PRIMUS, 'That notice by your shop')).toBe(false);
  }

  it('the dice table road, a purchase and a name', async () => {
    const w = await world(20);
    await toFence(w);
    // Felix lies; the dicers know better.
    expect(has(w, FELIX, 'The missing pot')).toBe(true);
    talk(w, 'npc-cnaeus-aleator', 'coppersmith’s apprentice');
    close(w);
    expect(w.rpg.dialogue.flags.get('felix-debt-known')).toBe(true);
    expect(w.rpg.quests.isObjectiveDone(POT, 'dice')).toBe(true);
    talk(w, FELIX, 'The missing pot', 'Thirty asses');
    close(w);
    expect(status(w, POT)?.stage).toBe('fence');
    expect(lastJournal(w, POT)).toMatch(/Crispina/);

    // Crispina wants ten denarii.
    w.rpg.inventory.addDenarii(30);
    const before = money(w);
    talk(w, CRISPINA, 'apprentice sold you a pot', 'Ten denarii. Here.');
    close(w);
    expect(money(w)).toBeCloseTo(before - 10, 5);
    expect(w.rpg.inventory.count('olla-aenea')).toBe(1);
    expect(status(w, POT)?.stage).toBe('return');
  });

  it('Primus pays 65 sesterces for the pot and 20 for the name', async () => {
    const w = await world(10);
    await toFence(w);
    talk(w, FELIX, 'The missing pot', 'You’ve been white');
    close(w);
    // The Rhetoric road: with a high skill the check passes (or the quest is still at the start, and the next test covers it).
    if (status(w, POT)?.stage === 'start') {
      w.rpg.sheet.setSkill('rhetoric', 99);
      w.game.time.advanceHours(24);
      talk(w, FELIX, 'The missing pot', 'You’ve been white');
      close(w);
    }
    expect(status(w, POT)?.stage).toBe('fence');
    w.rpg.inventory.addDenarii(20);
    talk(w, CRISPINA, 'apprentice sold you a pot', 'Ten denarii. Here.');
    close(w);
    expect(status(w, POT)?.stage).toBe('return');
    const before = money(w);
    const plebs = w.rpg.factions.reputation('plebs');
    talk(w, PRIMUS, 'I have your pot');
    expect(money(w)).toBeCloseTo(before + 65 / 4, 5);
    expect(status(w, POT)?.stage).toBe('thief');
    expect(w.rpg.inventory.count('olla-aenea')).toBe(0);
    pick(w, 'It was Felix');
    close(w);
    expect(status(w, POT)?.completed).toBe(true);
    expect(status(w, POT)?.stage).toBe('done-named');
    expect(money(w)).toBeCloseTo(before + 65 / 4 + 5, 5);
    expect(w.rpg.factions.reputation('plebs')).toBe(plebs + 3);
    expect(w.rpg.quests.flags.get('felix-named')).toBe(true);
    // Crispina stays: the fence still trades.
    expect(w.life.keeper(CRISPINA)).toBeTruthy();
  });

  it('the vigiles road returns the pot for a smaller reward, and Felix is covered when his debt is paid', async () => {
    const w = await world(22);
    await toFence(w);
    w.rpg.dialogue.flags.set('felix-debt-known', true);
    talk(w, FELIX, 'The missing pot', 'Thirty asses');
    close(w);
    expect(status(w, POT)?.stage).toBe('fence');
    talk(w, 'npc-optio-vigilum', 'stolen bronze pot');
    close(w);
    expect(w.rpg.inventory.count('olla-aenea')).toBe(1);
    expect(w.rpg.quests.flags.get('urna-road')).toBe('vigiles');
    // Cover for Felix at the table.
    const m0 = money(w);
    talk(w, 'npc-cnaeus-aleator', 'I’ll settle it');
    close(w);
    expect(money(w)).toBeCloseTo(m0 - 30 / 16, 5);
    expect(w.rpg.quests.flags.get('felix-debt-paid')).toBe(true);
    const m1 = money(w);
    talk(w, PRIMUS, 'I have your pot');
    expect(money(w)).toBeCloseTo(m1 + 40 / 4, 5);
    pick(w, 'I never found who took it');
    close(w);
    expect(status(w, POT)?.stage).toBe('done-cover-paid');
    expect(status(w, POT)?.completed).toBe(true);
    expect(lastJournal(w, POT)).toMatch(/thirty asses/);
  });

  it('frightening Crispina (Rhetoric 40) also gets the pot, and silence without paying is another ending', async () => {
    const w = await world(21);
    await toFence(w);
    w.rpg.dialogue.flags.set('felix-debt-known', true);
    talk(w, FELIX, 'The missing pot', 'Thirty asses');
    close(w);
    w.rpg.sheet.setSkill('rhetoric', 99);
    const view = w.rpg.dialogue.start(CRISPINA)!;
    expect(view.choices.some((c) => c.text.includes('apprentice sold you a pot'))).toBe(true);
    pick(w, 'apprentice sold you a pot');
    const v = w.rpg.dialogue.view!;
    expect(v.choices.some((c) => c.text.includes('make a lot of noise'))).toBe(true);
    pick(w, 'make a lot of noise');
    close(w);
    if (status(w, POT)?.stage === 'fence') {
      // The roll failed: refused. The other road is still open.
      w.rpg.inventory.addDenarii(10);
      w.game.time.advanceHours(24);
      talk(w, CRISPINA, 'apprentice sold you a pot', 'Ten denarii');
      close(w);
    }
    expect(status(w, POT)?.stage).toBe('return');
    talk(w, PRIMUS, 'I have your pot');
    pick(w, 'I never found who took it');
    close(w);
    expect(status(w, POT)?.stage).toBe('done-cover');
  });

  it('killing Primus fails it; killing Crispina at the fence hands the pot over', async () => {
    const w = await world(21);
    await toFence(w);
    w.events.emit('actor:killed', { victimId: PRIMUS, killerId: 'player' });
    expect(status(w, POT)?.failed).toBe(true);

    const w2 = await world(21);
    w2.rpg.quests.start(POT);
    w2.rpg.quests.setStage(POT, 'fence');
    w2.events.emit('actor:killed', { victimId: CRISPINA, killerId: 'player' });
    expect(w2.rpg.inventory.count('olla-aenea')).toBe(1);
    expect(status(w2, POT)?.stage).toBe('return');
  });
});

describe('The Bath Thief', () => {
  async function stolen(w: World, hour = 14.5) {
    // A cloak taken from the peg (the baths' option emits this); before mq-02 is done nothing starts.
    w.events.emit('life:option', { owner: 'keeper-example', option: 'bathe', detail: { stolen: 'paenula' } });
    expect(status(w, BATH)?.running).toBeFalsy();
    w.rpg.quests.complete('mq-02-tabella');
    w.rpg.quests.start('mq-03-lemuria');
    expect(w.rpg.quests.tracked).toBe('mq-03-lemuria');
    w.events.emit('life:option', { owner: 'keeper-example', option: 'bathe', detail: { stolen: 'paenula' } });
    expect(status(w, BATH)?.stage).toBe('start');
    expect(w.rpg.quests.tracked).toBe('mq-03-lemuria');
    // Sabinus shrugs; at the bathing hour the slave comes out; Crispina names the sender.
    talk(w, 'npc-sabinus-capsarius', 'Cloaks go missing');
    close(w);
    expect(status(w, BATH)?.stage).toBe('watch');
    waitUntil(w, hour);
    goTo(w, 'baths-titus:front');
    waitUntil(w, 15);
    expect(status(w, BATH)?.stage).toBe('follow');
    w.game.time.advanceHours(0);
    talk(w, CRISPINA, 'brought you a bundle');
    close(w);
    expect(status(w, BATH)?.stage).toBe('choose');
  }

  it('does not start on a theft before the opening nights are over', async () => {
    const w = await world(14);
    w.events.emit('life:option', { owner: 'keeper-example', option: 'bathe', detail: { stolen: 'paenula' } });
    expect(status(w, BATH)?.running).toBeFalsy();
    w.events.emit('life:option', { owner: 'keeper-example', option: 'bathe', detail: {} });
    expect(status(w, BATH)?.running).toBeFalsy();
  });

  it('(a) confront him: Rhetoric DC 40, the cloak and 5 den.', async () => {
    const w = await world(14);
    await stolen(w);
    w.rpg.sheet.setSkill('rhetoric', 99);
    const before = money(w);
    talk(w, 'npc-sabinus-capsarius', 'doorway off the Argiletum', 'Tell me, and I’ll hear you');
    close(w);
    if (status(w, BATH)?.stage === 'choose') {
      w.game.time.advanceHours(24);
      talk(w, 'npc-sabinus-capsarius', 'doorway off the Argiletum', 'Tell me, and I’ll hear you');
      close(w);
    }
    expect(status(w, BATH)?.stage).toBe('done-confront');
    expect(status(w, BATH)?.completed).toBe(true);
    expect(money(w)).toBeCloseTo(before + 5, 5);
    expect(w.rpg.inventory.count('paenula')).toBe(1);
    expect(w.rpg.quests.tracked).toBe('mq-03-lemuria');
  });

  it('(a) or a fistfight: yielding returns the cloak, a killing fails it', async () => {
    const w = await world(14);
    await stolen(w);
    talk(w, 'npc-sabinus-capsarius', 'doorway off the Argiletum', 'not by asking');
    close(w);
    expect(status(w, BATH)?.stage).toBe('fight');
    w.events.emit('actor:yielded', { actorId: 'npc-sabinus-capsarius', byId: 'player' });
    expect(status(w, BATH)?.stage).toBe('done-confront');
    expect(w.rpg.inventory.count('paenula')).toBe(1);

    const w2 = await world(14);
    await stolen(w2);
    talk(w2, 'npc-sabinus-capsarius', 'doorway off the Argiletum', 'not by asking');
    close(w2);
    w2.events.emit('actor:killed', { victimId: 'npc-sabinus-capsarius', killerId: 'player', tags: ['dead'] });
    expect(status(w2, BATH)?.failed).toBe(true);
  });

  it('(b) report him to the vigiles: the cloak and 8 den.', async () => {
    const w = await world(14);
    await stolen(w);
    const before = money(w);
    talk(w, 'npc-optio-vigilum', 'capsarius at the Baths of Titus');
    close(w);
    expect(status(w, BATH)?.stage).toBe('done-report');
    expect(money(w)).toBeCloseTo(before + 8, 5);
    expect(w.rpg.inventory.count('paenula')).toBe(1);
  });

  it('(c) the curse: a tablet from Onesimus, the libation pipe, three days, a fever, the cloak on its peg', async () => {
    const w = await world(14);
    await stolen(w);
    expect(w.rpg.inventory.count('paenula')).toBe(0);
    expect(told(w, 'rum.quests-f.bath-fever')).toBe(false);
    w.rpg.inventory.addDenarii(2);
    const before = money(w);
    talk(w, 'keeper-capena-plumbarius', 'curse tablet written');
    close(w);
    expect(money(w)).toBeCloseTo(before - 1, 5);
    expect(w.rpg.inventory.count('defixio-furtum')).toBe(1);
    w.events.emit('content:interact', { id: 'bath-libation' });
    expect(status(w, BATH)?.stage).toBe('curse');
    expect(w.rpg.inventory.count('defixio-furtum')).toBe(0);
    // Two days: nothing yet.
    w.game.time.advanceHours(48);
    expect(status(w, BATH)?.stage).toBe('curse');
    w.game.time.advanceHours(25);
    expect(status(w, BATH)?.stage).toBe('done-curse');
    expect(status(w, BATH)?.completed).toBe(true);
    expect(w.rpg.inventory.count('paenula')).toBe(1);
    expect(lastJournal(w, BATH)).toMatch(/Nobody said why/);
    // Nobody says why, but the fever is the talk of the Titus.
    expect(told(w, 'rum.quests-f.bath-fever')).toBe(true);
    const v = talk(w, 'npc-sabinus-capsarius', 'You look unwell')!;
    expect(v.text).toMatch(/fever/);
  });

  it('without a theft a notice still brings the quest, and the reward cloak is a spare', async () => {
    const w = await world(14);
    w.rpg.quests.complete('mq-02-tabella');
    w.rpg.quests.start(BATH);
    expect(status(w, BATH)?.stage).toBe('start');
    w.rpg.quests.setStage(BATH, 'choose');
    talk(w, 'npc-optio-vigilum', 'capsarius at the Baths of Titus');
    close(w);
    expect(status(w, BATH)?.stage).toBe('done-report');
    expect(w.rpg.inventory.count('paenula')).toBe(1);
  });
});
