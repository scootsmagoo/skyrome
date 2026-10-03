# Avatar module: procedural humanoids and code-authored animation

Everything a person in Skyrome looks like and how they move is generated in code: the body,
face, hair, garments, armor, helmets, weapons and shields, and every animation clip. There are no
model files. One character is **one `SkinnedMesh` with one shared material**, so a crowd of a
hundred costs roughly one draw call per person (plus one per carried weapon or shield, and the
shadow pass).

- Code: `src/actors/avatar/**`, `src/actors/equipment/**`
- Test bed: `?scene=avatars` (`src/scenes/avatars.ts`)
- Tests: `tests/avatar.test.ts`

## Quick start

```ts
import { createHumanoid } from '../actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../actors/avatar/variants';
import { Actor } from '../actors/Actor';

const app = randomAppearance(game.rng.fork('npc-42'), 'legionary');
const avatar = createHumanoid(app, { lod: 'auto' });
const actor = new Actor(game, { id: 'npc-42', position, avatar });
game.actors.add(actor);

// Combat (CombatAvatar contract in src/actors/Actor.ts):
avatar.play('drawWeapon');
avatar.setDrawn(true);            // stance follows the equipment: gladius + scutum → 'oneHandShield'
avatar.play('attackLight1', { onHit: () => resolveHit(), onEnd: (interrupted) => {} });
avatar.setBlocking(true);
avatar.setCharge(0.7);            // hold a power-attack wind-up; then play('attackPower')
avatar.setDead(true);             // falls (or snaps) into a death pose and stays down

// NPC schedules:
avatar.setIdleLoop('sit');        // 'stand' | 'sit' | 'sitGround' | 'lean' | 'work' | 'sweep' | 'talk' | 'pray' | 'sleep' | 'cheer' | 'guard' | 'drunk'
avatar.lookAt(otherHead);         // head/neck track a world point (dialogue)
```

For the player, pass the avatar to `setupPlayer(game, pos, heading, avatar)`. First person works
through the existing `Player.setViewMode` → `setFirstPerson`. Each frame, also call
`avatar.setAimPitch(player.pitch)` (the combat or player module should own this) so the weapon arms
follow the camera when you look up or down.

## Public API

### `createHumanoid(app: Appearance, opts?)` → `HumanoidAvatar`

| Option | Meaning |
| --- | --- |
| `lod: 'high' \| 'low' \| 'auto'` | `high` (default) ~4–5k triangles for civilians and ~5–6k for armored soldiers. `low` ~1.0–1.3k for civilians and ~1.5k for soldiers (mitten hands, no ears or lids). `auto` builds both and switches beyond 35 m. |
| `castShadow` | Default true. |
| `weapon`, `shield` | Override the appearance's visual defaults. |

`HumanoidAvatar` implements `CombatAvatar`. Beyond the contract it adds:

| Member | Purpose |
| --- | --- |
| `eyeHeight` | From the actual eye position of the generated head (≈ 0.93 × height). The camera rig reads it. |
| `setAimPitch(rad)` | Camera pitch. In first person (weapon drawn, or a torch) and while holding a bow draw, the spine and chest follow it. |
| `setWeapon(model)`, `setShield(model, color?, emblem?)` | Swap equipment. The stance updates automatically. |
| `setTorch(on)` | A lit torch with a flickering additive flame in the off hand, with an arm pose that keeps the flame clear of the head. |
| `getSocket(name)` | Contract sockets: `handR`, `handL`, `head`, `chest`, `hips`, `back`. Extras: `gripR`, `gripL`, `shieldL`, `sheathR`, `sheathL`, `backShield`, `backWeapon`. |
| `getAnimationClip(name)` | A standard `THREE.AnimationClip` (one `QuaternionKeyframeTrack` per bone plus `hips.position`) for an action, `idle`, a gait (`walk:0`…`walk:7`, `run:n`, `sneak:n`, `sprint:0`), or `loop:<IdleLoop>`. |
| `bones`, `skeleton`, `rig`, `anim`, `equipment` | Internals, for tools and debugging. |

