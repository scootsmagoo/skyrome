// What every sampled sound is made from. build.mjs renders this into public/audio/sfx/.
//
// A sound is a list of clips; a clip is a source file (relative to .cache/sfx) plus optional edits:
//   { src, from, to }      cut a range (seconds of the source)
//   pitch                  playback-rate ratio (1.1 = a little higher and shorter)
//   fx                     ffmpeg audio filter chain (eq, filters) applied before anything else
//   gain                   clip level relative to its siblings (linear)
//   mix: [clip + delay]    layers added under/over it (their peak is scaled by their own gain)
//   max                    longest allowed length (s), faded out
// `alias` points a sound at another's clips (walk and run share their footfalls).

// ---- source folders
const K = 'kenney_impact-sounds/Audio/';
const KR = 'kenney_rpg-audio/Audio/';
const KUI = 'kenney_interface-sounds/Audio/';
const FA = 'fantasy-weapons-and-apparel-sfx-library/weapons-apparel/sfx/';
const S100 = '100-cc0-sfx-2/sfx_100_v2/sfx100v2_';
const FZ = 'fantozzi/Fantozzi-footsteps/flac/Fantozzi-';
const KDD = 'different-steps-on-wood-stone-leaves-gravel-and-mud/kddDifferentSteps_0/';
const LC = 'footsteps-leather-cloth-armor/footsteps/footsteps/';
const SW = 'swishes-sound-pack/swishes/swishes/swish-';
const SN = '20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/sword.';
const SC = '20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/sword_clash.';
const RPG = 'rpg-sound-pack/rpg_sound_pack/RPG Sound Pack/';
const WS = 'water-splash/';

const n2 = (i) => String(i).padStart(2, '0');
const n3 = (i) => String(i).padStart(3, '0');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const c = (src, o = {}) => ({ src, ...o });

// ---------------------------------------------------------------- footsteps
const stoneSteps = ['StoneL1', 'StoneR1', 'StoneL2', 'StoneR2', 'StoneL3', 'StoneR3'].map((s) => FZ + s + '.flac');
const sandSteps = ['SandL1', 'SandR1', 'SandL2', 'SandR2', 'SandL3', 'SandR3'].map((s) => FZ + s + '.flac');
// sand_footsteps (one long recording): the step onsets found by scripts/sfx/probe.mjs
const sandRec = [0.22, 0.6, 1.2, 1.79, 2.45, 3.66, 4.16, 4.8, 5.43, 5.98].map((t) => c(WS + 'sand_footsteps_0.mp3', { from: t - 0.03, to: t + 0.42 }));
const SOFTEN = 'lowpass=f=3300:p=1,highpass=f=60';

const walkStone = [
  ...stoneSteps.map((s) => c(s)),
  c(KDD + 'stone01.ogg'),
  // The same footfalls again a little heavier and duller, so the rotation does not repeat itself.
  ...[0, 3, 5].map((i) => c(stoneSteps[i], { pitch: 0.96, fx: 'lowshelf=f=300:g=2,lowpass=f=6000' })),
];
// Marble and travertine: harder and brighter, a touch higher and with a faint ring on the heel.
const walkMarble = [
  ...stoneSteps.map((s, i) => c(s, { fx: 'highshelf=f=3500:g=5,lowshelf=f=250:g=-3', pitch: 1.04 + 0.03 * (i % 3) })),
  c(KDD + 'stone01.ogg', { fx: 'highshelf=f=3500:g=5', pitch: 1.1 }),
  ...[1, 2, 4].map((i) => c(stoneSteps[i], { fx: 'highshelf=f=4500:g=6', pitch: 1.12 })),
];
// Cobbles and basalt setts: heavy stone with grit under it (a layer of the gravel steps).
const gritA = S100 + 'footstep_01.ogg';
const gritB = S100 + 'footstep_02.ogg';
const walkCobbles = stoneSteps.map((s, i) => c(s, { pitch: 0.93 - 0.02 * (i % 3), fx: 'lowshelf=f=200:g=3', mix: [c(i % 2 ? gritA : gritB, { gain: 0.32, delay: 0.004 })] }));
walkCobbles.push(c(KDD + 'stone01.ogg', { pitch: 0.88, mix: [c(KDD + 'gravel.ogg', { from: 0.0, to: 0.3, gain: 0.3 })] }));
walkCobbles.push(c(K + 'footstep_concrete_003.ogg', { pitch: 0.9, mix: [c(gritA, { gain: 0.3 })] }));

