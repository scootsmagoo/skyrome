/**
 * Keeps the player's avatar dressed in what the inventory has equipped (GDD §8.2, AC-13): clothes,
 * armor, helmets and shoes are baked into the avatar mesh, so changing them rebuilds the avatar
 * (geometry is cached per look, so swapping back is cheap); weapons, shields and torches are
 * attachments and swap in place. A rebuild waits while the avatar is mid-action or in combat, so
 * a fight's animation state is never thrown away. Also feeds the camera pitch to the arms.
 */
import { createHumanoid, HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import type { Appearance } from '../actors/appearance';
import type { Game, System } from '../core/Game';
import type { EquipSlot, ItemDef } from '../rpg/types';
import { isTorch, meshKey, outfitAppearance, type LookPreset, type Worn } from './character';

declare module '../core/Events' {
  interface GameEvents {
    /** The player's avatar object was replaced (new clothes): re-read game.player.avatar. */
    'player:avatar': { avatar: unknown };
  }
}

const SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'under', 'padding', 'body', 'cloak', 'legs', 'shins', 'arm', 'head', 'feet', 'neck', 'finger', 'ammo'];

export class PlayerLook implements System {
  readonly name = 'playerLook';
  /** Before the ActorSystem (50) animates the avatar. */
  readonly priority = 40;
  private dirty = true;
  private key = '';
  private weapon = '';
  private shield = '';
  private torch = false;
  /** An outfit that replaces the inventory's (character creation shows the origin kit). */
  preview: Worn | null = null;
  private offs: (() => void)[] = [];

  constructor(
    private readonly game: Game,
    public look: LookPreset,
  ) {
    const ev = game.events;
    for (const e of ['item:equipped', 'item:unequipped', 'save:loaded'] as const) this.offs.push(ev.on(e, () => (this.dirty = true)));
  }

  /** Change the body preset (or the preview outfit) and redress now. */
  setLook(look: LookPreset, preview: Worn | null = this.preview) {
    this.look = look;
    this.preview = preview;
    this.dirty = true;
    this.apply(true);
  }

  /** Re-read the inventory on the next frame. */
  invalidate() {
    this.dirty = true;
  }

  /** What the player wears right now (the preview outfit, or the inventory's equipment). */
  worn(): Worn {
    if (this.preview) return this.preview;
    const inv = this.game.player?.inventory;
    const items = this.game.items;
    const out: Worn = {};
    if (!inv || !items) return out;
    for (const slot of SLOTS) {
      const id = inv.equipped(slot);
      const def = id ? items.get(id) : undefined;
      if (def) out[slot] = def;
    }
    return out;
  }

  appearance(): Appearance {
    return outfitAppearance(this.look, this.worn());
  }

  update() {
    const p = this.game.player;
    const av = p?.avatar as HumanoidAvatar | null | undefined;
    if (av instanceof HumanoidAvatar) av.setAimPitch(p.pitch);
    if (this.dirty) this.apply(false);
  }

  /** Dress the avatar; a mesh rebuild is deferred while busy unless `force`. */
  apply(force: boolean) {
    const p = this.game.player;
    if (!p) return;
    const worn = this.worn();
    const app = outfitAppearance(this.look, worn);
    const key = meshKey(app);
    let av = p.avatar as HumanoidAvatar | null;
    if (key !== this.key || !(av instanceof HumanoidAvatar)) {
      const busy = av instanceof HumanoidAvatar && (av.isBusy() || !!p.sheet?.vitals.inCombat);
      if (busy && !force) return; // keep dirty: try again next frame
      const first = p.viewMode === 'first';
      av = createHumanoid(app, { lod: 'high' });
      p.setAvatar(av);
      av.setFirstPerson(first);
      this.key = key;
      this.weapon = app.weapon ?? 'none';
      this.shield = app.shield?.model ?? 'none';
      this.torch = false;
      this.game.events.emit('player:avatar', { avatar: av });
    } else {
      if ((app.weapon ?? 'none') !== this.weapon) av.setWeapon((this.weapon = app.weapon ?? 'none'));
      const shield = app.shield?.model ?? 'none';
      if (shield !== this.shield) av.setShield((this.shield = shield), app.shield?.color, app.shield?.emblem);
    }
    const torch = isTorch(worn.offHand as ItemDef | undefined);
    if (torch !== this.torch) av.setTorch((this.torch = torch));
    this.dirty = false;
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
