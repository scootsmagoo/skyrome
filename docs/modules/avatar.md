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
avatar.play('drawWeapon');        // implies setDrawn(true); the weapon changes hands at the grab frame
avatar.setDrawn(true);            // stance follows the equipment: gladius + scutum → 'oneHandShield'
avatar.play('attackLight1', { onHit: () => resolveHit(), onEnd: (interrupted) => {} });
avatar.setBlocking(true);
avatar.setCharge(0.7);            // hold a power-attack wind-up; then play('attackPower')
avatar.setDead(true);             // falls (or snaps) into a death pose and stays down
avatar.dispose();                 // when the NPC despawns (Actor.dispose/setAvatar do this): releases its mesh

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
| `lod: 'high' \| 'low' \| 'auto'` | `high` (default) ~4–5k triangles for civilians and ~5–6.4k for armored soldiers. `low` ~1.0–1.4k for civilians and ~1.5k for soldiers (mitten hands, no ears or lids). `auto` switches to the low mesh beyond 36 m (back within 34 m), building it on the first switch (at most one such build every 6 ms across all avatars, so a crowd crossing the line does not hitch). |
| `castShadow` | Default true. |
| `weapon`, `shield` | Override the appearance's visual defaults. |

`HumanoidAvatar` implements `CombatAvatar`. Beyond the contract it adds:

| Member | Purpose |
| --- | --- |
| `eyeHeight` | From the actual eye position of the generated head (≈ 0.93 × height). The camera rig reads it. |
| `setAimPitch(rad)` | Camera pitch. In first person (weapon drawn, or a torch) and while holding a bow draw, the spine and chest follow it. |
| `setWeapon(model)`, `setShield(model, color?, emblem?)` | Swap equipment. The stance updates automatically. |
| `setAppearance(app)` | Rebuild the body for a new `Appearance` in place: same bones, animation state, equipment and first-person state. If the proportions change (height, build, sex, age) the joints move and the mesh is re-bound; `eyeHeight`, the toga arm pose and the scabbard side follow. The carried weapon and shield are **not** taken from `app` (equipped items own them: use `setWeapon`/`setShield`). |
| `setArmor(armor \| undefined)`, `setGarments(garments, footwear?)` | Shorthands for `setAppearance` with one part changed. |
| `setTorch(on)` | A lit torch with a flickering additive flame in the off hand, with an arm pose that keeps the flame clear of the head. The flame always burns upward (it is built in world axes in its shader). |
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

### Equipping items (inventory module)

`ItemDef.visual` (`src/rpg/types.ts`) maps onto the avatar like this:

```ts
function applyVisual(avatar: HumanoidAvatar, base: Appearance, equipped: ItemDef[]) {
  let armor: ArmorLook | undefined = base.armor;
  let garments = base.garments;
  for (const it of equipped) {
    const v = it.visual;
    if (!v) continue;
    if (v.weapon) avatar.setWeapon(v.weapon);
    if (v.shield) avatar.setShield(v.shield);
    if (v.armor) armor = { ...armor, ...v.armor };
    if (v.garment) garments = [...garments.filter((g) => g.kind !== v.garment!.kind), v.garment];
  }
  avatar.setAppearance({ ...base, armor, garments });   // no-op if nothing changed
}
```

Each distinct look is one cached geometry, so swapping costs one mesh build (a few ms) the first
time and nothing when the same look comes back.

### Geometry lifetime

Geometry is cached per appearance and LOD and **reference counted**: an avatar holds its meshes from
construction until `dispose()`. Identical appearances share one buffer. Geometry nobody holds stays
cached for quick reuse (an NPC streaming back in) up to `MAX_IDLE` (24) entries; beyond that the
oldest unheld entries are evicted and their GPU buffers disposed. Held geometry is never evicted.
`avatarCacheStats()` reports the counts; `clearAvatarCache()` disposes everything unheld (e.g. when
leaving a region). Always dispose avatars you drop (Actor.dispose and Actor.setAvatar do).

### Animation LOD (`lod.ts`) and the flat bone path (`flatSkeleton.ts`)

`avatarLod.viewer = game.camera` once (the scene or game sets it); `ActorSystem.update` calls
`avatarLod.beginFrame()` (the view frustum) each frame. Pose sampling:

| Where | Pose rate |
|---|---|
| within `near` = 25 m | every frame |
| 25 to `mid` = 40 m, in view | 30 Hz |
| beyond 40 m, in view | 15 Hz |
| beyond 25 m and out of the frustum | 8 Hz |
| anyone who `wantsFullRate` (dead, weapon drawn, blocking, any action playing or fading, looking at a target), has a `holdFull` hold, or is in first person | every frame, at any distance |

