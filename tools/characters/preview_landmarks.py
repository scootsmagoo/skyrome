"""
Dev tool: renders each HBM body in x-ray with the landmark joints as red spheres (front and side),
to check tools/characters/landmarks.json by eye.   Blender -b --python preview_landmarks.py -- [male|female]
Output: .cache/characters/lm_<sex>_<view>.png
"""
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import *

sex = (args() or ['male'])[0]
lm = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landmarks.json')))[sex]
clear()
body = link_objects([f'GEO-body_{sex}_realistic'])[0]
body.location = (0, 0, 0)
body.color = (0.6, 0.6, 0.65, 1)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.show_xray = True
sh.xray_alpha = 0.35
sh.color_type = 'OBJECT'
sh.light = 'STUDIO'
mats = {}
for k, p in lm.items():
    for sx in ([1, -1] if abs(p[0]) > 1e-6 else [1]):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.008 if 'Tip' not in k else 0.005, location=(p[0] * sx, p[1], p[2]), segments=8, ring_count=6)
        o = bpy.context.object
        o.color = (1, 0.1, 0.1, 1) if 'headTop' not in k and 'Tip' not in k else (0.1, 0.9, 0.1, 1)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 1.9
sc.camera = cam
sc.render.resolution_x = 700
sc.render.resolution_y = 900
for name, loc, rot in [('front', (0, -5, 0.85), (math.pi / 2, 0, 0)), ('side', (5, 0, 0.85), (math.pi / 2, 0, math.pi / 2))]:
    cam.location = loc
    cam.rotation_euler = rot
    sc.render.filepath = f'{WORK}/lm_{sex}_{name}.png'
    bpy.ops.render.render(write_still=True)
