"""
Builds one realistic body (male | female) for the game from the Human Base Meshes bundle.

    Blender -b --python tools/characters/build_body.py -- male [--no-bake] [--lod0-only]

Stages (see docs/modules/avatar-real.md):
  1. load the sculpt (cage = multires level 0; hi = multires level 3, used only for baking);
  2. build a temporary armature on the sculpt's own joints (landmarks.json, A-pose) and heat-weight the
     cage to it, then clean the weights (neck/head split, smoothing, 4 influences);
  3. LODs: triangulate + collapse-decimate the cage (weights ride along), re-fit weights by projection;
  4. bake tangent-space normal and AO maps from hi onto each LOD (A-pose, UVs kept);
  5. pose: linear-blend-skin each LOD (and the eyes) into the game's bind pose, so that the joints are
     exactly the computeRig joints of the reference rig (rigs.json) and the arms hang straight down;
  6. export one GLB (armature with the game's bone names, JOINTS_0/WEIGHTS_0, tangents) and the maps.

Output: public/models/people/<sex>.glb, .cache/characters/<sex>_<lod>_{normal,ao}.png (then basisu).
"""
import json, math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import *
import numpy as np
import bmesh, mathutils

FS = {}
HERE = os.path.dirname(os.path.abspath(__file__))
A = args()
SEX = A[0]
NO_BAKE = '--no-bake' in A
LOD0_ONLY = '--lod0-only' in A
OUT_GLB = os.path.join(ROOT, 'public', 'models', 'people')
os.makedirs(OUT_GLB, exist_ok=True)

RIGS = json.load(open(os.path.join(HERE, 'rigs.json')))
BONES = RIGS['bones']
PARENT = RIGS['parent']
REF = RIGS['rigs'][SEX]
LM = json.load(open(os.path.join(HERE, 'landmarks.json')))[SEX]
BODY_H = json.load(open(os.path.join(HERE, 'landmarks.json')))['bodyHeight'][SEX]
K = REF['height'] / BODY_H          # global uniform scale from the sculpt to the reference rig
TRI_TARGET = [11000, 4000, 1200]
MAP_SIZE = [2048, 1024, 512]


def log(*a):
    print('[build_body]', *a, flush=True)


def v3(a):
    return np.array(a, dtype=np.float64)


def to_blender(g):
    """Game space (x right-hand left, y up, z forward) -> Blender (x, -z, y)."""
    return np.array([g[0], -g[2], g[1]], dtype=np.float64)


def mirror(p):
    return np.array([-p[0], p[1], p[2]])


# ---------------------------------------------------------------- joints: source (sculpt) and target (game)
def src_joint(name):
    """Sculpt landmark for a game bone (right side mirrors the left)."""
    right = name.endswith('R')
    base = name[:-1] + 'L' if right else name
    p = v3(LM[base])
    return mirror(p) if right else p


# Segment each bone drives: (tail joint source key or None). Left-side keys; R mirrors.
CHILD = {
    'hips': 'spine', 'spine': 'chest', 'chest': 'neck', 'neck': 'head', 'head': 'headTop',
    'shoulder': 'upperArm', 'upperArm': 'forearm', 'forearm': 'hand', 'hand': 'fingers',
    'fingers': 'fingerTip', 'index': 'indexTip',
    'thigh': 'shin', 'shin': 'foot', 'foot': 'toe', 'toe': None,
}


def base_of(bone):
    return bone[:-1] if bone[-1] in 'LR' else bone


def side_of(bone):
    return bone[-1] if bone[-1] in 'LR' else ''


def src_tail(bone):
    b, s = base_of(bone), side_of(bone)
    c = CHILD[b]
    if c is None:
        # toe: continues along the foot axis to the tips of the toes
        f, t = src_joint('foot' + s), src_joint('toe' + s)
        d = (t - f)
        d[2] = 0.0
        d /= np.linalg.norm(d)
        return t + d * 0.07 + np.array([0, 0, -0.012])
    key = c + s if c not in ('headTop', 'fingerTip', 'indexTip') else c
    if c in ('fingerTip', 'indexTip'):
        p = v3(LM[c])
        return mirror(p) if s == 'R' else p
    return src_joint(key)


def tgt_joint(bone):
    return to_blender(REF['joints'][bone])


