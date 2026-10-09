"""Shared helpers for the Blender-side character pipeline (run with Blender -b --python)."""
import bpy, os, sys, json, math
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.path.join(ROOT, '.cache')
BLEND = os.path.join(CACHE, 'hbm', 'human-base-meshes-bundle-v1.4.1', 'human_base_meshes_bundle.blend')
WORK = os.path.join(CACHE, 'characters')
os.makedirs(WORK, exist_ok=True)

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def link_objects(names):
    with bpy.data.libraries.load(BLEND) as (src, dst):
        dst.objects = names
    out = []
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
        out.append(o)
    return out

def args():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else []
