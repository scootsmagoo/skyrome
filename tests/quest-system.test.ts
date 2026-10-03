import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import { QuestSystem } from '../src/quests/QuestSystem';
import { defineQuest, type QuestDef } from '../src/quests/types';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame, record } from './rpg-fakes';

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function rpgGame() {
  const fg = fakeGame();
  const rpg = installRpg(fg.game, { examples: true, storage: new MemoryStorage() });
  return { ...fg, rpg };
}

describe('example quest: The Scribe’s Letter (driven by events)', () => {
  it('is discovered from the content folder only with examples', () => {
    const { rpg } = rpgGame();
    expect(rpg.quests.get('ex-letter')?.title).toBe('The Scribe’s Letter');
    expect(rpg.items.get('ex-letter')?.questItem).toBe(true);
    expect(rpg.npcs.get('ex-scriba')?.name).toBe('Gaius Valerius Eutychus');
    expect(rpg.locations.get('ex-basilica')).toBeTruthy();
    const plain = installRpg(fakeGame().game, { storage: new MemoryStorage() });
    expect(plain.quests.get('ex-letter')).toBeUndefined();
    expect(plain.npcs.get('ex-scriba')).toBeUndefined();
  });

  it('runs start → objectives → stage change → completion with rewards', () => {
    const { rpg, game, events, step } = rpgGame();
    const { quests, dialogue, inventory, sheet, factions } = rpg;
    const log = record(events, ['quest:started', 'quest:stage', 'quest:completed']);
    expect(inventory.denarii).toBe(10);

    // Talk to Eutychus and accept: the 'accept' node triggers the quest.
    let v = dialogue.start('ex-scriba')!;
    expect(v.nodeId).toBe('greet');
    expect(v.speakerName).toBe('Gaius Valerius Eutychus');
    v = dialogue.choose(0)!;
    expect(v.nodeId).toBe('offer');
    v = dialogue.choose(0)!;
    expect(v.nodeId).toBe('accept');
    expect(v.willEnd).toBe(true);
    expect(dialogue.advance()).toBeNull();
    expect(quests.status('ex-letter')).toMatchObject({ running: true, stage: 'start', done: false });
    expect(quests.tracked).toBe('ex-letter');
    expect(inventory.count('ex-letter')).toBe(1);
    expect(quests.objectives('ex-letter').map((o) => o.id)).toEqual(['go', 'deliver']); // figs is hidden

    // Markers: location from the registry, NPC from a resolver registered by integration.
    quests.registerResolver('npc', (t) => (t.kind === 'npc' && t.id === 'ex-sextus' ? new Vector3(16, 0, -18) : null));
    const marks = quests.markers();
    expect(marks.map((m) => m.objectiveId)).toEqual(['go', 'deliver']);
    expect(marks[0].position.toArray()).toEqual([16, 0, -16]);

    // Walk into the Basilica: the location system fires 'location:entered'.
    (game.player.position as Vector3).set(16, 0, -14);
    step(20);
    expect(quests.isObjectiveDone('ex-letter', 'go')).toBe(true);
    expect(rpg.locations.isDiscovered('ex-basilica')).toBe(true);

    // Ask about errands → hidden optional objective revealed; figs counted as they arrive.
    v = dialogue.start('ex-scriba')!;
    expect(v.nodeId).toBe('waiting');
    dialogue.choose(0);
    dialogue.advance();
    expect(quests.objectives('ex-letter').find((o) => o.id === 'figs')).toMatchObject({ count: 0, needed: 3, optional: true });
    inventory.add('ficus', 2);
    expect(quests.objectives('ex-letter').find((o) => o.id === 'figs')!.count).toBe(2);
    inventory.add('ficus', 1);
    expect(quests.isObjectiveDone('ex-letter', 'figs')).toBe(true);

    // Sextus: bribe for gossip (once), then deliver → stage 'reply'.
    v = dialogue.start('ex-sextus')!;
    expect(v.nodeId).toBe('letter');
    expect(v.choices.map((c) => c.tag)).toEqual([undefined, 'Bribe 5 d']);
    v = dialogue.choose(1)!;
    expect(v.nodeId).toBe('gossip');
    expect(inventory.denarii).toBe(5);
    v = dialogue.advance()!;
    expect(v.nodeId).toBe('letter');
    expect(v.choices.length).toBe(1);
    dialogue.choose(0);
    expect(quests.status('ex-letter')!.stage).toBe('reply');
    expect(inventory.count('ex-letter')).toBe(0);
    expect(inventory.count('ex-reply')).toBe(1);
    expect(quests.markers().map((m) => m.objectiveId)).toEqual([]); // Eutychus has no resolver yet
    dialogue.end();

    // Back to Eutychus: figs first (bonus reward from a handler), then the reply → complete.
    v = dialogue.start('ex-scriba')!;
    expect(v.nodeId).toBe('return');
    expect(v.choices.map((c) => c.text)).toEqual(['Here is his reply.', 'Here are your figs.', 'Not yet.']);
    v = dialogue.choose(1)!;
    expect(v.nodeId).toBe('figsGiven');
    expect(inventory.denarii).toBe(7);
    v = dialogue.advance()!;
    expect(v.nodeId).toBe('hub');
    v = dialogue.choose(0)!;
    expect(v.nodeId).toBe('thanks');

    expect(quests.status('ex-letter')).toMatchObject({ running: false, done: true, completed: true, failed: false });
    expect(inventory.denarii).toBe(22);
    expect(inventory.count('ex-reply')).toBe(0);
    expect(sheet.skillXp('rhetoric')).toBeCloseTo(5);
    expect(factions.reputation('plebs')).toBe(7); // figs +2, the quest +5
    expect(quests.tracked).toBeNull();
    expect(log.map((l) => `${l.type}:${(l.e as { stage?: string }).stage ?? ''}`)).toEqual([
      'quest:started:',
      'quest:stage:start',
      'quest:stage:reply',
      'quest:stage:done',
      'quest:completed:',
    ]);
    const view = quests.list()[0];
    expect(view.status).toBe('completed');
    expect(view.journal.map((j) => j.stage)).toEqual(['start', 'reply', 'done']);
    // A finished quest no longer listens: Eutychus' later lines don't restart it.
    expect(dialogue.start('ex-scriba')!.nodeId).toBe('after');
  });

  it('fails when Sextus dies, and stays failed', () => {
    const { rpg, events } = rpgGame();
    rpg.quests.start('ex-letter');
    events.emit('actor:killed', { victimId: 'ex-sextus', killerId: 'player' });
    expect(rpg.quests.status('ex-letter')).toMatchObject({ failed: true, done: true, running: false });
    events.emit('dialogue:node', { npcId: 'ex-scriba', dialogueId: 'ex-scriba', nodeId: 'accept' });
    expect(rpg.quests.status('ex-letter')!.failed).toBe(true);
    expect(rpg.quests.list()[0].journal.at(-1)!.stage).toBe('sextusDead');
  });

  it('reading the letter breaks the seal and changes Sextus’s greeting', () => {
    const { rpg } = rpgGame();
    rpg.quests.start('ex-letter');
    rpg.inventory.use('ex-letter');
    expect(rpg.quests.flags.get('ex-letter-opened')).toBe(true);
    const v = rpg.dialogue.start('ex-sextus')!;
    expect(v.text).toContain('seal has been broken');
    // GDD §14.5: Rhetoric 10 against DC 35 → 0.50 + (10 − 35) / 100 = 25%.
    expect(v.choices[0]).toMatchObject({ kind: 'check', tag: 'Lie 25%' });
  });
});

