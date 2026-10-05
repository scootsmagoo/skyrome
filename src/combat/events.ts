/**
 * Events emitted by the combat module (plus the shared 'actor:killed' / 'actor:yielded' declared in
 * src/quests/types.ts, 'ui:*' from the UI and 'sfx' from audio).
 */
declare module '../core/Events' {
  interface GameEvents {
    /** A blow landed (or was blocked or parried). */
    /** The player's swing reached its hit frame: `hits` people were struck (gore hacks at bodies on a miss). */
    'combat:swing': { attackerId: string; power: boolean; hits: number; reach: number };
    'combat:hit': {
      attackerId: string;
      targetId: string;
      damage: number;
      blocked: boolean;
      parried: boolean;
      kind: string;
      power: boolean;
      riposte: boolean;
      finisher: boolean;
      sneak: boolean;
      stagger: string;
      x: number;
      z: number;
    };
    /** A timed block landed. */
    'combat:parry': { defenderId: string; attackerId: string };
    /** The player entered or left combat (the §6 inCombat predicate). */
    'combat:started': {};
    'combat:ended': {};
    /** An NPC (or the player) was knocked out instead of killed (§6.9). */
    'combat:knockout': { actorId: string; byId?: string; seconds: number };
    /** An NPC fled at its threshold. */
    'combat:fled': { actorId: string };
    /** A combatant died: loot it (table id, worn items, weapon) — the hook for a body container. */
    'combat:death': { actorId: string; killerId?: string; loot?: string; worn: string[]; weapon?: string; shield?: string; x: number; y: number; z: number };
    /** Someone shouted for help (§6.13 call-help). */
    'combat:callHelp': { actorId: string; targetId: string; x: number; z: number; radius: number };
    /** The player attacked someone who wasn't hostile (assault: the crime module may react). */
    'combat:assault': { attackerId: string; victimId: string; lawfulVictim: boolean };
    /** A brawl turned into an assault (a blade drawn in a rixa, §6.9). */
    'combat:brawlEscalated': { by: string };
    /** A boss changed phase. */
    'combat:phase': { actorId: string; phase: number };
    /** The player lost: death, a knockout, or a refused missio. Game flow decides what happens. */
    'combat:playerDefeated': { outcome: 'death' | 'knocked-out' | 'saniarium' | 'saniarium-no-purse' | 'brawl-lost'; byId?: string; lusio: boolean; foes?: string[] };
    /** The player held Y to yield. `context` says what the yield means (§6.9). */
    'combat:playerYielded': { context: 'brawl' | 'arena' | 'arrest' | 'none'; spared?: boolean; outcome?: string };
    /** Arena bout lifecycle and crowd favor (§6.10). */
    'combat:bout': { phase: 'start' | 'end'; lusio: boolean; winner?: 'player' | 'foe' | 'draw'; favor: number; purse?: number };
    'combat:favor': { favor: number; delta: number; reason: string };
    /** Lock-on target changed (null: released). */
    'combat:lock': { targetId: string | null };
    /**
     * The Aesculapian rescue (§6.12: Tiro, or no save to load): the player woke at the Temple of
     * Aesculapius (`place`, null when the landmark isn't built: on the spot) for `fee` denarii.
     */
    'combat:rescued': { fee: number; place: string | null };
    /** The player chose what to do with a yielded foe. */
    'combat:yieldChoice': { actorId: string; choice: 'spare' | 'rob' | 'arrest' | 'kill'; purse?: number };
    /**
     * The missio of an arena bout was decided in combat's own prompt or with the sword (`spared`
     * true = "Mitte!"). Declared identically by quest content (src/content/director.ts), which
     * listens for it in lud-01.
     */
    'content:missio': { spared: boolean };
  }
}

export {};