### `randomAppearance(rng, role)` (`variants.ts`)

Roles (`AVATAR_ROLES`): `plebeian-man`, `plebeian-woman`, `patrician-man`, `matron`, `slave`,
`freedman`, `child`, `elderly`, `merchant`, `priest`, `vestal`, `legionary`, `praetorian`,
`urban-cohort`, `vigil`, `murmillo`, `thraex`, `retiarius`, `secutor`, `hoplomachus`, `provocator`,
`dacian`, `germanic`, `egyptian`, `syrian`, `greek`.

The palettes follow `docs/research/society.md`:

- Commoners wear undyed or cheaply dyed wool.
- The wealthy wear brighter dyes; togas are natural white; purple appears only as elite trim.
- Elite men are clean-shaven. Beards go to philosophers, Greeks and "barbarians".
- Skin tones span the Mediterranean, North Africa, the East and the North.
- Soldiers and gladiators are equipped per §9–10: segmentata or mail with Imperial-Gallic or Italic
  helmets; the Guard in Attic helmets with oval scuta; murmillo, thraex, retiarius (net, trident,
  galerus), secutor, hoplomachus and provocator (cardiophylax).

The output is deterministic for a given RNG state.

### Animation LOD (`lod.ts`)

`avatarLod.viewer = game.camera` once (the scene or game sets it). Within 40 m avatars animate every
frame. They update at 30 Hz to 80 m, 15 Hz to 150 m and 8 Hz beyond, accumulating the skipped
time. Each avatar gets a random phase offset, so the reduced-rate updates spread across frames.

## How it works

**Skeleton (`rig.ts`).** 25 bones: hips → spine → chest → neck → head; chest → shoulder → upperArm →
forearm → hand → fingers and index (L/R); hips → thigh → shin → foot → toe (L/R). Names are camelCase
(`upperArmL`) because three's `PropertyBinding` treats dots as separators. The bind pose has
identity rotations with the arms hanging, so all limb tubes are vertical. Proportions come from
height, sex, build and age, with slightly large heads for legibility.

**Mesh (`build/*`, `SkinBuilder.ts`).** The torso, limbs and head are lofted cross-sections. Joints
blend weights over a few centimeters, so elbows, knees, shoulders and hips bend without cracking.
Only the outermost layer is built: garments recolor and inflate the body surface. Geometry that
stands away from the body is extra: skirts (weighted hips → thighs, so legs move under them),
belts, the toga's balteus, sinus and lacinia, capes, armor plates and helmets.

Each vertex carries `surf = [roughness, metalness, pattern, emissive]`. The shared material
(`material.ts`) turns the pattern id into procedural micro-detail in the bind-pose space, fading with
distance: mail rings, scales, wool, linen, hair strands, leather and plate. Metal looks best with
`scene.environment` set.

**Clips (`anim/*`).**

- Poses are written as semantic joint angles (`pose.ts`): flex, abduct, twist and so on, with joint
  limits and automatic left/right mirroring.
- Key poses are baked through monotone cubic splines (`spline.ts`, which never overshoots a key) at
  30–40 fps into quaternion arrays (`clip.ts`).
- Feet in authored clips are IK targets solved every baked frame (`ik.ts`), so planted feet stay put.
- Locomotion (`gait.ts`) comes from foot trajectories rather than joint curves. The stance foot's
  contact point (heel → flat → ball) moves back at exactly the body speed, the pelvis height
  follows leg reach, and pelvis yaw and roll, counter-rotating shoulders and arm swing are layered
  on top. There are 8 directions each for walk, run and sneak, plus sprint and turn-in-place.
- Phase 0 is always left-foot contact, so every cycle can blend with every other.

**Controller (`anim/controller.ts`).** Layers are evaluated every update:

