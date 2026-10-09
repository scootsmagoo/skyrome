#!/usr/bin/env python3
"""Print format, duration, peak and estimated pitch (MIDI) of each raw VSCO sample (a check on the file names)."""
import glob, subprocess, sys
import numpy as np

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def pitch(x, sr=44100):
    # Harmonic-sum peak over a 1 s window after the attack.
    i = int(0.3 * sr)
    seg = x[i:i + sr]
    if len(seg) < sr // 2:
        seg = x[:sr]
    seg = seg * np.hanning(len(seg))
    sp = np.abs(np.fft.rfft(seg, 1 << 18))
    fr = np.fft.rfftfreq(1 << 18, 1 / sr)
    best, bf = 0, 0
    for f in np.arange(30, 1500, 0.25):
        s = 0
        for h in range(1, 6):
            k = int(f * h / (fr[1]))
            s += sp[k - 2:k + 3].max() / h ** 0.3
        if s > best:
            best, bf = s, f
    return bf

for p in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else '.cache/vsco/raw/*')):
    x = load(p)
    name = p.split('/')[-1]
    if any(k in name for k in ('Harp', 'Oboe', 'Flute', 'susvib')):
        f = pitch(x)
        m = 69 + 12 * np.log2(f / 440) if f else 0
        print(f'{name[:60]:60s} {len(x)/44100:6.2f}s peak {np.abs(x).max():.2f} f0 {f:7.2f} midi {m:6.2f}')
    else:
        print(f'{name[:60]:60s} {len(x)/44100:6.2f}s peak {np.abs(x).max():.2f}')
