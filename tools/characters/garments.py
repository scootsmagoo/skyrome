"""
Bakes the draped garments of the realistic bodies by cloth simulation (docs/modules/avatar-real.md, "Baked cloth").

    node tools/characters/garments.mjs [male|female] [--only=toga,stola] [--preview]   (everything, in parallel)
    Blender -b --python tools/characters/garments.py -- <sex> --only=<id> [--preview] [--keep | --no-export | --export-only]
        [--frames=N] [--set=bending=20,mass=0.4,res=0.016,...] [--tag=_x]   (one garment; tuning)

For each garment of a sex:
  1. the reference body (public/models/people/<sex>.glb, LOD 0, already in the game's bind pose) is the collider;
     an arm the cloth passes under is swung out of the way first (the bind pose has the arms against the torso);
  2. the garment is laid out as its flat cloth pattern (a grid in metres: u across, v down from the top edge),
     placed loosely around the body, and its fixed parts pinned to the body (the belt line of a skirt, the
     toga's line over the left shoulder, the fibula of a sagum...). The flat pattern is the cloth's rest shape
     (rest_shape_key), so the sim pulls the cloth to its true lengths and gathers where the pins are closer
     than the cloth is wide;
  3. Blender's cloth solver settles it under gravity with body and self collision (wool: heavy and thick, broad
     soft folds; linen: light, finer folds);
  4. the settled cloth is cleaned (seams welded), per-vertex ambient occlusion is ray-traced against body and
     cloth, LOD 1 and 2 are collapse-decimated from it, hems get a turned rim, and everything goes into one GLB per
     sex: meshes `<garment>_lod<k>` with
        TEXCOORD_0  pattern coordinates (metres on the flat cloth: weave direction, clavi)
        TEXCOORD_1  x: distance to the nearest bordered edge (m, the praetexta band, trims, hems), y: occlusion
        TEXCOORD_2  x: part id (weights policy at runtime, see real/garments/fit.ts), y: 1 on the hem rim
     in the reference bind pose (game space after the exporter's y-up conversion; glTF stores v as 1 - v).
     Garments worn over another (UNDER: a cloak over the tunic, the palla over the stola) are simulated over its
     settled cloth, so the layers never cross.
  5. with --preview, workbench renders (front, side, back, three-quarter) go to .cache/garments/.

The runtime (src/actors/avatar/real/garments/baked.ts, bind.ts, fit.ts) binds every vertex to the reference body's surface and
re-evaluates it on each person's morphed body, transfers skin weights, colours and hides the covered skin.
"""
import bpy, bmesh, mathutils
import numpy as np
import json, math, os, sys, time
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _common import ROOT, args as cli_args

A = cli_args()
SEXES = [a for a in A if a in ('male', 'female')] or ['male', 'female']
ONLY = next((a.split('=', 1)[1].split(',') for a in A if a.startswith('--only=')), None)
PREVIEW = '--preview' in A
FRAMES_OVERRIDE = next((int(a.split('=', 1)[1]) for a in A if a.startswith('--frames=')), None)
# Tuning: --set=mass=0.1,bending=0.3,quality=12 overrides the material of every garment; --tag=x names the previews.
SET = {k: float(v) for k, v in (kv.split('=') for a in A if a.startswith('--set=') for kv in a[6:].split(','))}
TAG = next((a.split('=', 1)[1] for a in A if a.startswith('--tag=')), '')
NO_EXPORT = '--no-export' in A
KEEP = '--keep' in A
EXPORT_ONLY = '--export-only' in A
# --relod: rebuild the LODs (and rims) from the settled cloth kept in .cache/garments/<sex>_<id>.blend, no simulation.
RELOD = '--relod' in A
KIND = {'toga': 'wool', 'toga_velata': 'wool', 'palla': 'wool', 'paenula': 'wool_light', 'sagum': 'wool', 'lacerna': 'wool_light',
        'stola': 'linen', 'tunic_short': 'tunic', 'tunic_knee': 'tunic', 'tunic_long': 'tunic'}
RES = SET.get('res', 0.012)
OUT = os.path.join(ROOT, 'public', 'models', 'garments')
WORK = os.path.join(ROOT, '.cache', 'garments')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

RIGS = json.load(open(os.path.join(HERE, 'rigs.json')))
BONES = RIGS['bones']
BI = {n: i for i, n in enumerate(BONES)}
ARM = ['upperArm', 'forearm', 'hand', 'fingers', 'index']
NO_BORDER = 9.0  # border distance written where an edge carries no border

T0 = time.time()
RNG = np.random.default_rng(113)
# Settled cloth of the garment simulated under the current one (Hull clears it too).
UNDER_PTS = None


def log(*a):
    print(f'[garments {time.time() - T0:6.1f}s]', *a, flush=True)


def V(*a):
    return mathutils.Vector(a)


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------------------------------------- the body

class Body:
    """The reference body in the bind pose (Blender axes: x = the figure's left, -y = front, z = up)."""

    def __init__(self, sex):
        self.sex = sex
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', 'people', f'{sex}.glb'))
        ob = bpy.data.objects[f'{sex}_lod0']
        names = {g.index: g.name for g in ob.vertex_groups}
        me = ob.data
        n = len(me.vertices)
        self.W = np.zeros((n, len(BONES)))
        for v in me.vertices:
            for g in v.groups:
                nm = names[g.group]
                if nm in BI:
                    self.W[v.index, BI[nm]] += g.weight
        # A clean, unparented copy without shape keys or modifiers.
        if me.shape_keys:
            ob.shape_key_clear()
        ob.modifiers.clear()
        ob.parent = None
        for o in list(bpy.data.objects):
            if o != ob:
                bpy.data.objects.remove(o, do_unlink=True)
        ob.name = 'body'
        ob.vertex_groups.clear()
        for p in me.polygons:
            p.use_smooth = True
        self.ob = ob
        self.co = np.array([v.co[:] for v in me.vertices])
        R = RIGS['rigs'][sex]
        # Joints in Blender axes.
        self.J = {b: np.array([R['joints'][b][0], -R['joints'][b][2], R['joints'][b][1]]) for b in BONES}
        self.s = R['s']
        self.height = R['height']
        self.headH = R['headH']
        J = self.J
        hip = J['thighL'][2]
        shoulder = J['upperArmL'][2]
        waist = hip + (shoulder - hip) * 0.31
        s = self.s
        # The game's levels() (src/actors/avatar/build/body.ts).
        self.L = dict(
            s=s, hip=hip, shoulder=shoulder, waist=waist, belt=waist + 0.005 * s, knee=J['shinL'][2], ankle=J['footL'][2],
            crotch=hip - 0.075 * s, chest=J['chest'][2] + 0.07 * s, armpit=shoulder - 0.085 * s, neck=J['neck'][2],
            neckBase=max(shoulder + 0.075 * s, self.height - self.headH - 0.022 * s), hemShort=hip - 0.2 * s,
            hemKnee=J['shinL'][2] + 0.05 * s, hemLong=J['footL'][2] + 0.035 * s, elbow=J['forearmL'][2], wrist=J['handL'][2],
        )
        self.bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
        torso = self.weight(['hips', 'spine', 'chest', 'neck', 'shoulderL', 'shoulderR'] + [b + 'L' for b in ('thigh', 'shin', 'foot', 'toe')] + [b + 'R' for b in ('thigh', 'shin', 'foot', 'toe')])
        self.torso_bvh = self._bvh_subset(torso > 0.5)

    def weight(self, bones):
        return sum(self.W[:, BI[b]] for b in bones)

    def _bvh_subset(self, keep):
        me = self.ob.data
        tris = []
        for p in me.polygons:
            vs = list(p.vertices)
            if all(keep[i] for i in vs):
                for k in range(1, len(vs) - 1):
                    tris.append((vs[0], vs[k], vs[k + 1]))
        return BVHTree.FromPolygons([tuple(c) for c in self.co], tris)

    def axis_y(self, z):
        """y of the body's vertical axis at height z (mid-range of the torso/legs)."""
        m = (np.abs(self.co[:, 2] - z) < 0.012) & (self.weight([b + s for b in ARM for s in 'LR']) < 0.5)
        if not m.any():
            return 0.0
        return float((self.co[m, 1].min() + self.co[m, 1].max()) / 2)

    def surface(self, z, th, torso=True, out=0.0):
        """Point on the body at height z in direction th (0 = the figure's left, 90 deg = front), pushed `out` metres."""
        d = V(math.cos(th), -math.sin(th), 0)
        yc = self.axis_y(z)
        far = V(0, yc, z) + d * 1.0
        hit = (self.torso_bvh if torso else self.bvh).ray_cast(far, -d, 1.0)
        if hit[0] is None:
            return V(0, yc, z) + d * 0.05 + d * out
        return hit[0] + d * out

    def nearest(self, p, out=0.0, torso=False):
        loc, nrm, _, _ = (self.torso_bvh if torso else self.bvh).find_nearest(mathutils.Vector(p))
        return loc + nrm * out, nrm

    def collider(self, name, abduct=None, inflate=0.0, thickness=0.004, friction=5.0, inflate_head=0.0):
        """A collision copy of the body; `abduct` = {'L': deg, 'R': deg} swings that arm out of the cloth's way."""
        me = self.ob.data.copy()
        P = self.co.copy()
        for side, deg in (abduct or {}).items():
            if not deg:
                continue
            w = self.weight([b + side for b in ARM]) + 0.35 * self.W[:, BI['shoulder' + side]]
            w = np.clip(w, 0, 1)
            j = self.J['upperArm' + side]
            phi = math.radians(-deg if side == 'L' else deg)
            R = np.array(mathutils.Matrix.Rotation(phi, 3, 'Y'))
            q = (P - j) @ R.T + j
            P = P + w[:, None] * (q - P)
        if inflate or inflate_head:
            nrm = np.array([v.normal[:] for v in self.ob.data.vertices])
            # A hood rests on the hair, not on the scalp.
            P = P + nrm * (inflate + inflate_head * np.clip(self.W[:, BI['head']], 0, 1))[:, None]
        me.vertices.foreach_set('co', P.ravel())
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.modifiers.new('Collision', 'COLLISION')
        c = ob.collision
        c.thickness_outer = thickness
        c.thickness_inner = 0.02
        c.cloth_friction = friction
        c.damping = 0.6
        ob.hide_render = True
        return ob