const walkDirt = range(0, 9).map((i) => c(KR + `footstep${n2(i)}.ogg`));
// Grass: a soft thud with the crinkle of dry stalks over it.
const walkGrass = range(0, 9).map((i) => c(K + `footstep_grass_${n3(i % 5)}.ogg`, { pitch: i < 5 ? 1 : 0.94, mix: [c(KDD + (i % 2 ? 'leaves02.ogg' : 'leaves01.ogg'), { gain: i < 5 ? 0.45 : 0.3, delay: 0.01 })] }));
const walkWood = [
  ...range(0, 4).map((i) => c(K + `footstep_wood_${n3(i)}.ogg`, { fx: 'highshelf=f=1500:g=5', gain: 0.9 })),
  ...range(1, 3).map((i) => c(KDD + `wood0${i}.ogg`)),
  ...range(1, 4).map((i) => c(S100 + `footstep_wood_${n2(i)}.ogg`)),
];
const walkGravel = [
  c(KDD + 'gravel.ogg', { max: 0.5 }),
  c(KDD + 'gravel.ogg', { from: 0.0, to: 0.3, pitch: 0.9 }),
  c(KDD + 'gravel.ogg', { from: 0.14, to: 0.7, pitch: 1.05 }),
  c(gritA, { gain: 0.9 }),
  c(gritB, { gain: 0.9 }),
  ...sandRec.slice(0, 5).map((s) => ({ ...s, pitch: 0.86, fx: 'lowshelf=f=300:g=2' })),
];
const walkSand = [...sandSteps.map((s) => c(s)), ...sandRec.slice(5)];
const walkWater = [
  ...range(1, 3).map((i) => c(S100 + `footstep_wet_${n2(i)}.ogg`)),
  ...range(1, 3).map((i) => c(S100 + `footstep_wet_${n2(i)}.ogg`, { pitch: 0.9, fx: 'lowshelf=f=200:g=3' })),
  c(WS + 'splash1_0.wav', { max: 0.5, gain: 0.7 }),
  c(WS + 'splash2_0.wav', { max: 0.5, gain: 0.7 }),
];

/** The soft, slow, quiet version of a footfall (sneaking): rounded off and a little lower. */
const sneakOf = (list) => list.slice(0, 8).map((o) => ({ ...o, fx: [o.fx, SOFTEN].filter(Boolean).join(','), pitch: (o.pitch ?? 1) * 0.94, gain: (o.gain ?? 1) * 0.8 }));
/** The landing: two footfalls on top of each other, the second a beat later, and a low thump. */
const landOf = (list, thump = 'lowpass=f=240') => [0, 2, 4, 6, 7, 1].filter((i) => i < list.length).map((i) => ({ ...list[i], max: 0.45, pitch: (list[i].pitch ?? 1) * 0.88, mix: [...(list[i].mix ?? []), { ...list[(i + 1) % list.length], gain: 0.7, delay: 0.035, pitch: (list[(i + 1) % list.length].pitch ?? 1) * 0.9 }, c(K + 'impactSoft_heavy_00' + (i % 5) + '.ogg', { fx: thump, gain: 0.5 })] }));

const SURF = { stone: walkStone, marble: walkMarble, cobbles: walkCobbles, dirt: walkDirt, grass: walkGrass, wood: walkWood, gravel: walkGravel, sand: walkSand, water: walkWater };

