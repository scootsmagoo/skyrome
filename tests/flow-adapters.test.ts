import { describe, expect, it } from 'vitest';
import type { DialogueView as EngineView } from '../src/dialogue/DialogueSystem';
import type { QuestView as EngineQuest } from '../src/quests/QuestSystem';
import { dialogueTagFrom, dialogueViewFrom, notifyKindFor, questLogFrom, questViewFrom, saveSlotFrom, saveSlotsFrom } from '../src/game/adapters';

const quest = (over: Partial<EngineQuest> = {}): EngineQuest => ({
  id: 'mq-01-madida-capena',
  title: 'The Dripping Gate',
  latin: 'Madida Capena',
  category: 'main',
  summary: 'A courier is knifed beside you.',
  giver: 'npc-festus',
  status: 'running',
  stage: 'fight',
  tracked: true,
  journal: [{ stage: 'start', text: 'I arrived with the last cart.', hours: 4.5 }],
  objectives: [
    { id: 'old', text: 'Old, unfinished', count: 0, needed: 1, done: false, optional: false, active: false },
    { id: 'fight', text: 'Fight off the grassatores', count: 1, needed: 2, done: false, optional: false, active: true, target: { kind: 'npc', id: 'grassator-1' } },
    { id: 'take', text: 'Take the tablet', count: 1, needed: 1, done: true, optional: true, active: false },
  ],
  ...over,
});

describe('quest log adapter', () => {
  it('maps a running quest for the journal and compass', () => {
    const v = questViewFrom(quest(), (id) => (id === 'npc-festus' ? 'Gaius Marius Festus' : undefined));
    expect(v.state).toBe('active');
    expect(v.giver).toBe('Gaius Marius Festus');
    expect(v.entries).toEqual(['I arrived with the last cart.']);
    // Inactive, unfinished objectives of earlier stages are hidden; finished ones stay.
    expect(v.objectives.map((o) => o.id)).toEqual(['fight', 'take']);
    expect(v.objectives[0]).toMatchObject({ count: 2, progress: 1, target: { kind: 'npc', id: 'grassator-1' } });
    expect(v.objectives[1]).toMatchObject({ done: true, optional: true, count: undefined });
  });

  it('tracks and untracks through the quest system', () => {
    const calls: (string | null)[] = [];
    const log = questLogFrom({ list: () => [quest({ status: 'completed', tracked: false })], track: (id) => calls.push(id) });
    expect(log.quests()[0].state).toBe('completed');
    log.setTracked('mq-01-madida-capena', true);
    log.setTracked('mq-01-madida-capena', false);
    expect(calls).toEqual(['mq-01-madida-capena', null]);
    expect(log.notes()).toEqual([]);
  });
});

describe('save slots adapter', () => {
  const meta = { slot: 'quick', kind: 'quick' as const, name: 'Annia Severa', savedAt: '2026-10-03T12:00:00.000Z', gameDate: 'a.d. V Id. Mai.', location: 'Porta Capena', level: 2, playTime: 300, version: 2 };

  it('maps save metadata to the save screen', () => {
    const s = saveSlotFrom(meta);
    expect(s).toMatchObject({ id: 'quick', name: 'Annia Severa', level: 2, location: 'Porta Capena', playTime: 300, kind: 'quick' });
    expect(s.savedAt).toBe(Date.parse(meta.savedAt));
    expect(saveSlotFrom({ ...meta, name: undefined, kind: 'auto', level: undefined, location: undefined }).name).toBe('Autosave');
  });

  it('routes save, load and delete', async () => {
    const log: string[] = [];
    const view = saveSlotsFrom(
      { list: async () => [meta], delete: async (s) => void log.push(`del ${s}`) },
      { save: (s) => void log.push(`save ${s ?? 'new'}`), load: (s) => void log.push(`load ${s}`) },
    );
    expect((await view.list())[0].id).toBe('quick');
    await view.save();
    await view.load('quick');
    await view.remove('quick');
    expect(log).toEqual(['save new', 'load quick', 'del quick']);
  });
});

describe('dialogue adapter', () => {
  it('turns engine tags into UI tags with odds', () => {
    expect(dialogueTagFrom('Persuade 64%', 'check')).toEqual({ kind: 'skill', label: 'Persuade 64%', chance: 0.64 });
    expect(dialogueTagFrom('Intimidate 30%', 'check')?.kind).toBe('intimidate');
    expect(dialogueTagFrom('Bribe 5 d.', 'bribe')).toEqual({ kind: 'bribe', label: 'Bribe 5 d.' });
    expect(dialogueTagFrom(undefined, 'normal')).toBeUndefined();
  });

  it('follows the engine session and closes when it ends', () => {
    let view: EngineView | null = { npcId: 'ex-scriba', dialogueId: 'd', nodeId: 'n', speaker: 'npc', speakerName: 'Eutychus', text: 'Salve.', choices: [{ text: 'Ask for work', enabled: true, kind: 'normal' }, { text: 'Persuade', enabled: false, tag: 'Persuade 40%', kind: 'check' }], canContinue: false, willEnd: false };
    const listeners = new Set<(v: EngineView | null) => void>();
    const chosen: number[] = [];
    const src = {
      get view() {
        return view;
      },
      get active() {
        return !!view;
      },
      choose: (i: number) => chosen.push(i),
      advance: () => {},
      end: () => {
        view = null;
        listeners.forEach((f) => f(null));
      },
      onChange: (fn: (v: EngineView | null) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    const v = dialogueViewFrom(src, { name: () => 'Eutychus the scribe', title: () => 'Scriba' });
    let changes = 0;
    v.onChange(() => changes++);
    expect(v.npcName).toBe('Eutychus the scribe');
    expect(v.npcTitle).toBe('Scriba');
    expect(v.line).toEqual({ speaker: 'npc', text: 'Salve.' });
    expect(v.choices[1]).toMatchObject({ disabled: true, tag: { kind: 'skill', chance: 0.4 } });
    v.choose(0);
    expect(chosen).toEqual([0]);
    expect(v.ended).toBe(false);
    v.end();
    expect(v.ended).toBe(true);
    expect(changes).toBe(1);
    expect(v.choices).toEqual([]);
  });
});

describe('notification bridge', () => {
  it('skips what the HUD already announces with banners', () => {
    expect(notifyKindFor('Discovered: Porta Capena', 'location')).toBeNull();
    expect(notifyKindFor('Quest started: The Dripping Gate', 'quest')).toBeNull();
    expect(notifyKindFor('Blades increased to 21', 'skill')).toBeNull();
    expect(notifyKindFor('The tablet is sealed with wax.', 'quest')).toBe('quest');
    expect(notifyKindFor('Crime witnessed: furtum (bounty 12 den.)', 'crime')).toBe('warning');
    expect(notifyKindFor('Quicksaved', 'save')).toBe('info');
    expect(notifyKindFor('+5 Pietas', 'effect')).toBe('info');
  });
});
