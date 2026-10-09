#!/usr/bin/env python3
"""Turn the raw VSCO 2 CE subset (.cache/vsco/raw, see fetch-vsco.py) into the game's music samples.

Writes public/audio/music/<id>.m4a + .mp3 (mono, 24 kHz, 80 kbps) and src/audio/music/vscoManifest.ts.
- Harp: plucks trimmed to 3 s, level-matched, faded.
- Oboe, flute, cello: sustained notes cut to attack + a seamless loop (phase-aligned crossfade), level-matched.
- Percussion: one-shots trimmed to the hit and a short tail.
Everything is peak-limited so the encoded files never clip.

Run from the repo root: python3 tools/music/build-samples.py
"""
import glob, json, os, subprocess
import numpy as np

SR = 24000  # process at the output rate, so loop points land on exact samples of the decoded buffers
OUT_SR = 24000
RAW = '.cache/vsco/raw'
OUT = 'public/audio/music'
os.makedirs(OUT, exist_ok=True)


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def onset(x, thresh=0.03):
    """Index where the sound starts (a little before the first sample over `thresh` of the peak)."""
    pk = np.abs(x).max()
    i = int(np.argmax(np.abs(x) > pk * thresh))
    return max(0, i - int(0.004 * SR))


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)


def level_to(x, seg, target_db, peak_db=-3.0):
    """Scale x so that x[seg] has RMS `target_db`, unless that would put the peak above `peak_db`."""
    g = 10 ** ((target_db - rms_db(x[seg[0]:seg[1]])) / 20)
    pk = np.abs(x).max() * g
    lim = 10 ** (peak_db / 20)
    if pk > lim:
        g *= lim / pk
    return x * g


def fade_out(x, secs):
    n = int(secs * SR)
    x = x.copy()
    x[-n:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, n)))
    return x


def fade_in(x, secs):
    n = int(secs * SR)
    x = x.copy()
    x[:n] *= 0.5 * (1 - np.cos(np.linspace(0, np.pi, n)))
    return x


def highpass(x, hz):
    # one-pole high-pass, twice (12 dB/oct), to take rumble off
    a = np.exp(-2 * np.pi * hz / SR)
    y = np.zeros_like(x)
    for _ in range(2):
        px = 0.0
        py = 0.0
        for i in range(len(x)):
            py = a * (py + x[i] - px)
            px = x[i]
            y[i] = py
        x = y.copy()
    return y


def loop_cut(x, ls_s, len_s, xf_s):
    """Cut x to [0, le] with a seamless loop [ls, le]: the tail crossfades into the material before ls.
    `le` is nudged (within +-60 ms) to where the two crossfaded stretches match best in phase."""
    ls = int(ls_s * SR)
    xf = int(xf_s * SR)
    le0 = ls + int(len_s * SR)
    win = int(0.04 * SR)
    ref = x[ls - win:ls]
    best, le = -2, le0
    for cand in range(le0 - int(0.06 * SR), le0 + int(0.06 * SR)):
        seg = x[cand - win:cand]
        c = float(np.dot(ref, seg) / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-9))
        if c > best:
            best, le = c, cand
    y = x[:le].copy()
    t = np.linspace(0, 1, xf)
    if best < 0.9:
        t = np.sqrt(t), np.sqrt(1 - t)  # uncorrelated (an ensemble): equal-power crossfade
        y[le - xf:le] = x[le - xf:le] * t[1] + x[ls - xf:ls] * t[0]
    else:
        y[le - xf:le] = x[le - xf:le] * (1 - t) + x[ls - xf:ls] * t
    return y, ls / SR, le / SR, best


def encode(id, x):
    wav = f'.cache/vsco/{id}.wav'
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    import wave
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ar', str(OUT_SR), '-ac', '1', '-c:a', 'aac', '-b:a', '80k', f'{OUT}/{id}.m4a'], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ar', str(OUT_SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '80k', f'{OUT}/{id}.mp3'], check=True)
    os.remove(wav)


NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def name_to_midi(n):
    """'A#2' -> 46 (C4 = 60)."""
    pc = NOTE[n[0]] + (1 if '#' in n else 0)
    return 12 * (int(n[-1]) + 1) + pc


def raw(sub):
    return sorted(glob.glob(f'{RAW}/{sub}'))


manifest = {}

# ---------------------------------------------------------------- harp (names are true pitches)
harp = []
for p in raw('Strings__Harp__KSHarp_*_mf.wav'):
    n = p.split('KSHarp_')[1].split('_')[0]
    x = load(p)
    x = x[onset(x):]
    x = highpass(x[: int(3.2 * SR)], 45)
    x = fade_out(x, 0.8)
    x = level_to(x, (0, int(1.5 * SR)), -24)
    id = f'harp-{n}'
    encode(id, x)
    harp.append({'id': id, 'midi': name_to_midi(n), 'dur': round(len(x) / SR, 3)})
manifest['harp'] = sorted(harp, key=lambda e: e['midi'])