const steps = { rate: 32000, bitrate: 80, kind: 'oneshot', sounds: {} };
for (const [s, list] of Object.entries(SURF)) {
  steps.sounds[`step.${s}.walk`] = { clips: list };
  steps.sounds[`step.${s}.run`] = { alias: `step.${s}.walk` };
  steps.sounds[`step.${s}.sneak`] = { clips: sneakOf(list) };
  steps.sounds[`land.${s}`] = { clips: landOf(list, s === 'wood' ? 'lowpass=f=300' : 'lowpass=f=240') };
}
// Gear layers played with a footfall (FootstepDriver): hobnails on hard ground, mail, a cloak.
steps.sounds['gear.hobnail'] = { clips: [...range(2, 4).map((i) => c(LC + `step_metal (${i}).ogg`)), c(LC + 'step_metal.ogg'), ...range(1, 4).map((i) => c(LC + `step_lth${i === 3 ? 33 : i}.ogg`, { gain: 0.6 }))].slice(0, 6) };
steps.sounds['gear.leather'] = { clips: [...range(1, 4).map((i) => c(LC + `step_lth${i === 3 ? 33 : i}.ogg`)), ...range(1, 4).map((i) => c(FA + `boots-leather-step-0${i}.wav`, { max: 0.35 }))] };
steps.sounds['jump.push'] = { clips: range(1, 3).map((i) => c(FA + `boots-leather-jump-0${i}.wav`, { max: 0.4 })) };