# ---------------------------------------------------------------------------------------------- cloth pieces

class Piece:
    """A rectangular grid of cloth (u across, v down from the top edge), possibly a tube (wrap) sewn at u = W.

    place(u, v) -> initial 3D point; pin(u, v) -> pin weight 0..1 (pinned points must be placed at their target);
    length(u) -> the cloth's length down column u (a curved lower edge); border(u, v) -> distance to the nearest
    bordered edge (m) or None; us/vs: explicit column/row positions (else uniform with spacing `res`)."""

    def __init__(self, name, part, W, H, place, res=0.02, pin=None, length=None, border=None, wrap=False, us=None, vs=None, outward=None, vmap=None, flat=None):
        self.name = name
        self.part = part
        self.W = W
        self.H = H
        self.wrap = wrap
        nu = max(2, int(round(W / res)) + 1)
        nv = max(2, int(round(H / res)) + 1)
        self.us = np.array(us if us is not None else np.linspace(0, W, nu))
        self.ts = np.array(vs if vs is not None else np.linspace(0, 1, nv))  # 0..1 down each column
        self.place = place
        self.pin = pin or (lambda u, v: 0.0)
        self.length = length or (lambda u: H)
        self.border = border or (lambda u, v: None)
        self.outward = outward
        # Cloth length down column u at row parameter t (0 top .. 1 hem).
        self.vmap = vmap or (lambda u, t: t * self.length(u))
        # The flat pattern (rest shape) position of (u, v); default a rectangle.
        self.flat = flat or (lambda u, v: (u, -v))


class Cloth:
    """Pieces merged into one cloth object (self collision covers the contacts between pieces)."""

    def __init__(self, name):
        self.name = name
        self.verts = []      # initial 3D
        self.flat = []       # rest (flat pattern, pieces side by side)
        self.pat = []        # pattern (u, v) metres
        self.pins = []
        self.border = []
        self.part = []
        self.faces = []
        self.sew = []        # (i, j) pairs to weld after the sim
        self.offset_x = 0.0
        self.pieces = []

    def add(self, pc: Piece):
        base = len(self.verts)
        nu = len(pc.us)
        nv = len(pc.ts)
        for j in range(nv):
            for i in range(nu):
                u = pc.us[i]
                v = pc.vmap(u, pc.ts[j])
                p = pc.place(u, v)
                if pc.pin(u, v) <= 0:
                    # A few millimetres of noise break the symmetry, so folds form where the cloth wants them.
                    p = p + V(*(RNG.normal(0, 0.001, 3)))
                self.verts.append(tuple(p))
                fx, fy = pc.flat(u, v)
                self.flat.append((self.offset_x + fx, fy, 0.0))
                self.pat.append((u, v))
                self.pins.append(float(pc.pin(u, v)))
                b = pc.border(u, v)
                self.border.append(NO_BORDER if b is None else float(b))
                self.part.append(pc.part)
        idx = lambda i, j: base + j * nu + i
        fs = []
        for j in range(nv - 1):
            for i in range(nu - 1):
                fs.append([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)])
        # Wind each piece so its normals look away from the body: vote with the outward hint.
        P = np.array(self.verts)
        vote = 0.0
        for f in fs[:: max(1, len(fs) // 400)]:
            a, b, c = P[f[0]], P[f[1]], P[f[2]]
            nrm = np.cross(b - a, c - a)
            ctr = (a + b + c) / 3
            out = pc.outward(ctr) if pc.outward else np.array([ctr[0], ctr[1], 0.0])
            vote += float(np.dot(nrm, out))
        if vote < 0:
            fs = [f[::-1] for f in fs]
        self.faces.extend(fs)
        if pc.wrap:
            # The last column is sewn to the first.
            for j in range(nv):
                self.sew.append((idx(0, j), idx(nu - 1, j)))
        self.offset_x = max(c[0] for c in self.flat) + 0.5
        self.pieces.append((pc, base, nu, nv))
        return base

    def build(self):
        me = bpy.data.meshes.new(self.name)
        sew_edges = [(a, b) for a, b in self.sew]
        me.from_pydata(self.verts, sew_edges, self.faces)
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        for p in me.polygons:
            p.use_smooth = True
        # Rest shape: the flat pattern.
        ob.shape_key_add(name='Basis')
        flat = ob.shape_key_add(name='flat')
        for i, c in enumerate(self.flat):
            flat.data[i].co = c
        flat.value = 0.0
        # Sewn columns sit on top of each other in 3D and a pattern-width apart on the flat key: the loose edges
        # between them are sewing springs (rest length zero), the faces keep their flat rest shape.
        g = ob.vertex_groups.new(name='pin')
        for i, w in enumerate(self.pins):
            if w > 0:
                g.add([i], w, 'REPLACE')
        uv = me.uv_layers.new(name='pattern')
        at = me.uv_layers.new(name='attr')
        pt = me.uv_layers.new(name='part')
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uv.data[li].uv = self.pat[vi]
                at.data[li].uv = (self.border[vi], 1.0)
                pt.data[li].uv = (self.part[vi], 0.0)
        self.ob = ob
        return ob


MATERIALS = {
    # Heavy wool (toga, palla, cloaks): broad soft folds.
    'wool': dict(mass=0.3, tension=22, compression=22, shear=8, bending=15, air=6.0, damping=12, thick=0.006, smooth=7),
    # The toga's lower wrap: the same wool, hanging in long soft pipes.
    'wool_wrap': dict(mass=0.4, tension=22, compression=22, shear=8, bending=4, air=3.0, damping=12, thick=0.006, smooth=3),
    # Light wool (lacerna).
    'wool_light': dict(mass=0.25, tension=20, compression=20, shear=7, bending=8, air=6.0, damping=12, thick=0.004, smooth=3),
    # Light wool / wool blend (tunics).
    'tunic': dict(mass=0.3, tension=16, compression=16, shear=5, bending=0.6, air=1.2, damping=8, thick=0.004, smooth=2),
    # Linen (stola): fine folds.
    'linen': dict(mass=0.28, tension=16, compression=16, shear=5, bending=0.35, air=1.0, damping=8, thick=0.003, smooth=1),
}


def simulate(ob, kind, frames=90, quality=8, self_coll=True, pin_stiffness=2.0, shrink=0.0, air=None):
    m = dict(MATERIALS[kind])
    if air is not None:
        m['air'] = air
    m.update({k: v for k, v in SET.items() if k in m})
    quality = int(SET.get('quality', quality))
    mod = ob.modifiers.new('Cloth', 'CLOTH')
    st = mod.settings
    st.quality = quality
    st.mass = m['mass'] * 0.02 / 0.02
    st.air_damping = m['air']
    st.tension_stiffness = m['tension']
    st.compression_stiffness = m['compression']
    st.shear_stiffness = m['shear']
    st.bending_stiffness = m['bending']
    st.tension_damping = m['damping']
    st.compression_damping = m['damping']
    st.shear_damping = m['damping']
    st.bending_damping = 0.5
    st.bending_model = 'ANGULAR'
    st.vertex_group_mass = 'pin'
    st.pin_stiffness = pin_stiffness
    st.rest_shape_key = ob.data.shape_keys.key_blocks['flat']
    st.use_sewing_springs = True
    st.sewing_force_max = 20.0
    st.shrink_min = shrink
    cs = mod.collision_settings
    cs.use_collision = True
    cs.distance_min = 0.004
    cs.collision_quality = 4
    cs.use_self_collision = self_coll
    cs.self_distance_min = 0.003
    cs.self_friction = SET.get('friction', 1.5)
    cs.friction = SET.get('friction', 1.5)
    sc = bpy.context.scene
    F = FRAMES_OVERRIDE or frames
    sc.frame_start = 1
    sc.frame_end = F
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = F
    t = time.time()
    for f in range(1, F + 1):
        sc.frame_set(f)
        if f % 20 == 0:
            log(f'  {ob.name}: frame {f}/{F} ({time.time() - t:.0f}s)')
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    out = bpy.data.objects.new(ob.name + '_sim', me)
    sc.collection.objects.link(out)
    return out


def weld(ob, pairs):
    if not pairs:
        return
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    # Sewing edges are loose: drop them, then merge each pair onto its partner's midpoint.
    for e in [e for e in bm.edges if not e.link_faces]:
        bm.edges.remove(e)
    tm = {}
    for a, b in pairs:
        va, vb = bm.verts[a], bm.verts[b]
        va.co = (va.co + vb.co) / 2
        tm[vb] = va
    bmesh.ops.weld_verts(bm, targetmap=tm)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


# ---------------------------------------------------------------------------------------------- post-processing

def triangulate(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()


def relax(ob, passes):
    """Smooth away the solver's grid-scale crinkles (a few Laplacian passes that keep the volume: the big folds
    stay). Boundary vertices (hems) are kept."""
    if passes <= 0:
        return
    m = ob.modifiers.new('Relax', 'LAPLACIANSMOOTH')
    m.iterations = passes
    m.lambda_factor = 0.6
    m.lambda_border = 0.0
    m.use_volume_preserve = True
    m.use_normalized = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def ambient_occlusion(ob, others, rays=48, dist=0.25):
    """Per-vertex occlusion of the cloth by itself and the body (cosine-weighted hemisphere, both faces' max)."""
    me = ob.data
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o, dg) for o in others] + [BVHTree.FromObject(ob, dg)]
    rng = np.random.default_rng(7)
    # Fixed cosine-weighted directions around +z.
    u1 = rng.random(rays)
    u2 = rng.random(rays)
    r = np.sqrt(u1)
    phi = 2 * math.pi * u2
    D = np.stack([r * np.cos(phi), r * np.sin(phi), np.sqrt(1 - u1)], 1)
    ao = np.zeros(len(me.vertices))
    for v in me.vertices:
        n = v.normal
        best = 0.0
        for sgn in (1, -1):
            nn = n * sgn
            t = nn.orthogonal().normalized()
            b = nn.cross(t)
            o = v.co + nn * 0.0025
            hit = 0
            for d in D:
                dirv = t * d[0] + b * d[1] + nn * d[2]
                for tr in trees:
                    if tr.ray_cast(o, dirv, dist)[0] is not None:
                        hit += 1
                        break
            best = max(best, 1 - hit / rays)
        ao[v.index] = best
    # Smooth over the mesh: a vertex sandwiched between two layers bakes to 0; its neighbours say how dark the
    # crease really looks.
    nb = [[] for _ in range(len(me.vertices))]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    for _ in range(3):
        ao = np.array([0.5 * ao[i] + 0.5 * (np.mean(ao[n]) if n else ao[i]) for i, n in enumerate(nb)])
    return ao


def set_attr_uv(ob, layer, comp, values):
    me = ob.data
    uv = me.uv_layers[layer]
    for li, lp in enumerate(me.loops):
        c = uv.data[li].uv
        if comp == 0:
            uv.data[li].uv = (values[lp.vertex_index], c[1])
        else:
            uv.data[li].uv = (c[0], values[lp.vertex_index])


def decimate_copy(ob, name, tris, keep_hems=1.0):
    """Collapse-decimate a copy of `ob` to about `tris` triangles; boundary vertices (hems) weighted to go last."""
    me = ob.data.copy()
    o2 = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o2)
    cur = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris < cur:
        bnd = set()
        bm = bmesh.new()
        bm.from_mesh(me)
        for e in bm.edges:
            if e.is_boundary:
                bnd.add(e.verts[0].index)
                bnd.add(e.verts[1].index)
        bm.free()
        g = o2.vertex_groups.new(name='hem')
        g.add(list(bnd), 1.0, 'REPLACE')
        ratio = tris / cur
        for _ in range(5):
            d = o2.modifiers.new('Dec', 'DECIMATE')
            d.decimate_type = 'COLLAPSE'
            d.ratio = ratio
            d.use_collapse_triangulate = True
            if keep_hems > 0:
                # Hems decimate last: a collapsed boundary turns a clean edge into a saw.
                d.vertex_group = 'hem'
                d.invert_vertex_group = True
                d.vertex_group_factor = keep_hems * 10.0
            dg = bpy.context.evaluated_depsgraph_get()
            ev = o2.evaluated_get(dg)
            got = len(ev.to_mesh().polygons)
            ev.to_mesh_clear()
            o2.modifiers.clear()
            if got <= tris * 1.06:
                break
            ratio *= tris / got
        d = o2.modifiers.new('Dec', 'DECIMATE')
        d.decimate_type = 'COLLAPSE'
        d.ratio = ratio
        d.use_collapse_triangulate = True
        if keep_hems > 0:
            d.vertex_group = 'hem'
            d.invert_vertex_group = True
            d.vertex_group_factor = keep_hems * 10.0
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(o2.evaluated_get(dg))
        o2.modifiers.clear()
        o2.vertex_groups.clear()
        o2.data = me2
    triangulate(o2)
    return o2