# ---------------------------------------------------------------- sustained instruments (names are an octave low)
SUST = {
    'oboe': dict(glob='Woodwinds__Oboe__Sus__Oboe_Sus_*_v1_Main.wav', tag=lambda p: p.split('Oboe_Sus_')[1].split('_')[0], off=12, ls=1.1, loop=1.5, xf=0.3, target=-25, hi=1200),
    'flute': dict(glob='Woodwinds__Flute__susNV__LDFlute_susNV_*_v1_1.wav', tag=lambda p: p.split('LDFlute_susNV_')[1].split('_')[0], off=12, ls=1.0, loop=1.4, xf=0.3, target=-27, hi=1400),
    'cello': dict(glob='Strings__Cello_Section__susvib__susvib_*_v1_1.wav', tag=lambda p: os.path.basename(p).split('susvib_')[-1].split('_')[0], off=12, ls=1.6, loop=3.0, xf=0.6, target=-26, hi=400),
}
for inst, c in SUST.items():
    rows = []
    for p in raw(c['glob']):
        n = c['tag'](p)
        midi = name_to_midi(n) + c['off']
        if 440 * 2 ** ((midi - 69) / 12) > c['hi'] * 1.2 and inst != 'cello':
            continue  # above what the melody ever asks for
        x = load(p)
        x = x[onset(x, 0.02):]
        if inst == 'cello':
            x = highpass(x[: int(6 * SR)], 40)
        y, ls, le, corr = loop_cut(x, c['ls'], c['loop'], c['xf'])
        y = fade_in(y, 0.004)
        y = level_to(y, (int(ls * SR), int(le * SR)), c['target'])
        id = f'{inst}-{n.replace("#", "s")}'
        encode(id, y)
        rows.append({'id': id, 'midi': midi, 'dur': round(len(y) / SR, 3), 'loop': [round(ls, 6), round(le, 6)]})
        print(f'{id}: midi {midi}, loop {ls:.2f}-{le:.2f}s, phase match {corr:.2f}')
    manifest[inst] = sorted(rows, key=lambda e: e['midi'])

# ---------------------------------------------------------------- percussion one-shots


def perc(id, pattern, secs, target=-22, fade=0.25, hp=40):
    x = load(raw(pattern)[0])
    x = x[onset(x, 0.05):]
    x = x[: int(secs * SR)]
    x = highpass(x, hp)
    x = fade_out(x, min(fade, secs / 2))
    x = level_to(x, (0, min(len(x), int(0.4 * SR))), target, peak_db=-3)
    encode(id, x)
    return {'id': id, 'dur': round(len(x) / SR, 3)}


H = 'VSCO_1_Percussion__drums__other__ethnic__giant__hand__EthnicLargeHand_hit_'
C = 'VSCO_1_Percussion__drums__other__ethnic__congo__muted__'
T = 'VSCO_1_Percussion__varWood__'
manifest['doum'] = [
    {**perc('doum-pp2', f'{H}pp_2.wav', 0.9), 'layer': 0},
    {**perc('doum-pp3', f'{H}pp_3.wav', 0.9), 'layer': 0},
    {**perc('doum-mp2', f'{H}mp_2.wav', 0.9), 'layer': 1},
    {**perc('doum-mp3', f'{H}mp_3.wav', 0.9), 'layer': 1},
    {**perc('doum-f4', f'{H}f_4.wav', 0.9), 'layer': 1},
]
manifest['tek'] = [
    {**perc('tek-h1', f'{C}ethnicHigh_hit_mp_1.wav', 0.6), 'layer': 1},
    {**perc('tek-h2', f'{C}ethnicHigh_hit_pp_1.wav', 0.6), 'layer': 0},
    {**perc('tek-l1', f'{C}ethnicLow_hit_mp_1.wav', 0.6), 'layer': 1},
]
manifest['ka'] = [
    {**perc('ka-1', f'{T}tambourine_up_2.wav', 0.3, fade=0.1, hp=300), 'layer': 0},
    {**perc('ka-2', f'{T}tambourine_up_3.wav', 0.3, fade=0.1, hp=300), 'layer': 0},
    {**perc('ka-3', f'{T}tambourine_up_6.wav', 0.3, fade=0.1, hp=300), 'layer': 0},
]
manifest['tambHit'] = [
    {**perc('tamb-d2', f'{T}tambourine_down_2.wav', 0.55, fade=0.2, hp=300), 'layer': 0},
    {**perc('tamb-d3', f'{T}tambourine_down_3.wav', 0.55, fade=0.2, hp=300), 'layer': 0},
    {**perc('tamb-d4', f'{T}tambourine_down_4.wav', 0.55, fade=0.2, hp=300), 'layer': 0},
]
manifest['tambShake'] = [
    {**perc('tamb-shake', 'Percussion__Tamb1-Shake_v1_rr1_Sum.wav', 1.4, fade=0.7, hp=300, target=-26), 'layer': 0},
    {**perc('tamb-shake2', f'{T}tambourine_shake.wav', 1.6, fade=0.8, hp=300, target=-26), 'layer': 0},
]

# ---------------------------------------------------------------- the manifest the game imports
ts = '''/**
 * Generated by tools/music/build-samples.py from the VSCO 2 Community Edition (CC0); do not edit.
 * `midi` is the true pitch of the recording, `loop` the seamless loop region (s) of a sustained note,
 * `layer` the dynamic layer of a percussion hit (0 soft, 1 firm). Files: public/audio/music/<id>.m4a|mp3.
 */
export interface VscoSample {
  id: string;
  midi?: number;
  dur: number;
  loop?: [number, number];
  layer?: number;
}

export const VSCO: Record<string, VscoSample[]> = ''' + json.dumps(manifest, indent=2).replace('"', "'") + ''';
'''
# tidy key quoting to match the code style
import re
ts = re.sub(r"'(\w+)': ", r'\1: ', ts)
open('src/audio/music/vscoManifest.ts', 'w').write(ts)
print({k: len(v) for k, v in manifest.items()})
