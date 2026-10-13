/**
 * The city's doors: what lock each doorway the builders leave (`DoorSlot`) gets, and whose it is.
 *
 * - An insula's stair door stands open by day (the tenants come and go) and is shut on a simple
 *   lock from the second hour of the night until dawn. It belongs to the landlord.
 * - A house's front door is open for the morning's callers (the salutatio) and the household's
 *   business until late afternoon, then locked; richer houses have better locks.
 *
 * Pure (no Game): tests/doors.test.ts checks the policy.
 */
import type { DoorSlot } from '../../arch/fabric/types';
import type { LockTier } from '../../rpg/thievery';
import type { DoorDef } from './DoorSystem';
import { enterThroughDoor } from '../interiors/generic';

export function houseLockTier(wealth: number): LockTier {
  return wealth > 0.85 ? 'firma' : wealth > 0.7 ? 'difficilis' : 'mediocris';
}

/** The door system's def for a builder's doorway in block `blockId`. */
export function cityDoorDef(blockId: string, slot: DoorSlot): DoorDef {
  // Slot ids already carry the block's (lot ids start with it).
  const id = slot.id;
  if (slot.kind === 'domus') {
    const house: DoorDef = {
      id,
      label: 'House door',
      matrix: slot.matrix,
      width: slot.width,
      height: slot.height,
      leaves: slot.leaves,
      style: slot.studs ? 'studded' : 'plank',
      lock: { tier: houseLockTier(slot.wealth), openHours: [6, 17] },
      owner: { id: `domus:${id}`, name: 'the household' },
    };
    // Behind it: the atrium house (interiors/kits/domus.ts).
    house.leadsTo = (game) => enterThroughDoor(game, house, 'domus', { wealth: slot.wealth });
    return house;
  }
  const def: DoorDef = {
    id,
    label: 'Stair door',
    matrix: slot.matrix,
    width: slot.width,
    height: slot.height,
    leaves: slot.leaves,
    style: slot.studs ? 'studded' : 'plank',
    lock: { tier: 'simplex', openHours: [5, 21] },
    owner: { id: `insula:${blockId}`, name: 'the landlord' },
  };
  // Behind it: the stair and a flat (interiors/kits/insulaStair.ts).
  def.leadsTo = (game) => enterThroughDoor(game, def, 'insula-stair', { wealth: slot.wealth });
  return def;
}
