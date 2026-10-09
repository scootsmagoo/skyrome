#!/usr/bin/env python3
"""Level and spectrum report for rendered music WAVs: sample peak, true peak and integrated LUFS (ffmpeg ebur128),
RMS of the active parts, and where the energy sits (share of power per band, 1-4 kHz level re full-scale)."""
import re, subprocess, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

BANDS = [('<250', 20, 250), ('250-1k', 250, 1000), ('1-4k', 1000, 4000), ('4-8k', 4000, 8000), ('>8k', 8000, 20000)]

print(f'{"file":34s} {"peak":>7s} {"tpk":>7s} {"LUFS":>7s} {"rms":>7s} {"1-4k dB":>8s}  share of power by band (%): ' + ' '.join(f'{b[0]:>7s}' for b in BANDS))
for path in sys.argv[1:]:
    rate, d = wavfile.read(path)
    x = d.astype(np.float64) / 32768
    m = x.mean(axis=1)
    pk = 20 * np.log10(np.abs(x).max() + 1e-9)
    # active RMS: windows above -60 dB only (music has long silences; we want the level while it plays)
    w = rate
    n = len(m) // w
    r = np.array([np.sqrt(np.mean(m[i * w:(i + 1) * w] ** 2)) for i in range(n)])
    act = r[r > 1e-3]
    rms = 20 * np.log10(np.sqrt(np.mean(act ** 2))) if len(act) else -120
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = out[out.rfind('Summary'):]
    lufs = re.search(r'I:\s+(-?[\d.]+) LUFS', tail)
    tpk = re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail)
    # Spectrum of the active parts only
    mask = np.repeat(r > 1e-3, w)[: n * w]
    seg = m[: n * w][mask] if mask.any() else m
    f, p = welch(seg, rate, nperseg=8192)
    df = f[1] - f[0]
    tot = p[(f >= 20) & (f < 20000)].sum() * df
    shares = []
    for _, lo, hi in BANDS:
        e = p[(f >= lo) & (f < hi)].sum() * df
        shares.append(100 * e / tot)
    e14 = p[(f >= 1000) & (f < 4000)].sum() * df
    print(f'{path.split("/")[-1][:34]:34s} {pk:7.1f} {tpk.group(1) if tpk else "?":>7s} {lufs.group(1) if lufs else "?":>7s} {rms:7.1f} {10 * np.log10(e14 + 1e-12):8.1f}  ' + ' '.join(f'{s:7.1f}' for s in shares))