The skipped time accumulates, each avatar has a random phase, the first update always samples, and an
avatar coming into view refreshes at once. Action clocks and their events (`advance`) run every frame.
Foot IK and loose parts (`anim.near`) stay on to 40 m (`ikNear`).

Beyond `flatFrom` = 10 m (2 m hysteresis) the avatar uses the **flat bone path**: its bones and empty
sockets get `matrixAutoUpdate`/`matrixWorldAutoUpdate` off; on a pose update (`FlatSkeleton.tick`) it
composes the local matrices, multiplies the chain once into "model space" (relative to the body mesh)
and writes the skin matrices from that; the skinned meshes are switched to the detached bind mode, so
the skin matrices do not depend on where the avatar stands, and the frames between pose updates cost
nothing for the bones (`skeleton.update` only flags the texture). While nothing hangs on a bone or
socket the hips are also taken out of the mesh's child list (`pruned`), so neither the scene walk nor
the renderer visits the 38 empty bone and socket objects. Anything carried (a weapon, a head load, a
sheathed sword) is found through `childadded` events on the bones and sockets; the carrying bones get a
fresh world matrix every frame (`updateAttached`), so gear stays exactly in place (checked in the game
to 1e-14 against the stock path, skin matrices to 4e-6).

What a flat avatar does NOT keep: `bone.matrixWorld` (stale). Callers that read it outside the render
walk call `avatar.syncWorld()` (the bow nock does), and code that writes or cuts bones holds the avatar
at the full rate on the stock path with `avatar.holdFull(true)` (released with `false`): the ragdoll for
its lifetime, gore for good once a limb is cut.

`?lodoff=anim` (or `game.actors.lod.disabled = true` at runtime, for A/B in one session) turns the
whole thing off: every avatar at the full rate on the stock path.

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
belts, the toga's balteus, sinus and lacinia, capes, armor plates and helmets. Where a mail or
scale skirt ends, a pair of skirt rows hugs the edge so it is a clean ring, and the hips and thigh
tops under it are painted as mail too, so nothing of the tunic shows through.

Faces are simple and stylized: eyeballs with a crisp iris and pupil (paired latitude rings) under
the lids, a soft nose, a darker line between the lips, brows and cheekbones in the head loft, and a
hairline blended over about a row so it reads as a line rather than steps. Hair styles add knots,
crowns, curls and a gathered tail (`long-tied`); veils close over the crown and hide the ears.
Gladiators' closed helmets (murmillo, thraex, hoplomachus with round grilled eye openings, the
secutor's smooth egg with two small holes, the provocator) close over the back of the head.

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

Arm IK post-passes (`anim/armIK.ts`) run forward kinematics on the blended pose and solve an arm
(two bones, the elbow toward a pole in the chest's frame, the forearm twisted so the fist's grip
axis lines up with a direction); a few correction passes keep the grip within about a centimeter:

- Two-handed weapons (hasta, pilum, trident, dolabra): the left fist closes on the nearest
  reachable point of the shaft.
- The bow hand at full draw hooks the string at the corner of the jaw (`fistTo` with `ARM_RIGHT`).
- The first-person sword hand (see below).

Swords and spears sit diagonally in the fist (`WEAPON_INFO.gripTilt`), the way real grips do.

`onHit` fires at the impact time and `onEnd(interrupted)` fires on completion or replacement.
Action clocks and their events run every frame (`AnimationController.advance`), also for distant
avatars whose pose updates are throttled, so combat timing never depends on the camera.

**State rules.**

- Playing `drawWeapon` (`sheathWeapon`) commits the drawn (sheathed) state at once; the weapon itself
  changes hands at the clip's grab frame.
- `setDrawn(x)` that contradicts a running draw or sheath clip cancels it. If the weapon had
  already changed hands, the opposite clip plays to put it back; otherwise the weapon never moved.
  Clip completion never changes the drawn state.
- A dead avatar (`setDead(true)`) refuses every `play()` (its `onEnd(true)` fires at once), so
  nothing can stand the corpse back up. A hit on a corpse only gives a small jolt. The dropped
  weapon and shield stay on the ground until `setDead(false)`.
- With a torch or a retiarius's net in the left hand, attacks, blocks, charges and gestures leave
  the left arm in its carry pose (one-handed swings); only falls (death, knockdown, yield) move it.
`attackPower` picks a directional variant from the movement at play time, as in the GDD: forward =
lunge, sideways = sweep, back = step-back cut, standing = overhead. `drawWeapon` and `sheathWeapon`
pick the variant for where the weapon lives (`hipR`, `hipL`, `back`, `fists`), and the weapon
changes hands at the grab frame. Deaths drop the weapon and shield beside the body, clear of it:
the shield face up by the torso on the body's left, the weapon on its right (`DROP_SPOTS` in
`Equipment.ts`, per fall: on the back, face down, kneeling). A dropped torch keeps burning upright.
A yielding gladiator drops his shield and raises a finger (*ad digitum*).

