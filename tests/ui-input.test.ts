import { describe, expect, it } from 'vitest';
import { HeldPanKeys } from '../src/ui/map/view';
import { NavList, PointerGate, type NavItem } from '../src/ui/nav';
import { UI_MIN_REM, uiFontPx } from '../src/ui/settings';

// ------------------------------------------------------------------ list rows without a DOM

class FakeRow implements NavItem {
  private classes = new Set<string>();
  onpointermove: ((e: PointerEvent) => void) | null = null;
  onclick: ((e: PointerEvent) => void) | null = null;
  classList = {
    add: (c: string) => void this.classes.add(c),
    remove: (c: string) => void this.classes.delete(c),
    contains: (c: string) => this.classes.has(c),
  };
  hasAttribute() {
    return false;
  }
  scrollIntoView() {}
}

const rows = (n: number) => Array.from({ length: n }, () => new FakeRow());
const key = (code: string) => ({ code, repeat: false }) as KeyboardEvent;

/** What the browser does for a pointer at (x, y) over a row: the window listener, then the row. */
function pointerAt(gate: PointerGate, row: FakeRow, x: number, y: number) {
  gate.move(x, y);
  row.onpointermove?.({ clientX: x, clientY: y } as PointerEvent);
}

describe('pointer gate', () => {
  it('counts only real movement', () => {
    const g = new PointerGate();
    expect(g.move(10, 10)).toBe(false); // first event: where the cursor rests
    expect(g.move(10, 10)).toBe(false); // synthetic repeat at the same spot
    expect(g.moves).toBe(0);
    expect(g.move(11, 10)).toBe(true);
    expect(g.moves).toBe(1);
  });
});

describe('list hover vs keyboard', () => {
  it('ignores pointer events at a resting cursor after the rows are rebuilt', () => {
    const gate = new PointerGate();
    const list = new NavList<FakeRow>({}, gate);
    const a = rows(4);
    gate.move(500, 300); // cursor resting over the list
    list.set(a);
    list.handleKey(key('End'));
    expect(list.index).toBe(3);
    // Re-render (e.g. after buying): the browser fires pointer events at the same spot on row 1.
    const b = rows(4);
    list.set(b);
    pointerAt(gate, b[1], 500, 300);
    expect(list.index).toBe(3);
  });

  it('keyboard selection survives until the pointer really moves, then hover selects', () => {
    const gate = new PointerGate();
    const activated: number[] = [];
    const list = new NavList<FakeRow>({ onActivate: (i) => activated.push(i) }, gate);
    const r = rows(5);
    gate.move(200, 200);
    list.set(r);
    pointerAt(gate, r[2], 210, 200); // real move over row 2
    expect(list.index).toBe(2);
    list.handleKey(key('ArrowDown'));
    expect(list.index).toBe(3);
    pointerAt(gate, r[2], 210, 200); // same spot: not a move
    expect(list.index).toBe(3);
    list.handleKey(key('KeyE'));
    expect(activated).toEqual([3]);
    pointerAt(gate, r[2], 212, 201); // the player moves the mouse
    expect(list.index).toBe(2);
  });

  it('hoverSelects: false never selects on hover; clicks always act', () => {
    const gate = new PointerGate();
    const activated: number[] = [];
    const list = new NavList<FakeRow>({ hoverSelects: false, onActivate: (i) => activated.push(i) }, gate);
    const r = rows(3);
    gate.move(0, 0);
    list.set(r);
    pointerAt(gate, r[2], 50, 50);
    expect(list.index).toBe(0);
    r[1].onclick?.({} as PointerEvent);
    expect(list.index).toBe(1);
    expect(activated).toEqual([1]);
  });
});

// ------------------------------------------------------------------ map panning keys

describe('map pan keys', () => {
  it('a press followed by its release leaves nothing held', () => {
    const k = new HeldPanKeys();
    expect(k.down('ArrowRight')).toBe(true);
    expect(k.direction()).toEqual({ dx: -1, dy: 0 });
    k.up('ArrowRight');
    expect(k.size).toBe(0);
    expect(k.direction()).toEqual({ dx: 0, dy: 0 });
  });

  it('ignores other keys and clears everything on blur', () => {
    const k = new HeldPanKeys();
    expect(k.down('KeyF')).toBe(false);
    k.down('KeyW');
    k.down('KeyA');
    expect(k.direction()).toEqual({ dx: 1, dy: 1 });
    k.clear();
    expect(k.size).toBe(0);
  });
});

// ------------------------------------------------------------------ interface scale

describe('interface scale', () => {
  it('honors the setting when the window is big enough', () => {
    expect(uiFontPx(1, 1280, 720)).toBe(16);
    expect(uiFontPx(1.4, 1440, 900)).toBeCloseTo(22.4);
    expect(uiFontPx(1.4, 1920, 1080)).toBeCloseTo(22.4);
  });

  it('limits large sizes to what fits a small window', () => {
    const px = uiFontPx(1.4, 1280, 720);
    expect(px).toBeLessThan(22.4);
    expect(1280 / px).toBeGreaterThanOrEqual(UI_MIN_REM.w - 1e-6);
    expect(720 / px).toBeGreaterThanOrEqual(UI_MIN_REM.h - 1e-6);
    expect(px / 16).toBeGreaterThan(1.3);
  });

  it('clamps nonsense values', () => {
    expect(uiFontPx(0, 1920, 1080)).toBe(16);
    expect(uiFontPx(5, 4000, 3000)).toBeCloseTo(25.6);
    expect(uiFontPx(1, 320, 240)).toBe(11);
  });
});