// ---------------------------------------------------------------- combat
const combat = { rate: 32000, bitrate: 96, kind: 'oneshot', sounds: {} };
const swing = (srcs, o = {}) => srcs.map((s) => c(s, o));
combat.sounds['swing.fast'] = {
  clips: [...[11, 12, 13, 1, 2, 5].map((i) => c(SW + `${i}.wav`, { fx: 'highpass=f=250' })), ...[2, 3].map((i) => c(RPG + `battle/swing${i}.wav`))],
};
// The blade's own hiss (StarNinjas) rides on a body of air (swishes) so the swings sound alike.
const bladeOn = (i, body, o = {}) => c(SN + `${i}.ogg`, { max: o.max ?? 0.6, mix: [c(SW + `${body}.wav`, { pitch: o.bodyPitch ?? 0.85, gain: 0.7, fx: 'highpass=f=150' })] });
combat.sounds['swing.medium'] = {
  clips: [...[3, 4, 6, 8].map((i) => c(SW + `${i}.wav`, { pitch: 0.85, fx: 'highpass=f=150' })), c(RPG + 'battle/swing.wav'), bladeOn(4, 3), bladeOn(6, 6), bladeOn(3, 8)],
};
combat.sounds['swing.slow'] = {
  clips: [...[7, 9, 10].map((i) => c(SW + `${i}.wav`, { pitch: 0.72, fx: 'highpass=f=120' })), bladeOn(1, 7, { max: 0.9, bodyPitch: 0.72 }), bladeOn(7, 9, { max: 0.8, bodyPitch: 0.72 }), bladeOn(5, 10, { max: 0.9, bodyPitch: 0.72 }), bladeOn(8, 7, { max: 0.9, bodyPitch: 0.72 })],
};
const clashApparel = [13, 14, 15, 16, 20, 21, 22, 24, 25, 26].map((i) => c(FA + `sword-knife-clash-${n2(i)}.wav`, { max: 1.1 }));
combat.sounds['clash.metal'] = { clips: [...range(1, 10).map((i) => c(SC + `${i}.ogg`, { max: 1.2 })), ...clashApparel.slice(0, 5)] };
combat.sounds['block.shield'] = {
  clips: range(0, 4).map((i) => c(K + `impactWood_heavy_${n3(i)}.ogg`, { mix: [c(K + `impactPlate_light_${n3(i)}.ogg`, { gain: 0.25, delay: 0.002 })] })),
};
combat.sounds['block.metal'] = {
  clips: range(0, 4).map((i) => c(K + `impactMetal_heavy_${n3(i)}.ogg`, { mix: [c(K + `impactPlate_heavy_${n3(i)}.ogg`, { gain: 0.55 })] })),
};
combat.sounds['hit.flesh'] = {
  clips: [
    ...range(0, 4).map((i) => c(K + `impactPunch_heavy_${n3(i)}.ogg`, { pitch: 0.9, mix: [c(K + `impactSoft_heavy_${n3(i)}.ogg`, { gain: 0.6 })] })),
    c('3-melee-sounds/meleesounds/melee sounds/melee sound.wav', { max: 0.6 }),
  ],
};
combat.sounds['hit.punch'] = { clips: range(0, 4).map((i) => c(K + `impactPunch_medium_${n3(i)}.ogg`)) };
combat.sounds['body.fall'] = {
  clips: range(0, 4).map((i) => c(K + `impactSoft_heavy_${n3(i)}.ogg`, { pitch: 0.82, fx: 'lowshelf=f=150:g=4', mix: [c(K + `impactPlank_medium_${n3(i)}.ogg`, { gain: 0.3, delay: 0.01, fx: 'lowpass=f=500' })] })),
};
combat.sounds['arrow.whoosh'] = {
  clips: [...range(1, 3).map((i) => c(FA + `arrow-feathers-0${i}.wav`, { max: 0.45 })), c(SW + '12.wav', { pitch: 0.8, fx: 'highpass=f=900' }), c(SW + '13.wav', { pitch: 0.8, fx: 'highpass=f=900' }), c(SW + '11.wav', { pitch: 0.8, fx: 'highpass=f=900' })],
};
combat.sounds['arrow.impact.wood'] = { clips: range(0, 4).map((i) => c(K + `impactWood_light_${n3(i)}.ogg`, { mix: [c(K + `impactGeneric_light_${n3(i)}.ogg`, { gain: 0.4 })] })) };
combat.sounds['arrow.impact.flesh'] = { clips: range(0, 4).map((i) => c(K + `impactSoft_medium_${n3(i)}.ogg`, { mix: [c(K + `impactPunch_medium_${n3(i)}.ogg`, { gain: 0.35, fx: 'lowpass=f=900' })] })) };
combat.sounds['arrow.impact.stone'] = { clips: [...range(1, 3).map((i) => c(S100 + `stones_0${i}.ogg`, { max: 0.35 })), ...range(0, 1).map((i) => c(K + `impactGeneric_light_${n3(i)}.ogg`, { pitch: 1.3, fx: 'highshelf=f=3000:g=4' }))] };
combat.sounds['weapon.draw'] = { clips: [...range(1, 5).map((i) => c(RPG + `battle/sword-unsheathe${i === 1 ? '' : i}.wav`, { max: 0.9 })), ...range(1, 3).map((i) => c(FA + `seax-unsheathe-0${i}.wav`, { max: 0.9 }))] };
combat.sounds['weapon.sheathe'] = { clips: range(1, 5).map((i) => c(FA + `seax-sheathe-0${i}.wav`, { max: 0.9 })) };