def add_rim(ob, thick):
    """A turned hem: every boundary edge gets a narrow strip folded back toward the body (inside the cloth)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uvl = [bm.loops.layers.uv[n] for n in ('pattern', 'attr', 'part')]
    bnd = [e for e in bm.edges if e.is_boundary]
    vmap = {}
    for e in bnd:
        for v in e.verts:
            if v in vmap:
                continue
            nv = bm.verts.new(v.co - v.normal * thick)
            vmap[v] = nv
    for e in bnd:
        a, b = e.verts
        f0 = e.link_faces[0]
        # Keep the winding consistent with the cloth face the edge belongs to.
        la = next(l for l in f0.loops if l.vert == a)
        if la.link_loop_next.vert != b:
            a, b = b, a
        try:
            f = bm.faces.new((b, a, vmap[a], vmap[b]))
        except ValueError:
            continue
        for l in f.loops:
            src = l.vert if l.vert in (a, b) else next(k for k, vv in vmap.items() if vv == l.vert)
            sl = next((x for x in src.link_loops if x.face != f), None)
            for k, lay in enumerate(uvl):
                if sl is not None:
                    l[lay].uv = sl[lay].uv
            l[uvl[2]].uv = (l[uvl[2]].uv[0], 1.0 if l.vert not in (a, b) else 0.0)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True


# ---------------------------------------------------------------------------------------------- preview

def preview(body_ob, objs, path, color=(0.86, 0.84, 0.78)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'OBJECT'
    sh.show_cavity = True
    sh.cavity_type = 'WORLD'
    sh.show_shadows = True
    sh.show_specular_highlight = False
    sc.display.shadow_shift = 0.1
    sc.render.resolution_x = 520
    sc.render.resolution_y = 900
    sc.render.film_transparent = False
    body_ob.hide_render = False
    body_ob.color = (0.75, 0.55, 0.42, 1)
    for o in objs:
        o.hide_render = False
        o.color = (*color, 1)
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = 60
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    shots = []
    for nm, ang in (('front', 90), ('side', 0), ('back', 270), ('q', 135)):
        a = math.radians(ang)
        d = 4.2
        cam.location = (math.cos(a) * d, -math.sin(a) * d, 0.95)
        cam.rotation_euler = mathutils.Euler((math.radians(90), 0, math.radians(90 - ang)), 'XYZ')
        p = f'{path}_{nm}.png'
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        shots.append(p)
    bpy.data.objects.remove(cam, do_unlink=True)
    return shots


# ---------------------------------------------------------------------------------------------- garments

ANG = np.linspace(0, 2 * math.pi, 720, endpoint=False)


def hull_radius(body, z, yc, band=0.012, exclude_arms=True):
    """Radius (from the axis at y = yc) of the convex hull of the body's slab at height z, per angle in ANG."""
    m = np.abs(body.co[:, 2] - z) < band
    if exclude_arms:
        m &= body.weight([b + s for b in ARM for s in 'LR']) < 0.5
    P = body.co[m][:, :2] - np.array([0.0, yc])
    if len(P) < 3:
        return np.full(len(ANG), 0.05)
    # Support function of the hull in direction a, then the hull's radius along the ray a is approximated by the
    # support (fine for the round-ish sections of a body).
    dirs = np.stack([np.cos(ANG), -np.sin(ANG)], 1)
    return np.maximum(0.03, (P @ dirs.T).max(0))


def circ_smooth(r, k):
    if k <= 1:
        return r
    ker = np.ones(k) / k
    return np.convolve(np.concatenate([r[-k:], r, r[:k]]), ker, mode='same')[k:-k]


