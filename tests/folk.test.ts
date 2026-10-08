import { describe, expect, it } from 'vitest';
import { makePersona, type PersonaInput } from '../src/content/folk/persona';
import { askText, groupOf, TOPICS, topicsFor } from '../src/content/folk/topics';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { fakeGame } from './rpg-fakes';

const ROLES = ['citizen', 'citizen-woman', 'senator', 'matron', 'client', 'porter', 'attendant', 'merchant', 'artisan', 'soldier', 'vigil', 'priest', 'vestal', 'idler', 'beggar', 'child', 'elder', 'foreigner', 'reveler', 'carter', 'farmer', 'traveller', 'gladiator', 'torchbearer'];
const day = { hour: 10, lemuria: false };
const lemuriaNight = { hour: 22, lemuria: true };

function people(n = 40): ReturnType<typeof makePersona>[] {
  const out = [];
  for (const role of ROLES) {
    for (let i = 0; i < n; i++) {
      const female = role === 'citizen-woman' || role === 'matron' || role === 'vestal' || (role !== 'senator' && i % 3 === 0);
      const input: PersonaInput = { id: `cit-${i}`, role, female, label: role === 'foreigner' ? ['Greek', 'Syrian', 'Egyptian'][i % 3] : undefined };
      out.push(makePersona(input));
    }
  }
  return out;
}

describe('folk personas', () => {
  it('names people the Roman way for their station in life', () => {
    for (const p of people(20)) {
      const words = p.name.split(' ').length;
      if (p.status === 'slave' || p.status === 'gladiator' || p.status === 'foreign' || p.status === 'child') expect(words, p.name).toBe(1);
      if ((p.status === 'citizen' || p.status === 'freed') && !p.female) expect(words, p.name).toBe(3);
      if (p.status === 'freed') expect(p.master, p.name).toBeTruthy();
      if (p.status === 'foreign') expect(p.origin, p.name).not.toMatch(/^here/);
      if (p.status === 'elite') expect(['senator', 'matron']).toContain(p.trade);
    }
    // A slave of the crowd's porters belongs to someone with three names.
    const slave = makePersona({ id: 'cit-3', role: 'porter', female: false });
    expect(slave.status).toBe('slave');
    expect(slave.master.split(' ').length).toBe(3);
  });

  it('is the same person every time (seeded by id), and different people differ', () => {
    const a = makePersona({ id: 'cit-9', role: 'citizen', female: false });
    expect(makePersona({ id: 'cit-9', role: 'citizen', female: false })).toEqual(a);
    const names = new Set(people(30).filter((p) => p.status === 'citizen').map((p) => p.name));
    expect(names.size).toBeGreaterThan(40);
  });

  it('a station keeps its trade: the baker is a baker', () => {
    const baker = makePersona({ id: 'cit-1', role: 'artisan', female: false, barks: 'pistor', label: 'Baker' });
    expect(baker.trade).toBe('pistor');
    expect(baker.tradeLabel).toBe('a baker');
  });
});

describe('folk topics', () => {
  it('every question and answer renders for every kind of person, day and Lemuria night', () => {
    for (const p of people(12)) {
      for (const t of [day, lemuriaNight]) {
        for (const topic of topicsFor(p, t)) {
          const ask = askText(topic, p);
          const ans = topic.answer(p, t);
          expect(ask.length, `${p.status}/${topic.id}`).toBeGreaterThan(3);
          expect(ans.length, `${p.status}/${topic.id}`).toBeGreaterThan(10);
          expect(ans, `${p.status}/${topic.id}`).not.toMatch(/undefined|\$\{|…$/);
        }
      }
    }
  });

  it('offers a varied handful: who and what always, then their own life and the city', () => {
    const sets = new Set<string>();
    for (const p of people(30)) {
      const ids = topicsFor(p, day).map((t) => t.id);
      expect(ids.slice(0, 2)).toEqual(['who', 'work']);
      if (p.status !== 'vestal') expect(ids.length).toBeGreaterThanOrEqual(5);
      sets.add(ids.join(','));
    }
    expect(sets.size).toBeGreaterThan(150);
  });

  it('asks each person what fits them', () => {
    for (const p of people(25)) {
      const ids = topicsFor(p, day).map((t) => t.id);
      if (groupOf(p) === 'child') expect(ids.some((i) => ['heir', 'christiani', 'prices', 'parthia', 'fire'].includes(i))).toBe(false);
      if (p.status !== 'slave') expect(ids.includes('freedom') || ids.includes('master')).toBe(false);
      if (p.status === 'vestal') expect(ids).toEqual(['who', 'work']);
    }
    // Slaves are asked about their own condition first.
    const slaves = people(30).filter((p) => p.status === 'slave');
    expect(slaves.every((p) => topicsFor(p, day).some((t) => t.id === 'freedom' || t.id === 'master'))).toBe(true);
    // On the Lemuria everyone (but the priests) has something to say about the night.
    expect(people(5).filter((p) => groupOf(p) !== 'religious').every((p) => topicsFor(p, lemuriaNight).some((t) => t.id === 'lemuria'))).toBe(true);
  });

  it('the same question gets different answers from a senator, a slave and a beggar', () => {
    const prices = TOPICS.find((t) => t.id === 'prices')!;
    const senator = makePersona({ id: 'a', role: 'senator', female: false });
    const porter = makePersona({ id: 'b', role: 'porter', female: false });
    const beggar = makePersona({ id: 'c', role: 'beggar', female: false });
    const answers = new Set([senator, porter, beggar].map((p) => prices.answer(p, day)));
    expect(answers.size).toBe(3);
  });
});

describe('talking to the crowd', () => {
  it('greets, offers their topics, answers in character, and doesn’t ask twice', () => {
    const fg = fakeGame();
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
    const v = rpg.dialogue.start('cit-42');
    expect(v).toBeTruthy();
    const asks = v!.choices.map((c) => c.text);
    expect(asks).toContain('Who are you?');
    expect(asks.length).toBeGreaterThanOrEqual(7); // their topics + news + directions + vale
    const after = rpg.dialogue.choose(asks.indexOf('Who are you?'))!;
    expect(after.text.length).toBeGreaterThan(10);
    let more = after;
    while (more && !more.choices.length && more.canContinue) more = rpg.dialogue.advance()!;
    expect(more.choices.map((c) => c.text)).not.toContain('Who are you?');
    rpg.dialogue.end();
    // A second visit: they remember you.
    const again = rpg.dialogue.start('cit-42')!;
    expect(again.text).not.toBe(v!.text);
    rpg.dialogue.end();
  });
});
