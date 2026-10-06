/**
 * The console's pure parts: splitting a typed line into a command and its arguments the way
 * Bethesda's console reads them (`player.additem gladius 1`, `set gamehour to 20`, `coc forum`),
 * the command table with aliases, and fuzzy matching of ids typed from memory.
 */

export interface ParsedLine {
  /** Lower-case command name, with a leading `player.` dropped (`player.additem` → `additem`). */
  name: string;
  args: string[];
}

/** Split a line into words; "double quotes" keep spaces together. Empty → null. */
export function parseLine(line: string): ParsedLine | null {
  const words: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.trim()))) words.push(m[1] ?? m[2]);
  if (!words.length) return null;
  let name = words[0].toLowerCase();
  if (name.startsWith('player.')) name = name.slice(7);
  let args = words.slice(1);
  // Bethesda's "set gamehour to 20" → sethour 20.
  if (name === 'set' && args[0]?.toLowerCase() === 'gamehour') {
    name = 'sethour';
    args = args.slice(1).filter((a) => a.toLowerCase() !== 'to');
  }
  return { name, args };
}

export interface CommandDef<Ctx> {
  name: string;
  aliases?: string[];
  /** Arguments, for help: `<item> [count]`. */
  usage?: string;
  help: string;
  run(args: string[], ctx: Ctx): string | string[] | void | Promise<string | string[] | void>;
}

export class CommandTable<Ctx> {
  private readonly byName = new Map<string, CommandDef<Ctx>>();
  readonly list: CommandDef<Ctx>[] = [];

  add(...defs: CommandDef<Ctx>[]) {
    for (const d of defs) {
      this.list.push(d);
      for (const n of [d.name, ...(d.aliases ?? [])]) this.byName.set(n.toLowerCase(), d);
    }
    return this;
  }

  get(name: string): CommandDef<Ctx> | undefined {
    return this.byName.get(name.toLowerCase());
  }

  /** Every name and alias that starts with `prefix` (Tab completion). */
  complete(prefix: string): string[] {
    const p = prefix.toLowerCase();
    return [...this.byName.keys()].filter((n) => n.startsWith(p)).sort();
  }
}

/**
 * The best match for something typed from memory among `ids` (with optional display names):
 * an exact id, then an id or name starting with it, then one containing it (ignoring case,
 * spaces, hyphens and underscores). Ties go to the shortest id. Null when nothing fits.
 */
export function fuzzyFind(typed: string, ids: readonly string[], names?: (id: string) => string | undefined): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-'’.]/g, '');
  const t = norm(typed);
  if (!t) return null;
  const exact = ids.find((id) => norm(id) === t);
  if (exact) return exact;
  const score = (id: string): number => {
    const a = norm(id);
    const b = norm(names?.(id) ?? '');
    if (a.startsWith(t) || (b && b.startsWith(t))) return 1;
    if (a.includes(t) || (b && b.includes(t))) return 2;
    return 9;
  };
  let best: string | null = null;
  let bestScore = 9;
  for (const id of ids) {
    const s = score(id);
    if (s < bestScore || (s === bestScore && best !== null && id.length < best.length)) {
      best = id;
      bestScore = s;
    }
  }
  return bestScore < 9 ? best : null;
}

/** "on"/"1"/"true" → true, "off"/"0"/"false" → false, anything else (or nothing) → toggle. */
export function toggleArg(arg: string | undefined, current: boolean): boolean {
  const a = arg?.toLowerCase();
  if (a === 'on' || a === '1' || a === 'true') return true;
  if (a === 'off' || a === '0' || a === 'false') return false;
  return !current;
}