1. Stance idle.
2. Locomotion at a phase-synced rate matched to speed.
3. Weapon arms while moving.
4. Air and landing.
5. Idle loop.
6. Block and charge.
7. Actions with crossfades: `auto` actions are full-body when standing and upper-body while moving.
8. Procedural: elderly stoop, banking, aim pitch, the first-person lift, head look-at.

`onHit` fires at the impact time and `onEnd(interrupted)` fires on completion or replacement.
`attackPower` picks a directional variant from the movement at play time, as in the GDD: forward =
lunge, sideways = sweep, back = step-back cut, standing = overhead. `drawWeapon` and `sheathWeapon`
pick the variant for where the weapon lives (`hipR`, `hipL`, `back`, `fists`), and the weapon
changes hands at the grab frame. Deaths drop the weapon and shield beside the body. A yielding
gladiator drops his shield and raises a finger (*ad digitum*).

**First person.** The head bone collapses (scale 0.001), hiding the head, hair and helmet while the
body stays visible when you look down. With a weapon drawn, the arms blend to view poses
(`FP_ARMS` in `poses.ts`): the weapon low right with the blade angled into view, and a shield low
left so only its edge shows (as in the GDD). Attacks keep their third-person choreography with a
small lift so the swing crosses the screen. Blocking with a scutum raises it into view.

## Placement conventions for idle loops

Positions are relative to the actor position (the avatar root):

| Loop | Placement |
| --- | --- |
| `sit` | Seat surface 0.45 m high; pelvis about 0.3 m behind the root (put the actor ~0.35 m in front of the seat's center line). |
| `sitGround` | Cross-legged on the ground at the root. |
| `lean` | Back against a wall about 0.25 m behind the root. |
| `sleep` | On the back, pelvis at the root, head toward −Z (behind). Raise the actor to the bed height. |
| `work` | Hammering a block about 0.5 m in front, about 0.75 m high. |
| `guard` | At attention; a carried spear stands upright in the right hand. |

## Performance (M4 Max, Chrome, `?scene=avatars&crowd=100`)

121 animated humanoids (100 wandering citizens, the 20-figure lineup and the player) run at
60 fps (vsync-capped) with about 350 draw calls including shadows and about 1.4M triangles
including the shadow pass. CPU time is about 4.5 ms per frame for everything (physics for 121
kinematic capsules, animation, rendering); animation alone is about 0.95 ms per frame. Geometry is
cached per appearance, so identically kitted soldiers share one buffer.

## Scene URL parameters (`?scene=avatars`)

| Parameter | Effect |
| --- | --- |
| `&clip=<ActionClip\|IdleLoop>` | Every lineup figure plays it on repeat. |
| `&freeze=<s>` | Hold that clip at a time (for screenshots). |
| `&role=<role>` | Every lineup slot uses this role. |
| `&crowd=<n>` | Spawn n wanderers. |
| `&player=<role>`, `&pweapon=<model>`, `&pshield=<model\|none>` | The player's look. |
| `&drawn=1` | The lineup starts with weapons drawn. |
| `&lod=low\|auto` | Lineup mesh detail. |
| `&labels=0` | Hide name labels. |
| `&seed=<n>` | Variation seed. |

Player keys in the test bed: WASD move, Shift sprint, C sneak, V first/third person, R draw/sheath,
F attack (tap repeatedly for the 3-hit combo, hold for a power attack), Q block, E interact.

For screenshots, `window.__avatars` exposes:

- `photo(slot, dist, angleDeg, camHeight, lookHeight, fov)`
- `pose(slot, clip, t)`
- `treadmill(slot, speed, dirDeg, sneak)`

## Shared-file changes

`src/actors/appearance.ts` gained two additive, optional fields: `GarmentKind` `'braccae'`
(trousers, worn by Dacians and Germans on Trajan's Column) and `Garment.sleeves` (tunic sleeve
length).
