import { describe, expect, it } from 'vitest';
import { BOARD_FLAG, boardView, CELLS, CELLS_NEEDED, CLUES, type BoardState } from './board';

function state(items: string[] = [], flags: Record<string, number | string | boolean> = {}): BoardState {
  return { hasItem: (id) => items.includes(id), flag: (name) => flags[name] };
}

describe('the conspiracy board', () => {
  it('is closed until Pudens shows it', () => {
    expect(boardView(state())).toBeNull();
    expect(boardView(state([], { [BOARD_FLAG]: true }))).not.toBeNull();
  });

  it('has four cells of three hidden members each, all unknown at first', () => {
    const v = boardView(state([], { [BOARD_FLAG]: true }))!;
    expect(v.cells.map((c) => c.id)).toEqual(['purse', 'aurum', 'falx', 'toga']);
    for (const c of v.cells) {
      expect(c.members).toHaveLength(3);
      expect(c.members.every((m) => !m.unmasked && m.name === 'Unknown' && m.role === null)).toBe(true);
      expect(c.broken).toBe(false);
      expect(c.lead.length).toBeGreaterThan(10);
    }
    expect(v.broken).toBe(0);
    expect(v.needed).toBe(CELLS_NEEDED);
  });

  it('pins the clues the player carries under their cells (chapters 2–4)', () => {
    const items = ['quest-tabula-rasa', 'quest-drachma-parthica', 'quest-tessera-mucaporis', 'quest-sagitta-dacica'];
    const v = boardView(state(items, { [BOARD_FLAG]: true, 'bitus-fate': 'spared' }))!;
    const ids = (cell: string) => v.cells.find((c) => c.id === cell)!.clues.map((c) => c.id);
    expect(ids('purse')).toEqual(['tabula-rasa']);
    expect(ids('aurum')).toEqual(['drachma', 'pepper']);
    expect(ids('falx')).toEqual(['tessera', 'sagitta', 'bitus']);
    expect(ids('toga')).toEqual([]);
  });

  it('leaves out what the player lacks: a dead archer is not in the cells', () => {
    const v = boardView(state(['quest-tessera-mucaporis'], { [BOARD_FLAG]: true, 'bitus-fate': 'killed' }))!;
    expect(v.cells.find((c) => c.id === 'falx')!.clues.map((c) => c.id)).toEqual(['tessera']);
    expect(v.cells.find((c) => c.id === 'purse')!.clues).toEqual([]);
  });

  it('notes the leak, and the knife-man’s tablet once found', () => {
    expect(boardView(state([], { [BOARD_FLAG]: true }))!.notes.map((n) => n.id)).toEqual(['leak']);
    expect(boardView(state(['quest-tabula-sicarii'], { [BOARD_FLAG]: true }))!.notes.map((n) => n.id)).toEqual(['leak', 'tabula-sicarii']);
  });

  it('unmasks members by flag and counts a cell broken when all three are known (Act II)', () => {
    const flags: Record<string, boolean> = { [BOARD_FLAG]: true, 'board:mucapor': true };
    let v = boardView(state([], flags))!;
    const falx = () => v.cells.find((c) => c.id === 'falx')!;
    expect(falx().members[0]).toMatchObject({ unmasked: true, name: 'Mucapor', role: 'falx champion' });
    expect(falx().broken).toBe(false);
    flags['board:daizus'] = true;
    flags['board:tarbus'] = true;
    v = boardView(state([], flags))!;
    expect(falx().broken).toBe(true);
    expect(v.broken).toBe(1);
  });

  it('keeps member ids unique and every clue on a real cell', () => {
    const ids = CELLS.flatMap((c) => c.members.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    const cells = new Set(CELLS.map((c) => c.id));
    for (const c of CLUES) expect(c.cell === null || cells.has(c.cell)).toBe(true);
  });
});