def tgt_tail(bone, length_hint):
    """Target tail: the child's joint, or straight down / up / forward for end bones."""
    b, s = base_of(bone), side_of(bone)
    h = tgt_joint(bone)
    if b == 'head':
        return h + np.array([0, 0, 1.0]) * length_hint
    if b in ('fingers', 'index'):
        return h + np.array([0, 0, -1.0]) * length_hint
    if b == 'toe':
        return h + np.array([0, -1.0, 0]) * length_hint
    return tgt_joint(CHILD[b] + s)


def frame(d, sec):
    a = d / np.linalg.norm(d)
    b = sec - a * np.dot(sec, a)
    b /= np.linalg.norm(b)
    c = np.cross(a, b)
    return np.stack([a, b, c], axis=1)


FORWARD = np.array([0.0, -1.0, 0.0])
UP = np.array([0.0, 0.0, 1.0])


def bone_transforms():
    """Per-bone (F_t, kvec, src_head, tgt_head): p' = tgt_head + F_t diag(k) F_s^T (p - src_head)."""
    out = {}
    # the head is scaled so that its height matches the reference rig's head height
    chin_z = LM['head'][2] - 0.045  # chin level of the sculpt (about 4.5 cm below the mouth joint)
    for bone in BONES:
        b = base_of(bone)
        sh_ = src_joint(bone)
        st = src_tail(bone)
        ds = st - sh_
        th = tgt_joint(bone)
        sec_s = FORWARD
        sec_t = FORWARD
        if b in ('foot', 'toe'):
            sec_s = UP
            sec_t = UP
        src_len = np.linalg.norm(ds)
        if b in ('fingers', 'index', 'toe'):
            # end bones: uniform scale, target direction straight down / forward
            kpar = K
            hint = src_len * K
            tt = tgt_tail(bone, hint)
        elif b == 'head':
            kpar = REF['headH'] / (v3(LM['headTop'])[2] - chin_z)
            tt = tgt_tail(bone, src_len * kpar)
        else:
            tt = tgt_tail(bone, 0)
            kpar = np.linalg.norm(tt - th) / src_len
        dt = tt - th
        kperp = K if b != 'head' else kpar
        Fs = frame(ds, sec_s)
        if b == 'toe':
            dt = np.array([0, -1.0, -0.15])  # toes point forward and a little down
        Ft = frame(dt, sec_t)
        out[bone] = (Ft, np.array([kpar, kperp, kperp]), sh_, th)
    return out


def apply_pose(P, W, bt):
    """Linear blend skinning from the A-pose into the game's bind pose. W: [n, 25]."""
    out = np.zeros_like(P)
    for i, bone in enumerate(BONES):
        w = W[:, i]
        m = w > 1e-5
        if not m.any():
            continue
        Ft, k, sh_, th = bt[bone]
        Fs = FS[bone]
        local = (P[m] - sh_) @ Fs                     # rows: coordinates in the source bone frame
        out[m] += w[m, None] * (th + (local * k) @ Ft.T)
    return out


# ---------------------------------------------------------------- Blender helpers
def deselect():
    for o in bpy.context.view_layer.objects:
        o.select_set(False)