class Pleats:
    """The pleated outline cloth takes when `W` metres of it are gathered round a body: pattern u -> (angle, crest).
    The angle advances evenly; `crest` is a wave of `n` folds of uneven width and depth (seeded), so the folds
    look gathered by hand, not machine pleated. A row at height z puts u at radius rb(angle) + h * crest, with h
    solved so the row is W long (cloth at its rest width)."""

    def __init__(self, W, n, nu=1440, seed=1, irregular=0.45):
        self.W = W
        self.n = n
        rng = np.random.default_rng(seed)
        widths = 1 + irregular * (rng.random(n) * 2 - 1)
        self.knots = np.concatenate([[0.0], np.cumsum(widths) / widths.sum()]) * 2 * math.pi
        self.amp = 1 + irregular * (rng.random(n) * 2 - 1)
        self.us = np.linspace(0, W, nu + 1)
        self.a = self.us / W * 2 * math.pi
        self.crest = np.array([self.crest_at(a) for a in self.a])

    def crest_at(self, a):
        a = a % (2 * math.pi)
        k = int(np.clip(np.searchsorted(self.knots, a, side='right') - 1, 0, self.n - 1))
        f = (a - self.knots[k]) / (self.knots[k + 1] - self.knots[k])
        # A rounded crest (cloth folds are round, not knife-edged).
        return self.amp[k] * math.sin(math.pi * f) ** 1.5

    def depth(self, rb, target=None):
        """Fold depth making the path rb(a) + h * crest exactly `target` (default W) long."""
        target = target or self.W
        r0 = np.interp(self.a, np.append(ANG, 2 * math.pi), np.append(rb, rb[0]))

        def length(h):
            r = r0 + h * self.crest
            x = r * np.cos(self.a)
            y = r * np.sin(self.a)
            return float(np.sum(np.hypot(np.diff(x), np.diff(y))))

        if length(0.0) >= target:
            return 0.0
        lo, hi = 0.0, 0.3
        for _ in range(40):
            mid = (lo + hi) / 2
            if length(mid) < target:
                lo = mid
            else:
                hi = mid
        return hi

    def point(self, u, rb, h, z, yc):
        a = u / self.W * 2 * math.pi
        r = float(np.interp(a, np.append(ANG, 2 * math.pi), np.append(rb, rb[0]))) + h * self.crest_at(a)
        return V(r * math.cos(a), yc - r * math.sin(a), z)


def skirt_piece(body, name, part, top, hem, fullness, blouse=0.0, res=None, border=None, front_drop=0.0, back_drop=0.015,
                out=0.012, pleat=0.06, clear=0.015, taper=0.0, top_fullness=None):
    """A tube of cloth gathered at a belt line (`top`) in pleats, hanging to `hem`; `blouse` (m) of extra cloth above
    the belt is pinned a few cm higher and starts folded down over the belt (the tunic's kolpos).
    u = 0 is the figure's left side (the seam), u grows toward the front."""
    res = res or RES
    s = body.s
    yb = body.axis_y(top)
    belt_r = circ_smooth(hull_radius(body, top, yb), 9)
    belt_len = float(np.sum(np.hypot(np.diff(np.append(belt_r, belt_r[0]) * np.cos(np.append(ANG, 0))),
                                     np.diff(np.append(belt_r, belt_r[0]) * np.sin(np.append(ANG, 0))))))
    # With `top_fullness` the skirt is cut as a cone (a fan of cloth): lightly gathered at the belt, `fullness`
    # times the belt at the hem, so it hangs in folds that open downward instead of deep pleats at the waist.
    W = belt_len * (top_fullness or fullness)
    Wb = belt_len * fullness
    pl = Pleats(W, max(10, int(round(belt_len / pleat))))
    up = 0.05 * s if blouse > 0 else 0.0
    pinv = blouse + up
    H0 = top - hem
    H = pinv + H0
    flat = None
    if Wb > W * 1.01:
        Phi = (Wb - W) / H0
        R1 = W / Phi

        def flat(u, v):
            ph = (u / W - 0.5) * Phi
            r = R1 + max(0.0, v - pinv)
            return (r * math.sin(ph), -r * math.cos(ph) - min(v, pinv))
    # Rows hang at the largest outline at or above them (cloth falls from the hips), all about the belt's axis
    # so the pleats run straight down.
    zs = np.linspace(top, hem - 0.06, 48)
    rows = []
    cur = belt_r + out
    for z in zs:
        here = circ_smooth(hull_radius(body, z, yb), 21) + clear
        cur = np.maximum(cur, here)
        # `taper`: soft cloth falls in toward the legs below the hips instead of hanging as a straight bell.
        r = cur * (1 - taper) + np.maximum(here, belt_r + out) * taper
        rows.append((z, r, pl.depth(r, W + (Wb - W) * (top - z) / H0)))
    belt = (top, belt_r + out, pl.depth(belt_r + out))
    if blouse > 0:
        tr = circ_smooth(hull_radius(body, top + up, body.axis_y(top + up)), 9) + out * 0.5
        topr = (top + up, tr, pl.depth(tr))

    def length(u):
        a = 2 * math.pi * u / W
        return H0 + back_drop * s * max(0.0, -math.sin(a)) + front_drop * max(0.0, math.sin(a))

    def vmap(u, t):
        v = t * H
        if v <= pinv + 1e-9:
            return v
        return pinv + (v - pinv) / H0 * length(u)

    def row_at(z):
        k = (top - z) / (top - zs[-1]) * (len(zs) - 1)
        k0 = int(np.clip(math.floor(k), 0, len(zs) - 1))
        k1 = min(len(zs) - 1, k0 + 1)
        f = float(np.clip(k - k0, 0, 1))
        return rows[k0][1] * (1 - f) + rows[k1][1] * f, rows[k0][2] * (1 - f) + rows[k1][2] * f

    def place(u, v):
        p_belt = pl.point(u, belt[1], belt[2], top, yb)
        if blouse > 0 and v <= pinv + 1e-9:
            p_top = pl.point(u, topr[1], topr[2], top + up, yb)
            d = V(p_top.x, p_top.y - yb, 0).normalized()
            drop = up + (pinv - up) / 2 * 0.8
            dn = (pinv - up) / 2 + up
            if v <= dn:
                t = v / dn
                return p_top + d * (0.008 + 0.012 * t) + V(0, 0, -t * drop)
            t = (v - dn) / (pinv - dn)
            low = p_top + d * 0.02 + V(0, 0, -drop)
            return low.lerp(p_belt + d * 0.003, t)
        w = v - pinv
        z = top - w
        rb, h = row_at(z)
        return pl.point(u, rb, h, z, yb)

    def pin(u, v):
        if abs(v - pinv) < 1e-6:
            return 1.0
        if blouse > 0 and v <= 1e-6:
            return 1.0
        return 0.0

    nu = max(24, int((W + Wb) / 2 / res))
    us = np.linspace(0, W, nu + 1)
    nv = int(round(H / res)) + 1
    ts = np.linspace(0, 1, nv)
    if blouse > 0:
        k = int(np.argmin(np.abs(ts * H - pinv)))
        ts[k] = pinv / H
    return Piece(name, part, W, H, place, pin=pin, length=length, border=border, wrap=True, us=us, vs=ts, vmap=vmap, flat=flat,
                 outward=lambda c: np.array([c[0], c[1] - yb, 0.0]))


def blouse_piece(body, name, part, belt, fullness=1.3, up=0.035, drop=0.03, res=None, out=0.012):
    """The kolpos: tunic cloth pulled up through the belt, hanging over it. A short gathered tube pinned a few cm
    above the belt (on the painted tunic) whose free lower edge falls over the belt."""
    res = res or RES
    s = body.s
    top = belt + up * s
    yb = body.axis_y(top)
    tr = circ_smooth(hull_radius(body, top, yb), 9)
    perim = float(np.sum(np.hypot(np.diff(np.append(tr, tr[0]) * np.cos(np.append(ANG, 0))), np.diff(np.append(tr, tr[0]) * np.sin(np.append(ANG, 0))))))
    W = perim * fullness
    pl = Pleats(W, max(5, int(round(perim / 0.16))), seed=7, irregular=0.6)
    H = (up + drop) * s + 0.02 * s
    ring = tr + out * 0.6
    h0 = pl.depth(ring)
    low = circ_smooth(hull_radius(body, belt, body.axis_y(belt)), 9) + out + 0.012

    def place(u, v):
        p0 = pl.point(u, ring, h0, top, yb)
        if v <= 1e-9:
            return p0
        # Out over the belt, then down.
        p1 = pl.point(u, low, pl.depth(low), top - v, yb)
        k = smooth(0.0, 0.03, v)
        p = p0.lerp(p1, k)
        p.z = top - v * 0.9
        return p

    nu = max(24, int(W / res))
    return Piece(name, part, W, H, place, pin=lambda u, v: 1.0 if v <= 1e-9 else 0.0, wrap=True, us=np.linspace(0, W, nu + 1),
                 vs=np.linspace(0, 1, max(4, int(round(H / res)) + 1)), outward=lambda c: np.array([c[0], c[1] - yb, 0.0]))


