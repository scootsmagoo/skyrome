import { describe, expect, it } from 'vitest';
import { CommandTable, fuzzyFind, parseLine, toggleArg } from '../src/dev/console/parse';

describe('console parsing', () => {
  it('reads Bethesda-style lines', () => {
    expect(parseLine('tgm')).toEqual({ name: 'tgm', args: [] });
    expect(parseLine('  player.AddItem gladius 3 ')).toEqual({ name: 'additem', args: ['gladius', '3'] });
    expect(parseLine('coc "porta capena"')).toEqual({ name: 'coc', args: ['porta capena'] });
    expect(parseLine('set gamehour to 20')).toEqual({ name: 'sethour', args: ['20'] });
    expect(parseLine('   ')).toBeNull();
  });

  it('finds commands by name or alias and completes them', () => {
    const run = () => {};
    const t = new CommandTable<null>().add({ name: 'tgm', help: 'god', run }, { name: 'tcl', help: 'noclip', run }, { name: 'coc', aliases: ['tp'], help: 'teleport', run });
    expect(t.get('TGM')?.name).toBe('tgm');
    expect(t.get('tp')?.name).toBe('coc');
    expect(t.complete('t')).toEqual(['tcl', 'tgm', 'tp']);
  });

  it('matches ids typed from memory', () => {
    const ids = ['ludus-magnus', 'forum-romanum', 'porta-capena', 'colosseum', 'colossus'];
    expect(fuzzyFind('colosseum', ids)).toBe('colosseum');
    expect(fuzzyFind('ludus', ids)).toBe('ludus-magnus');
    expect(fuzzyFind('porta capena', ids)).toBe('porta-capena');
    expect(fuzzyFind('capena', ids)).toBe('porta-capena');
    expect(fuzzyFind('Forum', ['forum-romanum'], (id) => (id === 'forum-romanum' ? 'Forum Romanum' : undefined))).toBe('forum-romanum');
    expect(fuzzyFind('atlantis', ids)).toBeNull();
  });

  it('reads on/off arguments or toggles', () => {
    expect(toggleArg(undefined, false)).toBe(true);
    expect(toggleArg(undefined, true)).toBe(false);
    expect(toggleArg('off', true)).toBe(false);
    expect(toggleArg('1', false)).toBe(true);
  });
});