describe('faction quest rewards (GDD §5.1, §9.1)', () => {
  it('reward.skillXp gives one level’s worth of XP; reward.rank promotes (or grants a named rank, waiting for skill gates)', () => {
    const { rpg } = rpgGame();
    rpg.quests.register(defineQuest({
      id: 'vig-01-hamae', title: 'Buckets', category: 'faction', faction: 'vigiles', summary: 'Join a bucket chain.',
      stages: { start: { journal: 'A fire in the Velabrum.' } },
      rewards: { skillXp: ['athletics', { id: 'brawling', levels: 2 }], rank: { faction: 'vigiles' } },
    }));
    rpg.quests.register(defineQuest({
      id: 'vig-04', title: 'The Landlord of Flames', category: 'faction', faction: 'vigiles', summary: '',
      stages: { start: { journal: 'Fires for profit.' } },
      rewards: { rank: { faction: 'vigiles', rank: 'optio' } },
    }));
    rpg.factions.join('vigiles');
    rpg.quests.start('vig-01-hamae');
    rpg.quests.complete('vig-01-hamae');
    expect(rpg.sheet.skillLevel('athletics')).toBe(11);
    expect(rpg.sheet.skillLevel('brawling')).toBe(12);
    expect(rpg.factions.rank('vigiles')!.id).toBe('sebaciarius');
    rpg.quests.start('vig-04');
    rpg.quests.complete('vig-04');
    expect(rpg.factions.rank('vigiles')!.id).toBe('sebaciarius'); // optio needs Athletics 30
    expect(rpg.factions.pendingRank('vigiles')!.id).toBe('optio');
    rpg.sheet.raiseSkill('athletics', 19); // skill:levelup → checkPromotions
    expect(rpg.factions.rank('vigiles')!.id).toBe('optio');
  });
});