class Curve:
    """A polyline through keypoints (Catmull-Rom), laid onto the body surface `out` metres off it, with arc-length
    lookup. Closed curves wrap."""

    def __init__(self, body, keys, closed=True, out=0.015, n=240, torso=False):
        K = np.array(keys, dtype=float)
        m = len(K)
        pts = []
        segs = m if closed else m - 1
        for i in range(segs):
            p0 = K[(i - 1) % m] if closed else K[max(0, i - 1)]
            p1 = K[i % m]
            p2 = K[(i + 1) % m]
            p3 = K[(i + 2) % m] if closed else K[min(m - 1, i + 2)]
            for t in np.linspace(0, 1, max(2, n // segs), endpoint=False):
                t2, t3 = t * t, t * t * t
                pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
        if not closed:
            pts.append(K[-1])
        P = []
        for p in pts:
            q, _ = body.nearest(p, out=out, torso=torso)
            P.append(np.array(q[:]))
        # Relax a little along the curve (projection kinks), then re-project.
        P = np.array(P)
        for _ in range(3):
            Q = P.copy()
            rng = range(len(P)) if closed else range(1, len(P) - 1)
            for i in rng:
                Q[i] = 0.25 * P[i - 1] + 0.5 * P[i] + 0.25 * P[(i + 1) % len(P)]
            P = np.array([np.array(body.nearest(q, out=out, torso=torso)[0][:]) for q in Q])
        self.P = P
        self.closed = closed
        seg = np.linalg.norm(np.diff(np.vstack([P, P[:1]]) if closed else P, axis=0), axis=1)
        self.cum = np.concatenate([[0.0], np.cumsum(seg)])
        self.L = float(self.cum[-1])

    def at(self, d):
        d = d % self.L if self.closed else min(max(d, 0.0), self.L)
        k = int(np.clip(np.searchsorted(self.cum, d, side='right') - 1, 0, len(self.cum) - 2))
        f = (d - self.cum[k]) / max(1e-9, self.cum[k + 1] - self.cum[k])
        a = self.P[k]
        b = self.P[(k + 1) % len(self.P)]
        return V(*(a + (b - a) * f))


class Hull:
    """Support radius of the body (and of cloth already simulated) per height slab and direction, about the axis:
    how far out a column of cloth must hang to clear everything below it."""

    def __init__(self, body, mask, extra=None, dz=0.02):
        self.dz = dz
        pts = body.co[mask]
        if extra is not None and len(extra):
            pts = np.vstack([pts, extra])
        if UNDER_PTS is not None:
            pts = np.vstack([pts, UNDER_PTS])
        self.zmin = float(pts[:, 2].min())
        nz = int((pts[:, 2].max() - self.zmin) / dz) + 2
        dirs = np.stack([np.cos(ANG), -np.sin(ANG)], 1)
        self.R = np.zeros((nz, len(ANG)))
        self.yc = np.array([body.axis_y(self.zmin + k * dz) for k in range(nz)])
        for k in range(nz):
            z = self.zmin + k * dz
            sl = pts[np.abs(pts[:, 2] - z) < dz * 0.75]
            if len(sl):
                self.R[k] = np.maximum(0.0, ((sl[:, :2] - np.array([0.0, self.yc[k]])) @ dirs.T).max(0))
        self.nz = nz

    def radius(self, z0, z1, a):
        """Largest support in direction a between heights z0 < z1."""
        k0 = int(np.clip((z0 - self.zmin) / self.dz, 0, self.nz - 1))
        k1 = int(np.clip((z1 - self.zmin) / self.dz, 0, self.nz - 1))
        i = int(round((a % (2 * math.pi)) / (2 * math.pi) * len(ANG))) % len(ANG)
        w = 6
        idx = [(i + d) % len(ANG) for d in range(-w, w + 1)]
        return float(self.R[min(k0, k1):max(k0, k1) + 1][:, idx].max())


def crest_fn(n, seed, irregular=0.45):
    rng = np.random.default_rng(seed)
    widths = 1 + irregular * (rng.random(n) * 2 - 1)
    knots = np.concatenate([[0.0], np.cumsum(widths) / widths.sum()])
    amp = 1 + irregular * (rng.random(n) * 2 - 1)

    def crest(s):
        s = min(max(s, 0.0), 1.0 - 1e-9)
        k = int(np.clip(np.searchsorted(knots, s, side='right') - 1, 0, n - 1))
        f = (s - knots[k]) / (knots[k + 1] - knots[k])
        return amp[k] * math.sin(math.pi * f) ** 1.5
    return crest


def drape_piece(body, name, part, curve, length, hull, gather=1.1, flare=1.7, clear=0.025, pleat=0.07, res=None,
                border=None, seed=3, slope=0.5, pin=None, extra_out=None, route=None):
    """Cloth hanging from a pinned curve (closed: a ring round the body; open: a strip). Its flat pattern is a
    fan (an annular sector, `flare` times wider at the deepest hem than at the top: the toga is a segment of a
    circle), so it hangs in cone folds; the top edge is `gather` times the curve's length (gathered).
    length(s) = cloth length down column s (0..1 across). Columns start hanging straight down at the radius that
    clears the hull below them; pleats make each row its rest width."""
    res = res or RES
    Lc = curve.L
    Wt = Lc * gather
    ss = np.linspace(0, 1, 200)
    Lmax = max(length(x) for x in ss)
    Wb = Wt * flare
    if flare > 1.001:
        Phi = (Wb - Wt) / Lmax
        R1 = Wt / Phi

        def flat(u, v):
            ph = (u / Wt - 0.5) * Phi
            r = R1 + v
            return (r * math.sin(ph), -r * math.cos(ph))
    else:
        def flat(u, v):
            return (u, -v)
    n = max(6, int(round(Lc / pleat)))
    crest = crest_fn(n, seed)
    nu = max(16, int(Wt * max(1.0, flare * 0.8) / res))
    us = np.linspace(0, Wt, nu + 1)
    Hm = Lmax
    nv = max(4, int(round(Hm / res)) + 1)
    ts = np.linspace(0, 1, nv)

    tops = {}
    routes = {}
    for u in us:
        sfrac = u / Wt
        T = curve.at(sfrac * Lc)
        yc = body.axis_y(T.z)
        d = V(T.x, T.y - yc, 0)
        if d.length < 1e-6:
            d = V(1, 0, 0)
        d.normalize()
        if extra_out is not None:
            d = (d + V(*extra_out(sfrac))).normalized()
        a = math.atan2(-d.y, d.x)
        L = length(sfrac)
        R = hull.radius(T.z - L, T.z, a) + clear
        r0 = math.hypot(T.x, T.y - yc)
        tops[u] = (T, d, max(0.0, R - r0), L)
        if route is not None:
            # A custom start for the column (a hood: up and back over the head), then straight down.
            w = route(sfrac, T, R)
            if w:
                pts = [T] + [V(*q) for q in w]
                seg = [(pts[k + 1] - pts[k]).length for k in range(len(pts) - 1)]
                routes[u] = (pts, seg)
                h = V(pts[-1].x - pts[0].x, pts[-1].y - pts[0].y, 0)
                if h.length > 1e-6:
                    tops[u] = (T, h.normalized(), tops[u][2], L)

    def base(u, v):
        T, d, dout, L = tops[u]
        if u in routes:
            pts, seg = routes[u]
            acc = 0.0
            for k, ln in enumerate(seg):
                if v <= acc + ln:
                    return pts[k].lerp(pts[k + 1], (v - acc) / max(ln, 1e-9))
                acc += ln
            return pts[-1] + V(0, 0, -(v - acc))
        cs = math.cos(math.atan(slope))
        vout = dout / cs
        if v <= vout:
            return T + d * (v * cs) + V(0, 0, -v * math.sin(math.atan(slope)))
        return T + d * dout + V(0, 0, -vout * math.sin(math.atan(slope)) - (v - vout))

    # Pleat depth per row so each row starts at its rest width.
    depth = {}
    for t in ts:
        P = [base(u, t * tops[u][3]) for u in us]
        F = [flat(u, t * tops[u][3]) for u in us]
        B = sum((P[i + 1] - P[i]).length for i in range(len(us) - 1))
        Fl = sum(math.hypot(F[i + 1][0] - F[i][0], F[i + 1][1] - F[i][1]) for i in range(len(us) - 1))
        h = math.sqrt(max(0.0, (Fl / (2 * n)) ** 2 - (B / (2 * n)) ** 2))
        depth[float(t)] = min(h, 0.14)

    def place(u, v):
        T, d, dout, L = tops[u]
        t = v / max(1e-9, L)
        tk = float(ts[int(np.argmin(np.abs(ts - t)))])
        return base(u, v) + d * depth[tk] * crest(u / Wt)

    return Piece(name, part, Wt, Hm, place, pin=pin or (lambda u, v: 1.0 if v <= 1e-9 else 0.0), length=lambda u: tops[u][3] if u in tops else length(u / Wt),
                 border=border, wrap=curve.closed, us=us, vs=ts, vmap=lambda u, t: t * tops[u][3], flat=flat,
                 outward=lambda c: np.array([c[0], c[1] - body.axis_y(c[2]), 0.0]))


def periodic(table):
    """Periodic interpolation of {angle_deg: value} (angle 0 = the figure's left, 90 = front)."""
    ks = sorted(table)
    xs = np.array(ks + [ks[0] + 360.0])
    ys = np.array([table[k] for k in ks] + [table[ks[0]]])

    def f(a_deg):
        a = (a_deg - ks[0]) % 360.0 + ks[0]
        return float(np.interp(a, xs, ys))
    return f


GATHER = SET.get('gather', 1.0)
FLARE = SET.get('flare', 1.35)


def toga(body, velata=False):
    """The Imperial toga (Trajanic): a lower wrap to the instep; the great mantle hung from the toga line (over the
    left shoulder, down across the back to under the right arm, across the chest back up to the left shoulder)
    whose fan of wool falls in the sinus in front and to the calves behind, over the left arm; and the end
    (lacinia) hanging straight down the front from the left shoulder."""
    L = body.L
    s = body.s
    J = body.J
    neck = L['neckBase']
    shx = J['upperArmL'][0]

    def stage0(done):
        cl = Cloth('toga_wrap')
        sk = skirt_piece(body, 'wrap', 0, L['waist'] + 0.01 * s, L['ankle'] + 0.012 * s, fullness=1.65, top_fullness=1.2, out=0.016, pleat=0.09, clear=0.02,
                         back_drop=0.0, taper=0.4)
        cl.add(sk)
        return cl, dict(kind='wool_wrap', frames=150, abduct={'L': 35, 'R': 35})

    def stage1(done):
        cl = Cloth('toga_mantle')
        wrap = np.array([v.co[:] for v in done[0].data.vertices])
        arms_r = body.weight([b + 'R' for b in ARM]) > 0.5
        hull = Hull(body, ~arms_r, extra=wrap)
        yc = lambda z: body.axis_y(z)
        # The toga line (Blender axes: x = left, -y = front).
        def key(a_deg, z, r=None):
            a = math.radians(a_deg)
            p = body.surface(z, a)
            return (p.x, p.y, p.z)
        hJ = J['head']
        if velata:
            # Capite velato: the toga's back edge drawn over the head. The line runs from the left shoulder up
            # beside the left cheek, over the brow at the hairline, down beside the right cheek to the right
            # shoulder, then across the chest (the balteus) back to the left shoulder.
            keys = [
                (shx * 0.6, yc(neck), neck + 0.03 * s),
                (0.072 * s, hJ[1] + 0.012 * s, hJ[2] - 0.03 * s),
                (0.09 * s, hJ[1] - 0.012 * s, hJ[2] + 0.075 * s),
                (0.0, hJ[1] - 0.05 * s, body.height - 0.012 * s),
                (-0.09 * s, hJ[1] - 0.012 * s, hJ[2] + 0.075 * s),
                (-0.072 * s, hJ[1] + 0.012 * s, hJ[2] - 0.03 * s),
                (-shx * 0.6, yc(neck), neck + 0.03 * s),
                key(125, L['chest'] + 0.01 * s),
                key(90, L['chest'] - 0.06 * s),
                key(45, neck - 0.09 * s),
            ]
        else:
            keys = [
                (shx * 0.6, yc(neck), neck + 0.03 * s),                   # over the left shoulder, beside the neck
                key(45, neck - 0.09 * s),                                # the left collarbone
                key(90, L['chest'] - 0.06 * s),                          # across the breastbone
                key(135, L['waist'] + 0.07 * s),                         # the right ribs
                key(180, L['waist'] + 0.01 * s),                         # under the right arm
                key(225, L['waist'] + 0.06 * s),
                key(270, L['chest'] - 0.03 * s),                         # across the back
                key(315, neck - 0.07 * s),                               # the left shoulder blade
            ]
        loop = Curve(body, keys, closed=True, out=0.022 if velata else 0.018)
        # Cloth below the line, by the direction of the top point: over the arm on the left, the sinus in front
        # (deepest toward the right knee), to the calves behind.
        lens = periodic({0: 0.70, 40: 0.68, 90: 0.86, 130: 0.84, 175: 0.70, 225: 0.76, 270: 0.95, 320: 1.0})
        if velata:
            lens = periodic({0: 0.70, 40: 0.68, 90: 0.86, 130: 0.84, 180: 0.62, 270: 0.95})

        def length(sf):
            p = loop.at(sf * loop.L)
            if velata and p.z > neck + 0.03 * s:
                # Off the head and down the back to the calves.
                return p.z - (L['knee'] - 0.08 * s)
            a = math.degrees(math.atan2(-(p.y - yc(p.z)), p.x)) % 360
            return lens(a) * s

        def route(sf, T, R):
            if not velata or T.z <= neck + 0.03 * s:
                return None
            # Up off the head, back over it, then down the back.
            side = 1.0 if T.x >= 0 else -1.0
            lift = 0.03 * s if T.z > hJ[2] + 0.1 * s else 0.015 * s
            p1 = (T.x + side * 0.012 * s, T.y + 0.01, T.z + lift)
            p2 = (T.x * 1.4, yc(T.z) + 0.16 * s, T.z - 0.03 * s)
            return [p1, p2]

        def border(u, v, pc=None):
            return None
        free = (SET.get('free0', 80.0), SET.get('free1', 140.0)) if not velata else (0.0, 0.0)

        def pin(u, v, W=loop.L * GATHER):
            if v > 1e-9:
                return 0.0
            p = loop.at(u / W * loop.L)
            a = math.degrees(math.atan2(-(p.y - yc(p.z)), p.x)) % 360
            # The front of the toga line is not tied: the sinus hangs between the left shoulder and the right hip.
            return 0.0 if free[0] < a < free[1] else 1.0
        pc = drape_piece(body, 'mantle', 1, loop, length, hull, gather=GATHER, flare=FLARE, clear=0.03, pleat=0.09, seed=11, pin=pin, route=route)
        pc.border = lambda u, v, pc=pc: max(0.0, pc.length(u) - v)
        cl.add(pc)
        # The lacinia: the toga's end hanging from the left shoulder straight down the front.
        lac_keys = [(shx * 0.35, yc(neck) - 0.02, neck + 0.02 * s), (shx * 0.75, yc(neck) - 0.05, neck - 0.0 * s), (shx * 1.05, yc(neck) - 0.07, neck - 0.04 * s)]
        lac = Curve(body, lac_keys, closed=False, out=0.05)
        lc = drape_piece(body, 'lacinia', 2, lac, lambda sf: (1.18 - 0.1 * sf) * s, hull, gather=1.15, flare=1.25, clear=0.05, pleat=0.07, seed=5,
                         slope=1.2, extra_out=lambda sf: (0.0, -6.0, 0.0))
        lc.border = lambda u, v, lc=lc: u
        if not velata and SET.get('lacinia', 0) > 0:
            # (Left out: crumpled into a ragged band, it spoilt the left side; the mantle already falls there.)
            cl.add(lc)
        return cl, dict(kind='wool', frames=240, abduct={} if velata else {'R': 45}, pin_stiffness=3.0, inflate_head=0.012 if velata else 0.0)

    return [stage0, stage1]


def tunic(body, hem_kind):
    L = body.L
    s = body.s
    female = body.sex == 'female'
    top = (L['chest'] - 0.045 * s) if female else L['belt']
    hem = {'short': L['hemShort'], 'knee': L['hemKnee'], 'long': L['hemLong']}[hem_kind]
    cl = Cloth(f'tunic_{hem_kind}')
    # The skirt hangs from the belt; the border (a trim, when the tunic has one) runs along the hem.
    sk = skirt_piece(body, 'skirt', 0, top, hem, fullness=1.7 if hem_kind != 'long' else 1.8, top_fullness=1.15, out=0.01, taper={'short': 0.3, 'knee': 0.45, 'long': 0.5}[hem_kind],
                     border=None)
    sk.border = lambda u, v, sk=sk: max(0.0, sk.length(u) - v)
    cl.add(sk)
    cl.add(blouse_piece(body, 'blouse', 1, top, fullness=1.08, up=0.035 if not female else 0.025, drop=0.028 if not female else 0.02))
    return cl, dict(kind='tunic', frames=160, abduct={'L': 35, 'R': 35})


def bodice_piece(body, name, part, bot, top, fullness=1.12, res=None, out=0.008, slack=0.015):
    """A short gathered tube pinned at both edges (the stola above its belt): `slack` (m) more cloth than the
    height between the edges, so it softens into small folds over the bust."""
    res = res or RES
    s = body.s
    yb = body.axis_y(bot)
    rb = circ_smooth(hull_radius(body, bot, yb), 9) + out
    rt = circ_smooth(hull_radius(body, top, body.axis_y(top)), 9) + out
    perim = float(np.sum(np.hypot(np.diff(np.append(rt, rt[0]) * np.cos(np.append(ANG, 0))), np.diff(np.append(rt, rt[0]) * np.sin(np.append(ANG, 0))))))
    W = perim * fullness
    pl = Pleats(W, max(10, int(round(perim / 0.06))), seed=21, irregular=0.4)
    H = (top - bot) + slack * s
    mids = {}

    def place(u, v):
        t = v / H
        z = lerp(top, bot, t)
        r = rt * (1 - t) + rb * t
        # Bulge outward between the pinned edges by the slack.
        r = r + 0.008 * s * math.sin(math.pi * t)
        k = round(t, 3)
        if k not in mids:
            mids[k] = pl.depth(r)
        return pl.point(u, r, mids[k], z, body.axis_y(z))

    nu = max(24, int(W / res))
    return Piece(name, part, W, H, place, pin=lambda u, v: 1.0 if v <= 1e-9 or v >= H - 1e-9 else 0.0, wrap=True,
                 us=np.linspace(0, W, nu + 1), vs=np.linspace(0, 1, max(4, int(round(H / res)) + 1)),
                 outward=lambda c: np.array([c[0], c[1] - yb, 0.0]))


def strap_piece(body, name, part, side, top, width=0.026, res=None, out=0.006):
    """A stola strap: a narrow band over the shoulder from the front edge of the bodice to the back one, pinned
    along its length (it lies on the shoulder)."""
    res = res or RES
    s = body.s
    x0 = body.J['upperArm' + side][0] * 0.62
    keys = [(x0, -0.2, top), (x0, body.axis_y(body.L['neckBase']), body.L['neckBase'] - 0.01 * s), (x0, 0.2, top)]
    c = Curve(body, keys, closed=False, out=out, torso=False)
    W = width * s

    def place(u, v):
        p = c.at(v)
        # Across the strap: along x.
        return p + V(u - W / 2, 0, 0)

    return Piece(name, part, W, c.L, place, pin=lambda u, v: 1.0, us=np.linspace(0, W, 3),
                 vs=np.linspace(0, 1, max(4, int(c.L / res) + 1)), outward=lambda q: np.array([q[0], q[1] - body.axis_y(q[2]), 0.0]))


def stola(body):
    L = body.L
    s = body.s
    belt = L['chest'] - 0.045 * s
    top = L['armpit'] + 0.02 * s
    cl = Cloth('stola')
    sk = skirt_piece(body, 'skirt', 0, belt, L['ankle'] + 0.006 * s, fullness=1.75, top_fullness=1.25, out=0.01, pleat=0.04, clear=0.008, back_drop=0.01, taper=0.45)
    sk.border = lambda u, v, sk=sk: max(0.0, sk.length(u) - v)
    cl.add(sk)
    cl.add(bodice_piece(body, 'bodice', 1, belt, top))
    for side in 'LR':
        cl.add(strap_piece(body, 'strap' + side, 2, side, top))
    return cl, dict(kind='linen', frames=170, abduct={'L': 35, 'R': 35})


def palla(body):
    """The palla: a wide wool mantle round the shoulders (over both, the back and the upper arms), shorter in front
    where it hangs over the bust, with its end hanging from the left shoulder down over the left arm."""
    L = body.L
    s = body.s
    J = body.J
    neck = L['neckBase']
    shx = J['upperArmL'][0]
    yc = lambda z: body.axis_y(z)

    def key(a_deg, z):
        p = body.surface(z, math.radians(a_deg))
        return (p.x, p.y, p.z)
    keys = [
        (shx * 0.62, yc(neck), neck + 0.02 * s),
        key(55, neck - 0.07 * s),
        key(90, neck - 0.11 * s),
        key(125, neck - 0.07 * s),
        (-shx * 0.62, yc(neck), neck + 0.02 * s),
        key(235, neck - 0.04 * s),
        key(270, neck - 0.05 * s),
        key(305, neck - 0.04 * s),
    ]
    loop = Curve(body, keys, closed=True, out=0.012)
    arms = np.ones(len(body.co), dtype=bool)
    hull = Hull(body, arms)
    lens = periodic({0: 0.52, 60: 0.48, 90: 0.42, 120: 0.48, 180: 0.52, 230: 0.7, 270: 0.78, 310: 0.7})

    def length(sf):
        p = loop.at(sf * loop.L)
        a = math.degrees(math.atan2(-(p.y - yc(p.z)), p.x)) % 360
        return lens(a) * s

    cl = Cloth('palla')
    pc = drape_piece(body, 'mantle', 1, loop, length, hull, gather=1.04, flare=1.6, clear=0.03, pleat=0.09, seed=13)
    pc.border = lambda u, v, pc=pc: max(0.0, pc.length(u) - v)
    cl.add(pc)
    end_keys = [(shx * 0.55, yc(neck) - 0.02, neck + 0.0 * s), (shx * 0.95, yc(neck) - 0.02, neck - 0.04 * s), (shx * 1.2, yc(neck), neck - 0.08 * s)]
    end = Curve(body, end_keys, closed=False, out=0.045)
    ec = drape_piece(body, 'end', 2, end, lambda sf: 0.85 * s, hull, gather=1.0, flare=1.0, clear=0.05, pleat=0.09, seed=8,
                     slope=1.2, extra_out=lambda sf: (0.4, -1.0, 0.0))
    ec.border = lambda u, v, ec=ec: max(0.0, ec.length(u) - v)
    cl.add(ec)
    return cl, dict(kind='wool', frames=220, pin_stiffness=3.0)


def paenula(body):
    """The paenula: a bell of heavy wool (a full circle with a head opening, closed down the front) over the
    shoulders and arms to the knees, and its hood lying on the back."""
    L = body.L
    s = body.s
    J = body.J
    neck = L['neckBase']
    yc = lambda z: body.axis_y(z)

    def key(a_deg, z, k=1.0):
        p = body.surface(z, math.radians(a_deg))
        return (p.x * k, yc(z) + (p.y - yc(z)) * k, p.z)
    keys = [key(a, neck - (0.035 if 60 < a < 120 else 0.0) * s) for a in range(0, 360, 30)]
    loop = Curve(body, keys, closed=True, out=0.012)
    hull = Hull(body, np.ones(len(body.co), dtype=bool))
    lens = periodic({0: 0.82, 90: 0.78, 180: 0.82, 270: 0.9})

    def length(sf):
        p = loop.at(sf * loop.L)
        a = math.degrees(math.atan2(-(p.y - yc(p.z)), p.x)) % 360
        return lens(a) * s

    cl = Cloth('paenula')
    pc = drape_piece(body, 'bell', 1, loop, length, hull, gather=1.02, flare=2.6, clear=0.03, pleat=0.07, seed=17)
    cl.add(pc)
    # The hood: a gathered flap from the back of the neckline.
    hk = [key(a, neck + 0.01 * s) for a in (215, 270, 325)]
    hood = Curve(body, hk, closed=False, out=0.03)
    hc = drape_piece(body, 'hood', 2, hood, lambda sf: (0.3 - 0.12 * abs(sf - 0.5) * 2) * s, hull, gather=1.3, flare=1.1, clear=0.06, pleat=0.06,
                     seed=4, slope=0.8)
    cl.add(hc)
    return cl, dict(kind='wool_light', frames=240, pin_stiffness=3.0)


def cloak(body, name, length_m, kind):
    """Sagum / lacerna: a rectangle of wool round the shoulders, pinned at the right shoulder with a fibula: over the
    left shoulder and the back, open down the right side so the sword arm is free."""
    L = body.L
    s = body.s
    J = body.J
    neck = L['neckBase']
    shx = J['upperArmL'][0]
    yc = lambda z: body.axis_y(z)

    def key(a_deg, z):
        p = body.surface(z, math.radians(a_deg))
        return (p.x, p.y, p.z)
    fib = (-shx * 0.8, yc(neck) - 0.07, neck - 0.04 * s)
    keys = [fib, key(120, neck - 0.08 * s), key(90, neck - 0.07 * s), key(45, neck - 0.04 * s), (shx * 0.75, yc(neck), neck + 0.02 * s),
            key(315, neck - 0.02 * s), key(270, neck - 0.03 * s), key(225, neck - 0.02 * s), (-shx * 0.85, yc(neck) + 0.06, neck - 0.03 * s)]
    top = Curve(body, keys, closed=False, out=0.014)
    hull = Hull(body, np.ones(len(body.co), dtype=bool))

    def length(sf):
        # Longest down the back, shorter where the corners hang at the fibula.
        return (length_m - 0.12 * abs(sf - 0.55) ** 2) * s

    cl = Cloth(name)
    pc = drape_piece(body, name, 1, top, length, hull, gather=1.12, flare=1.25, clear=0.02, pleat=0.08, seed=23)
    pc.border = lambda u, v, pc=pc: max(0.0, pc.length(u) - v)
    cl.add(pc)
    return cl, dict(kind=kind, frames=300, pin_stiffness=3.0, air=10.0)


GARMENTS = {
    'male': {
        'toga': lambda b: toga(b),
        'toga_velata': lambda b: toga(b, velata=True),
        'paenula': lambda b: paenula(b),
        'sagum': lambda b: cloak(b, 'sagum', 0.92, 'wool'),
        'lacerna': lambda b: cloak(b, 'lacerna', 1.12, 'wool_light'),
        'palla': lambda b: palla(b),
        'tunic_short': lambda b: tunic(b, 'short'),
        'tunic_knee': lambda b: tunic(b, 'knee'),
        'tunic_long': lambda b: tunic(b, 'long'),
    },
    'female': {
        'tunic_long': lambda b: tunic(b, 'long'),
        'stola': lambda b: stola(b),
        'palla': lambda b: palla(b),
    },
}

# Garments simulated over another (the inner one must be built first).
UNDER = {
    ('male', 'paenula'): ['tunic_knee'],
    ('male', 'sagum'): ['tunic_knee'],
    ('male', 'lacerna'): ['tunic_knee'],
    ('male', 'palla'): ['tunic_knee'],
    ('female', 'palla'): ['stola'],
}

LOD_TRIS = {'toga': (3000, 1500, 420), 'toga_velata': (3300, 1650, 460), 'tunic_short': (1900, 950, 260), 'tunic_knee': (2200, 1100, 300), 'tunic_long': (2600, 1300, 340),
            'stola': (2800, 1400, 380), 'palla': (2600, 1300, 360), 'paenula': (2600, 1300, 360), 'sagum': (2200, 1100, 320), 'lacerna': (2400, 1200, 340)}


def join(objs, name):
    """Merge mesh objects into a new one (UV layers by name)."""
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def make_lods(sim, gname, kind):
    """LOD 0..2 by collapse decimation of the settled cloth (hems decimated last), turned rims on LOD 0 and 1."""
    lods = []
    tris = LOD_TRIS.get(gname, (3000, 1500, 400))
    thick = MATERIALS[kind]['thick']
    for k, t in enumerate(tris):
        o = decimate_copy(sim, f'{gname}_lod{k}', t, keep_hems=SET.get('keep_hems', 0.15) if k == 0 else 0.0)
        if k < 2:
            add_rim(o, thick)
        o.data.validate()  # drops the sim's pin weights (the mesh no longer has vertex groups)
        lods.append(o)
        log(f'  lod{k}: {len(o.data.polygons)} triangles, {len(o.data.vertices)} vertices')
    return lods


def build_garment(sex, gname):
    body = Body(sex)
    global UNDER_PTS
    under = []
    for ug in UNDER.get((sex, gname), []):
        # A garment worn over another is simulated over it (its settled cloth is a collider), so the layers
        # never cross; fitted to any body, both keep their offsets from the skin, so they stay apart.
        p = os.path.join(WORK, f'{sex}_{ug}.blend')
        if not os.path.exists(p):
            log(f'  (no {ug} to drape over: build it first)')
            continue
        with bpy.data.libraries.load(p) as (src, dst):
            dst.objects = [n for n in src.objects if n == f'{ug}_hi']
        for o in dst.objects:
            bpy.context.scene.collection.objects.link(o)
            o.modifiers.new('Collision', 'COLLISION')
            o.collision.thickness_outer = 0.006
            o.collision.cloth_friction = 6.0
            o.hide_render = True
            under.append(o)
    UNDER_PTS = np.vstack([np.array([v.co[:] for v in o.data.vertices]) for o in under]) if under else None
    spec = GARMENTS[sex][gname](body)
    stages = spec if isinstance(spec, list) else [spec]
    done = []
    col = None
    kind = 'wool'
    for k, made in enumerate(stages):
        cl, opt = made(done) if callable(made) else made
        kind = opt['kind']
        if under:
            opt = dict(opt, under=under)
        if col is not None:
            bpy.data.objects.remove(col, do_unlink=True)
        col = body.collider('collider', abduct=opt.get('abduct'), inflate=opt.get('inflate', 0.002), inflate_head=opt.get('inflate_head', 0.0))
        ob = cl.build()
        log(f'{sex}/{gname} stage {k}: {len(cl.verts)} cloth vertices, {len(cl.faces)} quads')
        sim = simulate(ob, opt['kind'], frames=opt.get('frames', 90), shrink=opt.get('shrink', 0.0), pin_stiffness=opt.get('pin_stiffness', 2.0), air=opt.get('air'))
        weld(sim, cl.sew)
        bpy.data.objects.remove(ob, do_unlink=True)
        # What is done collides with what comes next.
        sim.modifiers.new('Collision', 'COLLISION')
        sim.collision.thickness_outer = 0.004
        sim.collision.cloth_friction = 8.0
        done.append(sim)
    for o in done:
        o.modifiers.clear()
    sim = join(done, f'{gname}_hi')
    for o in done:
        bpy.data.objects.remove(o, do_unlink=True)
    triangulate(sim)
    sim.data.validate()
    relax(sim, int(SET.get('smooth', MATERIALS[kind].get('smooth', 0))))
    log(f'  ambient occlusion on {len(sim.data.vertices)} vertices')
    # Occluded by the cloth and the body as simulated (an arm swung out of the way does not shade the cloth:
    # it moves at runtime, its shadow would not).
    col.modifiers.clear()
    ao = ambient_occlusion(sim, [col] + under)
    bpy.data.objects.remove(col, do_unlink=True)
    for o in under:
        bpy.data.objects.remove(o, do_unlink=True)
    set_attr_uv(sim, 'attr', 1, ao)
    sim['kind'] = kind
    lods = make_lods(sim, gname, kind)
    if PREVIEW:
        for o in lods:
            o.hide_render = True
        preview(body.ob, [sim], os.path.join(WORK, f'{sex}_{gname}{TAG}_hi'))
        sim.hide_render = True
        lods[0].hide_render = False
        preview(body.ob, [lods[0]], os.path.join(WORK, f'{sex}_{gname}{TAG}'))
    return lods, sim


def export(sex, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        o.data.materials.clear()
    path = os.path.join(OUT, f'{sex}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_skins=False,
                              export_normals=True, export_texcoords=True, export_tangents=False, export_materials='NONE',
                              export_image_format='NONE', export_yup=True, export_animations=False, export_morph=False,
                              export_cameras=False, export_lights=False, export_attributes=False)
    log('exported', path, os.path.getsize(path) // 1024, 'KB')


def main():
    """Build (unless --export-only), keep each garment in .cache/garments/<sex>_<id>.blend, then merge every
    built garment of the sex into public/models/garments/<sex>.glb (unless --no-export / --keep). Garments can be
    built in parallel processes with --keep and merged afterwards with --export-only."""
    for sex in SEXES:
        names = [g for g in GARMENTS[sex] if not ONLY or g in ONLY]
        if RELOD:
            for g in names:
                p = os.path.join(WORK, f'{sex}_{g}.blend')
                if not os.path.exists(p):
                    continue
                bpy.ops.wm.read_factory_settings(use_empty=True)
                with bpy.data.libraries.load(p) as (src, dst):
                    dst.objects = [n for n in src.objects if n == f'{g}_hi']
                hi = dst.objects[0]
                bpy.context.scene.collection.objects.link(hi)
                log(f'{sex}/{g}: LODs again')
                lods = make_lods(hi, g, hi.get('kind', KIND[g]))
                tmp = p + '.tmp.blend'
                bpy.ops.wm.save_as_mainfile(filepath=tmp)
                bpy.ops.wm.read_factory_settings(use_empty=True)
                os.replace(tmp, p)
        elif not EXPORT_ONLY:
            for g in names:
                lods, hi = build_garment(sex, g)
                if NO_EXPORT:
                    continue
                bpy.ops.object.select_all(action='DESELECT')
                p = os.path.join(WORK, f'{sex}_{g}{TAG}.blend')
                # The LODs for the GLB, and the full simulated cloth (a collider for garments worn over this one).
                for o in list(bpy.data.objects):
                    if o not in lods and o is not hi:
                        bpy.data.objects.remove(o, do_unlink=True)
                bpy.ops.wm.save_as_mainfile(filepath=p)
        if NO_EXPORT or KEEP:
            continue
        # Merge every garment of the sex (fresh or kept from earlier runs) into one GLB.
        bpy.ops.wm.read_factory_settings(use_empty=True)
        objs = []
        for g in GARMENTS[sex]:
            p = os.path.join(WORK, f'{sex}_{g}.blend')
            if not os.path.exists(p):
                log('missing', p, '(not built yet)')
                continue
            with bpy.data.libraries.load(p) as (src, dst):
                dst.objects = [n for n in src.objects if n.startswith(g + '_lod')]
            for o in dst.objects:
                bpy.context.scene.collection.objects.link(o)
                objs.append(o)
        export(sex, objs)


main()