// ---------------------------------------------------------------- world, foley and UI
const world = { rate: 32000, bitrate: 80, kind: 'oneshot', sounds: {} };
world.sounds['cloth.rustle'] = { clips: [...range(1, 4).map((i) => c(KR + `cloth${i}.ogg`, { max: 0.5 })), c(RPG + 'inventory/cloth.wav'), c(RPG + 'inventory/cloth-heavy.wav')] };
world.sounds['armor.jingle'] = {
  clips: [c(RPG + 'inventory/chainmail1.wav'), c(RPG + 'inventory/chainmail2.wav'), c(RPG + 'inventory/armor-light.wav'), c(FA + 'belt-buckle-01.wav'), c(FA + 'belt-buckle-04.wav'), c(FA + 'belt-buckle-05.wav', { max: 0.5 })],
};
world.sounds['coin.clink'] = { clips: [c(RPG + 'inventory/coin.wav'), c(RPG + 'inventory/coin2.wav'), c(RPG + 'inventory/coin3.wav'), c(KR + 'handleCoins2.ogg'), c(KR + 'handleCoins.ogg', { max: 0.7 })] };
world.sounds['door.open'] = { clips: [c(KR + 'doorOpen_1.ogg'), c(KR + 'doorOpen_2.ogg'), c(RPG + 'world/door.wav'), c(S100 + 'door_03.ogg')] };
world.sounds['door.close'] = { clips: range(1, 4).map((i) => c(KR + `doorClose_${i}.ogg`)) };
world.sounds['chest.open'] = { clips: [...range(1, 3).map((i) => c(KR + `creak${i}.ogg`)), c(S100 + 'wood_02.ogg')] };
world.sounds['chest.close'] = { clips: [...range(0, 2).map((i) => c(K + `impactWood_heavy_${n3(i)}.ogg`, { mix: [c(KR + 'metalLatch.ogg', { gain: 0.45, delay: 0.05 })] })), c(S100 + 'wood_hit_01.ogg')] };
world.sounds['lock.click'] = { clips: [c(KR + 'metalClick.ogg', { max: 0.2 }), c(KR + 'metalLatch.ogg', { max: 0.2 }), c(S100 + 'switch_01.ogg'), c(S100 + 'switch_02.ogg'), c(KUI + 'tick_004.ogg', { gain: 0.8 }), c(KUI + 'click_001.ogg', { gain: 0.8 })] };
world.sounds['lock.turn'] = { clips: [c(RPG + 'inventory/metal-small1.wav'), c(RPG + 'inventory/metal-small2.wav'), c(RPG + 'inventory/metal-small3.wav')] };
world.sounds['lock.break'] = { clips: [c(K + 'impactMetal_light_000.ogg'), c(K + 'impactMetal_light_002.ogg'), c(K + 'impactTin_medium_001.ogg')] };
world.sounds['lock.open'] = { clips: [c(S100 + 'lock_open_01.ogg'), c(KR + 'metalLatch.ogg')] };
world.sounds['item.pickup'] = { clips: [c(KR + 'handleSmallLeather.ogg'), c(KR + 'handleSmallLeather2.ogg'), c(KR + 'beltHandle1.ogg', { max: 0.3 })] };

const ui = { rate: 32000, bitrate: 80, kind: 'oneshot', sounds: {} };
ui.sounds['ui.hover'] = { clips: [c(KUI + 'tick_001.ogg'), c(KUI + 'tick_002.ogg'), c(KUI + 'tick_004.ogg')] };
ui.sounds['ui.click'] = { clips: [c(KUI + 'click_001.ogg'), c(KUI + 'select_007.ogg'), c(KUI + 'select_008.ogg'), c(KUI + 'toggle_004.ogg')] };
ui.sounds['ui.open'] = { clips: [c(KR + 'bookOpen.ogg'), c(KR + 'bookPlace1.ogg'), c(KR + 'handleSmallLeather.ogg', { max: 0.3 })] };
ui.sounds['ui.close'] = { clips: [c(KR + 'bookClose.ogg'), c(KR + 'dropLeather.ogg', { max: 0.3 })] };
ui.sounds['ui.error'] = { clips: [c(KUI + 'error_004.ogg'), c(KUI + 'error_007.ogg'), c(KUI + 'bong_001.ogg', { gain: 0.8 })] };
ui.sounds['ui.page'] = { clips: [c(KR + 'bookFlip1.ogg', { max: 0.5 }), c(KR + 'bookFlip2.ogg'), c(KR + 'bookFlip3.ogg')] };

// ---------------------------------------------------------------- beds (looped; the ends are crossfaded)
const beds = (id, src, o = {}) => ({ rate: o.rate ?? 32000, bitrate: o.bitrate ?? 64, kind: 'bed', loopFade: o.loopFade ?? 1.2, sounds: { [id]: { clips: [c(src, o.clip ?? {})] } } });

