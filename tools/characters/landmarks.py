"""
Joint landmarks of the Human Base Meshes bodies (native Blender coordinates: +X = the figure's
left, -Y = forward, +Z = up; the bodies stand in an A-pose, feet on z = 0).

The male set is hand-measured from cross-section slices of the sculpt (see docs/modules/avatar-real.md
for how: slice the level-2 multires cloud at fixed heights and take the centroids, elbow and knee at
the places the limb's silhouette turns). The female body shares the male's topology (same 10 582
vertices in the same order), so her landmarks are carried over by vertex correspondence: each
landmark is expressed as offsets from its nearest male vertices and re-applied on the female
vertices (scaled by the height ratio). Only the left side is stored; the right side mirrors in x.

Run:  Blender -b --python tools/characters/landmarks.py     (writes tools/characters/landmarks.json)
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import *
import numpy as np

# Joint name = the game bone whose pivot it is (src/actors/avatar/rig.ts BONES).
MALE = {
  'hips':      (0.000, -0.010, 0.905),
  'spine':     (0.000, -0.030, 1.013),
  'chest':     (0.000, -0.020, 1.188),
  'neck':      (0.000, -0.005, 1.375),
  'head':      (0.000, -0.035, 1.500),
  'headTop':   (0.000, -0.040, 1.684),
  'shoulderL': (0.025, -0.040, 1.395),
  'upperArmL': (0.170, -0.005, 1.390),
  'forearmL':  (0.286, 0.005, 1.100),
  'handL':     (0.373, -0.065, 0.872),
  'fingersL':  (0.425, -0.075, 0.790),
  'indexL':    (0.430, -0.125, 0.800),
  'fingerTip': (0.430, -0.090, 0.715),
  'indexTip':  (0.425, -0.120, 0.715),
  'thighL':    (0.093, -0.012, 0.870),
  'shinL':     (0.130, 0.000, 0.480),
  'footL':     (0.172, 0.058, 0.078),
  'toeL':      (0.202, -0.082, 0.034),
  'eyeL':      (0.0335, -0.122, 1.574),
}

# Hand corrections after the vertex-correspondence transfer (checked on preview_landmarks.py renders).
FEMALE_ADJUST = {
  'upperArmL': (0.0, 0.0, -0.012),
  'shoulderL': (0.0, 0.0, -0.008),
}


def main():
    clear()
    m, f = link_objects(['GEO-body_male_realistic', 'GEO-body_female_realistic'])
    vm = np.array([tuple(v.co) for v in m.data.vertices])
    vf = np.array([tuple(v.co) for v in f.data.vertices])
    sf = (vf[:, 2].max() - vf[:, 2].min()) / (vm[:, 2].max() - vm[:, 2].min())
    out = {'male': {k: list(v) for k, v in MALE.items()}, 'female': {}, 'heightRatio': float(sf),
           'bodyHeight': {'male': float(vm[:, 2].max()), 'female': float(vf[:, 2].max())}}
    for k, p in MALE.items():
        p = np.array(p)
        sym = abs(p[0]) < 1e-6
        d = np.linalg.norm(vm - p, axis=1)
        idx = np.argsort(d)[:10]
        w = 1.0 / (d[idx] + 0.01) ** 2
        w /= w.sum()
        q = sum(wi * (vf[i] + (p - vm[i]) * sf) for wi, i in zip(w, idx))
        if sym:
            q[0] = 0.0
        q = q + np.array(FEMALE_ADJUST.get(k, (0, 0, 0)))
        out['female'][k] = [float(x) for x in q]
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landmarks.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
    print('landmarks written; female/male height ratio', sf)


main()