def set_active(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def mesh_positions(ob):
    n = len(ob.data.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    ob.data.vertices.foreach_get('co', a)
    return a.reshape(n, 3)


def set_positions(ob, P):
    ob.data.vertices.foreach_set('co', P.astype(np.float64).ravel())
    ob.data.update()


def read_weights(ob):
    names = [g.name for g in ob.vertex_groups]
    idx = {BONES.index(n): g.index for g in ob.vertex_groups for n in [g.name] if n in BONES}
    W = np.zeros((len(ob.data.vertices), len(BONES)))
    for v in ob.data.vertices:
        for g in v.groups:
            nm = ob.vertex_groups[g.group].name
            if nm in BONES:
                W[v.index, BONES.index(nm)] = g.weight
    return W


def write_weights(ob, W):
    ob.vertex_groups.clear()
    groups = [ob.vertex_groups.new(name=n) for n in BONES]
    for i in range(len(W)):
        for j in np.nonzero(W[i] > 1e-4)[0]:
            groups[j].add([i], float(W[i, j]), 'REPLACE')


def clean_weights(W, edges, P):
    """Neck/head split by plane, smoothing along edges, 4 influences, normalised."""
    W = W.copy()
    ih, inn = BONES.index('head'), BONES.index('neck')
    # --- head/neck: a slanted plane through chin and nape; smoothstep over +-2 cm
    zc = LM['head'][2] - 0.045 + 0.015
    thr = zc + 0.6 * (P[:, 1] + 0.03)
    t = (P[:, 2] - thr) / 0.02
    hf = np.clip((t + 1) / 2, 0, 1)
    hf = hf * hf * (3 - 2 * hf)
    zone = (np.abs(P[:, 0]) < 0.14) & (P[:, 2] > 1.38 * BODY_H / 1.684)
    tot = W[:, ih] + W[:, inn]
    W[zone, ih] = (hf * tot)[zone]
    W[zone, inn] = ((1 - hf) * tot)[zone]
    # --- smoothing: a few passes of weighted neighbour averaging (not on hands/feet/head)
    a, b = edges[:, 0], edges[:, 1]
    deg = np.bincount(np.concatenate([a, b]), minlength=len(W)).astype(np.float64)
    fingers = [BONES.index(n) for n in BONES if base_of(n) in ('fingers', 'index', 'toe')]
    for _ in range(3):
        acc = np.zeros_like(W)
        np.add.at(acc, a, W[b])
        np.add.at(acc, b, W[a])
        avg = acc / np.maximum(deg, 1)[:, None]
        Wn = 0.6 * W + 0.4 * avg
        Wn[:, fingers] = W[:, fingers]
        W = Wn
    # --- extra smoothing around the joints that bend a lot: shoulders (arms go overhead), hips, elbows, knees
    for joint, radius, iters in (('upperArm', 0.16, 14), ('thigh', 0.13, 8), ('forearm', 0.07, 4), ('shin', 0.07, 4), ('shoulder', 0.08, 6)):
        for side in ('L', 'R'):
            j = src_joint(joint + side)
            m = np.linalg.norm(P - j, axis=1) < radius
            if not m.any():
                continue
            for _ in range(iters):
                acc = np.zeros_like(W)
                np.add.at(acc, a, W[b])
                np.add.at(acc, b, W[a])
                avg = acc / np.maximum(deg, 1)[:, None]
                W[m] = 0.5 * W[m] + 0.5 * avg[m]
    # --- 4 influences
    idx = np.argsort(-W, axis=1)[:, 4:]
    np.put_along_axis(W, idx, 0, axis=1)
    s = W.sum(1, keepdims=True)
    s[s < 1e-9] = 1
    return W / s


def edge_array(ob):
    n = len(ob.data.edges)
    e = np.empty(n * 2, dtype=np.int64)
    ob.data.edges.foreach_get('vertices', e)
    return e.reshape(n, 2)


# ---------------------------------------------------------------- stage 1/2: load, armature, weights
def make_armature(name, joints_fn, tails_fn, loc_scale=1.0):
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    set_active(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bone in BONES:
        e = arm_data.edit_bones.new(bone)
        e.head = tuple(joints_fn(bone))
        e.tail = tuple(tails_fn(bone))
        if (mathutils.Vector(e.tail) - mathutils.Vector(e.head)).length < 0.01:
            e.tail = (e.head[0], e.head[1], e.head[2] + 0.02)
        eb[bone] = e
    for bone in BONES:
        if PARENT[bone]:
            eb[bone].parent = eb[PARENT[bone]]
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def main():
    t0 = time.time()
    clear()
    sc = bpy.context.scene
    names = [f'GEO-body_{SEX}_realistic']
    cage = link_objects(names)[0]
    cage.name = f'{SEX}_cage'
    cage.location = (0, 0, 0)
    deselect()
    repack_uvs(cage)
    # --- hi: multires level 3 evaluated into a plain mesh (baking only)
    mr = cage.modifiers['Multires']
    mr.levels = mr.render_levels = mr.sculpt_levels = 3
    dg = bpy.context.evaluated_depsgraph_get()
    hi_mesh = bpy.data.meshes.new_from_object(cage.evaluated_get(dg))
    hi = bpy.data.objects.new(f'{SEX}_hi', hi_mesh)
    sc.collection.objects.link(hi)
    log('hi poly', len(hi_mesh.polygons))
    cage.modifiers.remove(mr)
    P0 = mesh_positions(cage)
    log('cage verts', len(P0), 'K', K)

    # --- armature on the sculpt's joints
    arm = make_armature('rest_arm', src_joint, src_tail)
    deselect()
    cage.select_set(True)
    set_active(arm)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    W = read_weights(cage)
    log('heat weights: verts without weights', int((W.sum(1) < 1e-4).sum()), 'of', len(W))
    # remove armature link: we keep vertex groups only
    cage.parent = None
    for m in list(cage.modifiers):
        cage.modifiers.remove(m)
    bpy.data.objects.remove(arm)
    cage.matrix_world = mathutils.Matrix.Identity(4)
    W = clean_weights(W, edge_array(cage), P0)
    write_weights(cage, W)

    # --- stage 3: LODs
    bm = bmesh.new()
    bm.from_mesh(cage.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(cage.data)
    bm.free()
    lods = []
    for li, target in enumerate(TRI_TARGET[:1] if LOD0_ONLY else TRI_TARGET):
        ob = cage.copy()
        ob.data = cage.data.copy()
        ob.name = f'{SEX}_lod{li}'
        sc.collection.objects.link(ob)
        ratio = target / len(cage.data.polygons)
        mod = ob.modifiers.new('dec', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        deselect()
        set_active(ob)
        bpy.ops.object.modifier_apply(modifier='dec')
        lods.append(ob)
        log(f'lod{li}: tris', sum(len(p.vertices) - 2 for p in ob.data.polygons), 'verts', len(ob.data.vertices))
        for p in ob.data.polygons:
            p.use_smooth = True

    # decimation smears the UVs (the collapsed triangles interpolate across island borders): project them
    # again from the cage, island by island, so every LOD samples the original atlas exactly
    islands = cage_islands(cage)
    for ob in lods:
        reproject_uvs(ob, cage, islands)

    # weights per LOD: re-fit from the cage by nearest surface point (robust against decimate quirks)
    from mathutils.bvhtree import BVHTree
    cdg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(cage, cdg)
    polys = cage.data.polygons
    pidx = np.array([[v for v in p.vertices] for p in polys])
    for ob in lods:
        P = mesh_positions(ob)
        Wl = np.zeros((len(P), len(BONES)))
        for i, p in enumerate(P):
            loc, nrm, fi, dist = bvh.find_nearest(mathutils.Vector(p))
            tri = pidx[fi]
            q = [cage.data.vertices[j].co for j in tri]
            # barycentric weights on the cage triangle
            a_, b_, c_ = [np.array(x) for x in q]
            l = np.array(loc)
            v0, v1, v2 = b_ - a_, c_ - a_, l - a_
            d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
            d20, d21 = v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01
            bv = (d11 * d20 - d01 * d21) / den if abs(den) > 1e-18 else 0.33
            bw = (d00 * d21 - d01 * d20) / den if abs(den) > 1e-18 else 0.33
            bu = 1 - bv - bw
            Wl[i] = bu * W[tri[0]] + bv * W[tri[1]] + bw * W[tri[2]]
        Wl[np.arange(len(Wl))[:, None], np.argsort(-Wl, axis=1)[:, 4:]] = 0
        s = Wl.sum(1, keepdims=True)
        s[s < 1e-9] = 1
        write_weights(ob, Wl / s)
    # keep weights in numpy for the posing stage
    LODW = [read_weights(ob) for ob in lods]

    # --- stage 4: bake (A-pose geometry; UVs of the lods are the cage's UVs, simplified)
    maps = {}
    if not NO_BAKE:
        sc.render.engine = 'CYCLES'
        sc.cycles.device = 'CPU'
        sc.cycles.use_denoising = False
        for li, ob in enumerate(lods):
            size = MAP_SIZE[li]
            t1 = time.time()
            maps[(li, 'NORMAL')] = bake(ob, hi, size, 'NORMAL', li)
            log(f'baked lod{li} NORMAL {size}px in {time.time() - t1:.0f}s')
        # AO: baked once on the detailed mesh itself (its UVs are the packed atlas), then resized per LOD
        t1 = time.time()
        bake_ao(hi)
        log(f'baked AO in {time.time() - t1:.0f}s')

    # --- stage 5: pose into the game's bind pose
    bt = bone_transforms()
    FS.clear()
    for bone in BONES:
        b = base_of(bone)
        sec = UP if b in ('foot', 'toe') else FORWARD
        FS[bone] = frame(src_tail(bone) - src_joint(bone), sec)
    for ob, Wl in zip(lods, LODW):
        P = mesh_positions(ob)
        set_positions(ob, apply_pose(P, Wl, bt))
        ob.data.update()
    # eyes: two UV spheres at the posed eye centres, rigid to the head
    eyes, eye_centers, eye_radius = make_eyes(bt)

    debug_render(lods[0], eyes)

    # --- stage 6: armature at the game's joints, export
    garm = make_armature('Armature', tgt_joint, lambda b: tgt_tail_vis(b))
    for ob in lods + [eyes]:
        ob.parent = garm
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = garm
    # vertex groups: lods have them from write_weights; eyes -> head
    export_glb(garm, lods, eyes)
    # report
    report = {'lods': [{'tris': sum(len(p.vertices) - 2 for p in o.data.polygons), 'verts': len(o.data.vertices)} for o in lods]}
    # game coordinates for the eyes
    report['eyes'] = [[float(c[0]), float(c[2]), float(-c[1])] for c in eye_centers]
    report['eyeRadius'] = float(eye_radius)
    report['K'] = K
    json.dump(report, open(os.path.join(WORK, f'{SEX}_report.json'), 'w'), indent=1)
    # joint check
    log('done in', round(time.time() - t0), 's', report)


def debug_render(ob, eyes):
    """Front/side/back x-ray renders of the posed LOD0 with the game's joints (checks the bind pose)."""
    sc = bpy.context.scene
    engine = sc.render.engine
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.show_xray = True
    sh.xray_alpha = 0.45
    sh.light = 'STUDIO'
    sh.color_type = 'SINGLE'
    sh.color_type = 'OBJECT'
    ob.color = (0.75, 0.7, 0.68, 1)
    for o in sc.objects:
        o.hide_render = o is not ob
    spheres = []
    for bone in BONES:
        j = tgt_joint(bone)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.007, location=tuple(j), segments=8, ring_count=6)
        spheres.append(bpy.context.object)
    for o in spheres:
        o.color = (1, 0.1, 0.1, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.0
    sc.camera = cam
    sc.render.resolution_x = 700
    sc.render.resolution_y = 900
    for name, loc, rot in [('front', (0, -5, 0.9), (math.pi / 2, 0, 0)), ('side', (5, 0, 0.9), (math.pi / 2, 0, math.pi / 2))]:
        cam.location = loc
        cam.rotation_euler = rot
        sc.render.filepath = f'{WORK}/pose_{SEX}_{name}.png'
        bpy.ops.render.render(write_still=True)
    for s in spheres:
        bpy.data.objects.remove(s)
    bpy.data.objects.remove(cam)
    for o in sc.objects:
        o.hide_render = False
    sc.render.engine = engine


def cage_islands(cage):
    """UV island id per cage polygon (faces sharing a vertex at the same UV belong together)."""
    me = cage.data
    uv = me.uv_layers[0].data
    parent = list(range(len(me.polygons)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    seen = {}
    for p in me.polygons:
        for li in range(p.loop_start, p.loop_start + p.loop_total):
            key = (me.loops[li].vertex_index, round(uv[li].uv[0], 5), round(uv[li].uv[1], 5))
            if key in seen:
                parent[find(p.index)] = find(seen[key])
            else:
                seen[key] = p.index
    return [find(i) for i in range(len(me.polygons))]


def reproject_uvs(ob, cage, islands):
    from mathutils.bvhtree import BVHTree
    cme = cage.data
    cuv = cme.uv_layers[0].data
    verts = [v.co.copy() for v in cme.vertices]
    by_island = {}
    for p in cme.polygons:
        by_island.setdefault(islands[p.index], []).append(p)
    trees = {}
    for isl, polys in by_island.items():
        trees[isl] = BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in polys], all_triangles=True)
    whole = BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in cme.polygons], all_triangles=True)
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0].data
    for poly in me.polygons:
        c = mathutils.Vector((0, 0, 0))
        for vi in poly.vertices:
            c += me.vertices[vi].co
        c /= poly.loop_total
        loc, nrm, fi, dist = whole.find_nearest(c)
        isl = islands[fi]
        tree, polys = trees[isl], by_island[isl]
        for li in range(poly.loop_start, poly.loop_start + poly.loop_total):
            p = me.vertices[me.loops[li].vertex_index].co
            loc, nrm, k, d = tree.find_nearest(p)
            cp = polys[k]
            a, b, cc = [verts[v] for v in cp.vertices]
            ua, ub, uc = [mathutils.Vector(cuv[cp.loop_start + j].uv) for j in range(3)]
            v0, v1, v2 = b - a, cc - a, loc - a
            d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
            d20, d21 = v2.dot(v0), v2.dot(v1)
            den = d00 * d11 - d01 * d01
            if abs(den) < 1e-18:
                uv[li].uv = ua
                continue
            bv = (d11 * d20 - d01 * d21) / den
            bw = (d00 * d21 - d01 * d20) / den
            uv[li].uv = ua * (1 - bv - bw) + ub * bv + uc * bw


def repack_uvs(ob):
    """The sculpt's UVs span 9x4 UDIM tiles; pack them into one 0..1 atlas (uniform texel density)."""
    deselect()
    set_active(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(udim_source='ACTIVE_UDIM', rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    a = np.array([tuple(l.uv) for l in ob.data.uv_layers[0].data])
    log('uv range after pack', a.min(0), a.max(0))


def tgt_tail_vis(bone):
    b = base_of(bone)
    th = tgt_joint(bone)
    s = side_of(bone)
    if b == 'head':
        return th + np.array([0, 0, 0.2])
    if b in ('fingers', 'index'):
        return th + np.array([0, 0, -0.07])
    if b == 'toe':
        return th + np.array([0, -0.05, 0])
    return tgt_joint(CHILD[b] + s)


def bake(low, hi, size, kind, li):
    sc = bpy.context.scene
    name = f'{SEX}_lod{li}_{"normal" if kind == "NORMAL" else "ao"}'
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    mat.node_tree.nodes.active = node
    low.data.materials.clear()
    low.data.materials.append(mat)
    b = sc.render.bake
    b.use_selected_to_active = True
    b.cage_extrusion = 0.012
    b.max_ray_distance = 0.05
    b.margin = 16 if size >= 1024 else 8
    b.margin_type = 'EXTEND'
    b.use_clear = True
    b.normal_space = 'TANGENT'
    sc.cycles.samples = 1 if kind == 'NORMAL' else (24 if size >= 2048 else 48)
    deselect()
    hi.select_set(True)
    set_active(low)
    if kind == 'NORMAL':
        bpy.ops.object.bake(type='NORMAL')
    else:
        bpy.ops.object.bake(type='AO')
    path = os.path.join(WORK, f'{name}.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return path


def bake_ao(hi):
    sc = bpy.context.scene
    size = MAP_SIZE[0]
    img = bpy.data.images.new(f'{SEX}_ao', size, size, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new('ao')
    mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    mat.node_tree.nodes.active = node
    hi.data.materials.clear()
    hi.data.materials.append(mat)
    b = sc.render.bake
    b.use_selected_to_active = False
    b.margin = 16
    b.margin_type = 'EXTEND'
    b.use_clear = True
    sc.cycles.samples = 48
    # the LODs and the cage coincide with this mesh: keep them out of the rays
    for o in sc.objects:
        if o is not hi:
            o.hide_render = True
    deselect()
    set_active(hi)
    bpy.ops.object.bake(type='AO')
    for o in sc.objects:
        o.hide_render = False
    path = os.path.join(WORK, f'{SEX}_ao_2048.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    for n in (1024, 512):
        img.scale(n, n)
        img.filepath_raw = os.path.join(WORK, f'{SEX}_ao_{n}.png')
        img.save()


def make_eyes(bt):
    """Two UV spheres at the sculpt's eye positions, posed with the head bone, skinned to 'head'."""
    ec = v3(LM['eyeL'])
    Ft, k, sh_, th = bt['head']
    Fs = FS['head']
    centers = []
    for sx in (1, -1):
        p = ec * np.array([sx, 1, 1])
        q = th + ((p - sh_) @ Fs * k) @ Ft.T
        centers.append(q)
    radius = 0.0125 * K * float(k[1])
    bm = bmesh.new()
    for c in centers:
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=radius,
                                  matrix=mathutils.Matrix.Translation(mathutils.Vector(c)))
    me = bpy.data.meshes.new('eyes')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('eyes', me)
    bpy.context.scene.collection.objects.link(ob)
    g = ob.vertex_groups.new(name='head')
    g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    return ob, centers, radius


def export_glb(garm, lods, eyes):
    deselect()
    for o in [garm] + lods + [eyes]:
        o.select_set(True)
    path = os.path.join(OUT_GLB, f'{SEX}.glb')
    sc = bpy.context.scene
    for o in lods:
        o.data.materials.clear()
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
              export_skins=True, export_tangents=True, export_normals=True, export_texcoords=True,
              export_materials='NONE', export_image_format='NONE', export_yup=True,
              export_animations=False, export_morph=False, export_cameras=False, export_lights=False,
              export_all_influences=False)
    bpy.ops.export_scene.gltf(**kw)
    log('exported', path, os.path.getsize(path) // 1024, 'KB')


main()
