#!/usr/bin/env python3
"""Download the VSCO 2 CE subset the music engine uses into .cache/vsco/raw (CC0, see public/audio/music/CREDITS.md).

Run from the repo root: python3 tools/music/fetch-vsco.py
"""
import json, os, subprocess, urllib.parse
from concurrent.futures import ThreadPoolExecutor

REPO = 'sgossner/VSCO-2-CE'
CACHE = '.cache/vsco'
RAW = f'{CACHE}/raw'
os.makedirs(RAW, exist_ok=True)

tree_path = f'{CACHE}/tree.json'
if not os.path.exists(tree_path):
    subprocess.run(['curl', '-sfL', f'https://api.github.com/repos/{REPO}/' + 'git/trees/HEAD?recursive=1', '-o', tree_path], check=True)
paths = [e['path'] for e in json.load(open(tree_path))['tree'] if e['type'] == 'blob' and e['path'].lower().endswith('.wav')]
want = []


def add(p):
    if p in paths:
        want.append(p)
    else:
        print('MISSING', p)


for n in 'D2 F2 A2 C3 E3 G3 B3 D4 F4 A4 C5 E5 G5'.split():
    add(f'Strings/Harp/KSHarp_{n}_mf.wav')
for p in paths:
    if p.startswith('Woodwinds/Oboe/Sus/') and '_v1_' in p:
        want.append(p)
    if p.startswith('Woodwinds/Flute/susNV/') and '_v1_' in p:
        want.append(p)
    if p.startswith('Strings/Cello Section/susvib/') and '_v1_' in p and any(k in p for k in ['_D2_', '_G1_', '_C3_', '_F2_', '_B1_']):
        want.append(p)
for k in ['pp_2', 'pp_3', 'mp_2', 'mp_3', 'mp_1', 'f_4']:
    add(f'VSCO 1 Percussion/drums/other/ethnic/giant/hand/EthnicLargeHand_hit_{k}.wav')
for k in ['ethnicHigh_hit_pp_1', 'ethnicHigh_hit_mp_1', 'ethnicLow_hit_mp_1', 'ethnicLow_hit_pp_1']:
    add(f'VSCO 1 Percussion/drums/other/ethnic/congo/muted/{k}.wav')
for k in ['tambourine_up_2', 'tambourine_up_3', 'tambourine_up_6', 'tambourine_down_2', 'tambourine_down_3', 'tambourine_down_4', 'tambourine_shake']:
    add(f'VSCO 1 Percussion/varWood/{k}.wav')
for k in ['Tamb1-Shake_v1_rr1_Sum', 'Tamb1-Hit_v1_rr1_Sum']:
    add(f'Percussion/{k}.wav')


def get(p):
    out = f'{RAW}/' + p.replace('/', '__').replace(' ', '_')
    if os.path.exists(out):
        return
    url = f'https://raw.githubusercontent.com/{REPO}/HEAD/' + urllib.parse.quote(p)
    subprocess.run(['curl', '-sfL', url, '-o', out], check=True)  # curl: python's urllib lacks certs on some Macs


with ThreadPoolExecutor(8) as ex:
    list(ex.map(get, want))
print(len(want), 'files')