export const GROUPS = {
  steps,
  combat,
  world,
  ui,
  'bed-arena': beds('bed.arena', 'crowd/crowd_shouting.ogg', { rate: 32000 }),
  'bed-crowd': beds('bed.crowd', 'crowd/crowd_shouting.ogg', { rate: 24000, clip: { from: 6, fx: 'lowpass=f=2400,highpass=f=120', pitch: 0.92 } }),
  'bed-birds': beds('bed.birds', 'ambient-bird-sounds/birds-isaiah658.ogg', { rate: 32000, bitrate: 64, loopFade: 2 }),
  'bed-fountain': beds('bed.fountain', S100 + 'loop_water_01.ogg', { rate: 32000 }),
  'bed-river': beds('bed.river', S100 + 'loop_water_03.ogg', { rate: 24000, clip: { fx: 'lowpass=f=3500' } }),
};

/** Who made what (CREDITS.md). */
export const SOURCES = [
  { name: 'Kenney Impact Sounds', url: 'https://kenney.nl/assets/impact-sounds', author: 'Kenney (kenney.nl)', licence: 'Creative Commons Zero, CC0 (License.txt in the pack)', files: 'kenney_impact-sounds' },
  { name: 'Kenney RPG Audio', url: 'https://kenney.nl/assets/rpg-audio', author: 'Kenney (kenney.nl)', licence: 'Creative Commons Zero, CC0 (License.txt in the pack)', files: 'kenney_rpg-audio' },
  { name: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney (kenney.nl)', licence: 'Creative Commons Zero, CC0 (License.txt in the pack)', files: 'kenney_interface-sounds' },
  { name: 'Different steps on wood, stone, leaves, gravel and mud', url: 'https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud', author: 'kdd (from the file names)', licence: 'CC0 (page: "License(s): CC0")', files: 'different-steps-on-wood-stone-leaves-gravel-and-mud' },
  { name: "Fantozzi's Footsteps (Grass/Sand & Stone)", url: 'https://opengameart.org/content/fantozzis-footsteps-grasssand-stone', author: 'Fantozzi (freesound.org/people/Fantozzi)', licence: 'CC0 (page: "License(s): CC0")', files: 'fantozzi' },
  { name: 'Footsteps (leather, cloth, armor)', url: 'https://opengameart.org/content/footsteps-leather-cloth-armor', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: 'footsteps-leather-cloth-armor' },
  { name: 'Fantasy Weapons and Apparel SFX Library', url: 'https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: 'fantasy-weapons-and-apparel-sfx-library' },
  { name: '20 Sword Sound Effects (Attacks and Clashes)', url: 'https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes', author: 'StarNinjas', licence: 'CC0 (page: "License(s): CC0")', files: '20-sword-sound-effects-attacks-and-clashes' },
  { name: '3 melee sounds', url: 'https://opengameart.org/content/3-melee-sounds', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: '3-melee-sounds' },
  { name: 'Swishes Sound Pack', url: 'https://opengameart.org/content/swishes-sound-pack', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: 'swishes-sound-pack' },
  { name: 'RPG Sound Pack', url: 'https://opengameart.org/content/rpg-sound-pack', author: 'artisticdude', licence: 'CC0 (page: "License(s): CC0")', files: 'rpg-sound-pack' },
  { name: '100 CC0 SFX #2', url: 'https://opengameart.org/content/100-cc0-sfx-2', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: '100-cc0-sfx-2' },
  { name: 'Crowd Shouting/Speaking Ambience', url: 'https://opengameart.org/content/crowd-shoutingspeaking-ambience', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: 'crowd' },
  { name: 'Ambient Bird Sounds', url: 'https://opengameart.org/content/ambient-bird-sounds', author: 'isaiah658 (from the file name)', licence: 'CC0 (page: "License(s): CC0")', files: 'ambient-bird-sounds' },
  { name: 'Water Splash and sand footsteps', url: 'https://opengameart.org/content/water-splash-and-sand-footsteps', author: 'see the page for the submitter', licence: 'CC0 (page: "License(s): CC0")', files: 'water-splash' },
];
