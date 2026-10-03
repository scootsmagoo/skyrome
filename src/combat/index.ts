/**
 * Combat module entry point (docs/modules/combat.md).
 *
 *   import { installCombat } from '../combat';
 *   const combat = installCombat(game, { hudRoot: ui });      // game.combat
 *   const thug = combat.spawnEnemy('grassator', pos, { engage: true });
 */
export { installCombat, CombatSystem, type InstallCombatOptions, type RegisterOptions, type SpawnOptions } from './CombatSystem';
export { CombatCore, nullEnv, PRACTICE_DAGGER, type CombatEnv, type Projectile } from './CombatCore';
export { Combatant, type CombatBody, type CombatView, type CombatantInit } from './Combatant';
export { ArenaBout, type BoutOptions } from './ArenaBout';
export { ENEMIES, ENEMY_IDS, enemySpec, nereusProfile, type EnemySpec, type EnemyOptions } from './archetypes';
export { TIMING, attackPhases } from './timing';
export { combatSettings, type CombatSettings } from './settings';
export { GuardInput } from './guardInput';