With a shield, the light slash's follow-through stops at the board's right edge while the shield
arm opens a little, so the blade never sweeps through the scutum.

**Carrying.** A shield not in use hangs on the back with its top edge at the shoulder blades,
leaning slightly toward the left shoulder strap, so the head stays visible from the third-person
camera. Drawing, the left hand reaches back to its rim by the left hip; from the grab frame the
shield swings round onto the arm over 0.2 s (`Equipment` blends its transform between sockets), and
the reverse on sheathing. The bow rides on the back with its upper limb over the left shoulder; the
bow hand reaches over the shoulder for it.

**Bow.** The bow is held in the left hand (limbs vertical, string toward the archer), the archer
standing side-on with the head turned over the bow shoulder. The string is a live mesh: during
`bowDraw` the right hand hooks it at the bow (0.2–0.32 s) and pulls it to the corner of the jaw
(to 0.72 s; arm IK puts the hand exactly there, the drawing elbow high behind), and an arrow is
nocked on the left of the grip; on `bowRelease` the hand leaves the jaw, the string snaps back and
the arrow is gone (the combat module spawns the projectile at `onHit`).

**First person.** The neck and head bones collapse (scale 0.001), hiding the neck, head, hair and
helmet while the body stays visible when you look down. With a weapon drawn, the arms blend to view
poses (`FP_ARMS` in `poses.ts`), and a shield sits low left so only its edge shows (as in the GDD).
A sword hand is placed by IK at a fixed spot in the camera's frame (`FP_SWORD` in `controller.ts`:
the fist and forearm at about (0.6, −0.7) in screen space, the blade angled up toward the center),
so it stays put at any pitch. Spears, two-handers, fists, the bow and a torch use their view poses,
turned at the shoulders by the camera pitch (the camera pivots at the eyes, so bending the spine
would push the shoulders into view); looking down, the upper body leans back a little so the collar
stays out of the picture. Attacks keep their third-person choreography with a small lift so the
swing crosses the screen. Blocking with a scutum raises it into view; the power-attack wind-up
leaves the shield low (only the sword arm winds up).

## Placement conventions for idle loops

Positions are relative to the actor position (the avatar root):

| Loop | Placement |
| --- | --- |
| `sit` | Seat surface 0.45 m high; pelvis about 0.3 m behind the root (put the actor ~0.35 m in front of the seat's center line). |
| `sitGround` | Cross-legged on the ground at the root. |
| `lean` | Back against a wall about 0.25 m behind the root. |
| `sleep` | On the back, pelvis at the root, head toward −Z (behind), the left arm resting beside the body and the right hand on the belly. Raise the actor to the bed height. |
| `work` | Hammering a block about 0.5 m in front, about 0.75 m high. |
| `guard` | At attention; a carried spear stands upright in the right hand. |

## Performance (M4 Max, Chrome, `?scene=avatars&crowd=100`)

121 animated humanoids (100 wandering citizens, the 20-figure lineup and the player) run at
60 fps (vsync-capped) with about 310 draw calls including shadows and about 0.95M triangles
including the shadow pass. CPU time is about 5 ms per frame for everything (physics for 121
kinematic capsules, animation, rendering). Geometry is cached per appearance, so identically
kitted soldiers share one buffer. Bodies stop casting shadows beyond 40 m (back on within 40 m,
off again past 42 m), and the per-frame animation path allocates nothing.

Triangle budgets (high / low): civilians 4.2–5.2k / 1.0–1.4k, gladiators 4.1–5.0k / 1.0–1.4k
(a closed helmet hides a coarse head with no face inside), armored soldiers 5.8–6.3k / 1.5–1.6k
(the lorica segmentata's hoop edges are real geometry). Helmeted heads drop the crown rows the
bowl hides.

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

Name labels show for the nearer figures; a label that would overlap a nearer one is hidden. The
demo scripts time things in game time.

For screenshots, `window.__avatars` exposes:

- `photo(slot, dist, angleDeg, camHeight, lookHeight, fov)`
- `pose(slot, clip, t)`
- `treadmill(slot, speed, dirDeg, sneak)`

## Shared-file changes

C3c (crowd CPU): `ActorSystem` (frustum per frame, `lod`), `Equipment` (one `syncWorld()` call before the
bow nock), `Ragdoll` (`holdFull`), `combat/gore/dismember*.ts` (`holdFull`), `dev/console/commands.ts`
(`tex`).

`src/actors/appearance.ts` gained two additive, optional fields: `GarmentKind` `'braccae'`
(trousers, worn by Dacians and Germans on Trajan's Column) and `Garment.sleeves` (tunic sleeve
length).