// ---------------------------------------------------------------- engine unit tests

function questGame(defs: QuestDef[]) {
  const fg = fakeGame();
  const quests = new QuestSystem(fg.game as Game, { defs });
  return { ...fg, quests };
}

describe('QuestSystem', () => {
  const counting = defineQuest({
    id: 'rats',
    title: 'Rats in the Horrea',
    category: 'radiant',
    summary: 'Kill rats.',
    repeatable: true,
    stages: {
      start: { journal: 'The storekeeper wants rats dead.', objectives: [{ id: 'kill', text: 'Kill rats', count: 3 }, { id: 'tail', text: 'Bring a tail', optional: true }], next: 'report' },
      report: { journal: 'Enough rats are dead.', objectives: [{ id: 'talk', text: 'Report back' }] },
      paid: { journal: 'Paid.', end: 'complete' },
    },
    triggers: { 'location:entered': (q, e) => e.locationId === 'horrea' && q.start() },
    on: {
      'actor:killed': (q, e) => void (e.tags?.includes('rat') && q.progress('kill')),
      'dialogue:ended': (q) => q.stage === 'report' && q.setStage('paid'),
    },
    rewards: { denarii: 3 },
  });

  it('starts from a trigger, counts, auto-advances with `next` (ignoring optional objectives), completes', () => {
    const { quests, events } = questGame([counting]);
    const objLog = record(events, ['quest:objective']);
    events.emit('actor:killed', { victimId: 'r0', tags: ['rat'] }); // not started: ignored
    events.emit('location:entered', { locationId: 'horrea' });
    expect(quests.status('rats')!.running).toBe(true);
    for (let i = 0; i < 3; i++) events.emit('actor:killed', { victimId: `r${i}`, tags: ['rat'] });
    expect(quests.status('rats')!.stage).toBe('report');
    expect(objLog.map((l) => (l.e as { done: boolean }).done)).toEqual([false, false, true]);
    events.emit('dialogue:ended', { npcId: 'x', dialogueId: 'y' });
    expect(quests.status('rats')!.completed).toBe(true);
  });

  it('progress returns true only on the completing call and clamps', () => {
    const { quests } = questGame([counting]);
    quests.start('rats');
    expect(quests.progress('rats', 'kill', 2)).toBe(false);
    expect(quests.progress('rats', 'kill', 5)).toBe(true);
    expect(quests.progress('rats', 'kill')).toBe(false);
    expect(quests.progress('rats', 'nope')).toBe(false);
  });

  it('repeatable quests restart from their trigger after completion', () => {
    const { quests, events } = questGame([counting]);
    quests.start('rats');
    quests.complete('rats');
    events.emit('location:entered', { locationId: 'horrea' });
    expect(quests.status('rats')).toMatchObject({ running: true, stage: 'start' });
    expect(quests.objectives('rats')[0].count).toBe(0);
  });

  it('isolates handler errors and onEnter redirects', () => {
    const bad = defineQuest({
      id: 'bad', title: 'Bad', category: 'misc', summary: '',
      stages: { start: { journal: 'a', onEnter: (q) => q.setStage('b') }, b: { journal: 'b', onEnter: () => { throw new Error('boom'); } } },
      on: { 'time:hour': () => { throw new Error('handler boom'); } },
    });
    const { quests, events } = questGame([bad, counting]);
    quests.start('bad');
    expect(quests.status('bad')!.stage).toBe('b');
    expect(quests.list().find((q) => q.id === 'bad')!.journal.map((j) => j.text)).toEqual(['a', 'b']);
    quests.start('rats');
    events.emit('time:hour', { hour: 1, day: 0 });
    events.emit('actor:killed', { victimId: 'r', tags: ['rat'] });
    expect(quests.objectives('rats')[0].count).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('listenBeforeStart lets a quest count before it starts; autoStart runs on newGame', () => {
    const early = defineQuest({
      id: 'early', title: 'Early', category: 'misc', summary: '', listenBeforeStart: true,
      stages: { start: { journal: 's', objectives: [{ id: 'figs', text: 'Figs', count: 2 }] } },
      on: { 'item:added': (q, e) => void (e.itemId === 'ficus' && q.progress('figs', e.count)) },
    });
    const auto = defineQuest({ id: 'auto', title: 'Auto', category: 'main', summary: '', autoStart: true, stages: { start: { journal: 'go' } } });
    const { quests, events } = questGame([early, auto]);
    events.emit('item:added', { itemId: 'ficus', count: 1 });
    quests.start('early');
    expect(quests.objectives('early')[0].count).toBe(1);
    quests.newGame();
    expect(quests.status('auto')!.running).toBe(true);
    expect(quests.status('early')!.running).toBe(false);
    expect(quests.tracked).toBe('auto');
  });

  it('resolves point and location markers by default and allows a custom resolver', () => {
    const q = defineQuest({
      id: 'm', title: 'M', category: 'misc', summary: '',
      stages: { start: { journal: 's', objectives: [{ id: 'p', text: 'P', target: { kind: 'point', x: 1, y: 2, z: 3 } }, { id: 'l', text: 'L', target: { kind: 'location', id: 'forum' } }, { id: 'i', text: 'I', target: { kind: 'item', id: 'ring' } }] } },
    });
    const { quests, game } = questGame([q]);
    game.locations = { get: (id: string) => (id === 'forum' ? { id, name: 'Forum', position: { x: 5, z: 6 }, radius: 10 } : undefined) } as never;
    quests.start('m');
    expect(quests.markers().map((m) => m.position.toArray())).toEqual([[1, 2, 3], [5, 0, 6]]);
    quests.resolveTarget = (t) => (t.kind === 'item' ? new Vector3(9, 9, 9) : null);
    expect(quests.markers().map((m) => m.objectiveId)).toEqual(['i']);
  });

  it('save/load restores state and re-subscribes the right handlers', () => {
    const { quests, events } = questGame([counting]);
    quests.start('rats');
    quests.progress('rats', 'kill', 2);
    quests.flags.set('met_storekeeper', true);
    quests.context('rats').vars.bonus = 4;
    const saved = JSON.parse(JSON.stringify(quests.serialize()));

    const b = questGame([counting]);
    b.quests.restore(saved);
    expect(b.quests.status('rats')).toMatchObject({ running: true, stage: 'start' });
    expect(b.quests.objectives('rats')[0].count).toBe(2);
    expect(b.quests.flags.get('met_storekeeper')).toBe(true);
    expect(b.quests.context('rats').vars.bonus).toBe(4);
    expect(b.quests.tracked).toBe('rats');
    b.events.emit('actor:killed', { victimId: 'r', tags: ['rat'] });
    expect(b.quests.status('rats')!.stage).toBe('report');
    // The original keeps working independently.
    events.emit('actor:killed', { victimId: 'r', tags: ['rat'] });
    expect(quests.status('rats')!.stage).toBe('report');
  });

  it('keeps saved state of unknown quests and survives junk', () => {
    const { quests } = questGame([counting]);
    quests.restore({ states: { gone: { status: 'running', stage: 'x', objectives: {}, vars: {}, journal: [] }, rats: { status: 'running', stage: 'deleted-stage', objectives: { kill: { count: 'two' } }, vars: { a: {} }, journal: [null, { text: 'ok' }] } }, flags: 42, tracked: 'gone' });
    expect(quests.status('rats')!.stage).toBe('start');
    expect(quests.objectives('rats')[0]).toMatchObject({ count: 0 });
    expect(quests.list()[0].journal).toEqual([{ stage: '', text: 'ok', hours: 0 }]);
    expect(quests.tracked).toBeNull();
    expect(quests.serialize().states.gone).toBeTruthy();
    quests.restore(undefined);
    expect(quests.status('rats')!.running).toBe(false);
  });
});
