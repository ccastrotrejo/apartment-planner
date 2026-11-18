"""Exports the apartment and the modeled furniture for the web planner (index.html in this folder).

    python3 web/export_web.py        # -> the scene data embedded in web/index.html (between the scene: markers)

Geometry is the same code as the printed model. Furniture is built at 1:12 instead of 1:60, so the print
minimums (in mm) shrink to near-real sizes (legs, rods, rug thickness). Everything is written in real inches,
in plan coordinates: x east, z south (the plan's y), y up, floor at y = 0.
"""
import argparse
import base64
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build                       # noqa: E402
import floorplan as fp             # noqa: E402
import furniture as F              # noqa: E402

SCALE = 12

# name, library group, color (one color, or {part: color} for pieces built in colored parts)
TIRES = {'tires': '#1b1b1b', 'kit': '#2e2e2e'}
PIECES = {
    'sectional': ('Sectional, chaise on the left', 'Living room', {'upholstery': '#ece6da', 'legs': '#6b4a2f'}),
    'coffee-table': ('Lift-top coffee table', 'Living room', {'top': '#8a5a36', 'body': '#6f4528'}),
    'coffee-table-open': ('Lift-top coffee table, lifted', 'Living room', {'top': '#8a5a36', 'body': '#6f4528'}),
    'tv-stand': ('TV on rolling stand', 'Living room', {'base': '#cbb08a', 'stand': '#eeece7', 'tv': '#1b1c1f'}),
    'tier-shelf': ('3-tier side shelf', 'Living room', '#4a3426'),
    'torchiere-lamp': ('Torchiere floor lamp', 'Living room', {'metal': '#c3c7cc', 'shade': '#f6f3ec'}),
    'standing-desk': ('Standing desk + monitors', 'Office & kitchen', {'top': '#6d5c4c', 'frame': '#1f1f1f',
                                                                      'screens': '#141518'}),
    'office-chair': ('Aeron chair', 'Office & kitchen', {'frame': '#232323', 'mesh': '#4a4e51'}),
    'counter-stool': ('Counter stool', 'Office & kitchen', {'shell': '#ece8e0', 'wood': '#7a5232', 'metal': '#1f1f1f'}),
    'queen-bed': ('Queen bed', 'Bedroom', {'frame': '#3d4a3f', 'bedding': '#f3f1ec', 'pillows': '#c9cfd6',
                                          'throw': '#8f9a8c'}),
    'nightstand': ('Nightstand', 'Bedroom', '#5a4434'),
    'tripod-lamp': ('Tripod floor lamp', 'Bedroom', {'legs': '#1d1d1d', 'shade': '#efe4c8'}),
    'coat-rack': ('Coat rack', 'Entry & storage', '#8a5a33'),
    'shoe-cabinet': ('Shoe cabinet (cane doors)', 'Entry & storage', {'wood': '#5b3f2c', 'cane': '#d8c39e',
                                                                      'metal': '#222222'}),
    'arched-mirror': ('Arched floor mirror', 'Entry & storage', {'frame': '#2a2a2a', 'glass': '#d5e0e4'}),
    'hall-cabinet': ('Rounded 2-door cabinet', 'Entry & storage', {'wood': '#4b3527', 'pulls': '#c2a15a'}),
    'bike-black': ('Black road bike', 'Entry & storage', {'frame': '#2c3027', **TIRES}),
    'bike-red-wall': ('Red road bike on a wall rack', 'Entry & storage', {'frame': '#b8322a', **TIRES, 'rack': '#a0774c'}),
    'rug-6x9': ('Rug 6 × 9\'', 'Rugs & plants', '#c9c8c3'),
    'plant-monstera': ('Leafy plant (grey pot)', 'Rugs & plants', {'pot': '#a3a39f', 'leaf': '#3f6b3a'}),
    'plant-zz': ('ZZ plant (terracotta pot)', 'Rugs & plants', {'pot': '#b5683f', 'leaf': '#2f5a2c'}),
}
FLAT = {'rug-6x9'}                                               # lie under furniture, never collide with it
SEATS = {'counter-stool', 'office-chair'}                        # may tuck under tables and desks
STACK = {}                                                       # piece: [pieces it may stand on]
SUPPORT = {k for v in STACK.values() for k in v}
DECK = {}                                                        # what stands on it sits this high (default: its top)
SMOOTH = set()                                                   # organic shapes: smooth shading, not faceted
# Two-state pieces: one library entry; the selected piece switches state (button, F key, double-click).
# anchor 'back': the back edge stays put; 'center': the middle stays put.
VARIANTS = {'coffee-table': ('coffee-table-open', 'Lift the top', 'back', 'Top lifts to 25″ and comes 8″ forward'),
            'coffee-table-open': ('coffee-table', 'Lower the top', 'back', None)}
LIBNOTE = {'arched-mirror': 'leans out about 6″ at the bottom', 'bike-red-wall': 'hangs with its wheels 30″ off the floor'}
TUCK = {'standing-desk'}

# Example layout (plan inches; r = degrees, 0 = front faces south, 90 = east, 180 = north, -90 = west).
EXAMPLE = [
    # living area: sectional on the west wall (chaise to the south) facing the TV on the bedroom partition,
    # desk under the north window, stools parked by the kitchen
    ('sectional', 32, 120, 90), ('rug-6x9', 62, 104, 90), ('coffee-table', 64.5, 104, -90), ('tv-stand', 121, 104, -90),
    ('tier-shelf', 123, 139, -90), ('torchiere-lamp', 11, 45, 0), ('plant-monstera', 14, 14, 0),
    ('standing-desk', 57.5, 14.5, 0), ('office-chair', 57.5, 36, 180), ('plant-zz', 93, 9, 0),
    ('counter-stool', 10, 181.5, 180), ('counter-stool', 29, 181.5, 180),
    # entry and kitchen corridor: coat rack by the door, shoe cabinet and mirror on the bath-side wall
    ('coat-rack', 72, 374, 0), ('shoe-cabinet', 120, 315, -90), ('arched-mirror', 121.4, 287, -90),
    # primary bedroom: head of the bed on the east wall, nightstands both sides, bikes on the north and west walls
    ('queen-bed', 200.9, 60, -90), ('nightstand', 233.55, 18.3, -90), ('nightstand', 233.55, 101.65, -90),
    ('tripod-lamp', 215, 12, 0), ('bike-black', 172, 15.5, 0), ('bike-red-wall', 142.7, 75, 90),
    ('hall-cabinet', 200, 117.35, 180),
]


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode('ascii')


def pack(verts, faces):
    """Indexed mesh -> {p: base64 Float32 xyz, i: base64 Uint16/Uint32, n32: bool}."""
    verts = np.asarray(verts, np.float32)
    faces = np.asarray(faces)
    wide = len(verts) > 65535
    return {'p': b64(verts.round(3).astype(np.float32)), 'i': b64(faces.astype(np.uint32 if wide else np.uint16)),
            'wide': wide, 'tris': int(len(faces))}


def manifold_arrays(man):
    m = man.to_mesh()
    return np.asarray(m.vert_properties)[:, :3].astype(float), np.asarray(m.tri_verts)


def apartment(plan):
    a = argparse.Namespace(scale=SCALE, wall_height=90.0, sill=30.0, glass_curb_mm=1.2, floor_mm=2.0,
                           groove_mm=0.8, groove_depth_mm=0.6)
    comps, _, T, s = build.build_model(plan, a)
    minx, maxy = plan.footprint().bounds[0], plan.footprint().bounds[3]
    out = {}
    for k, man in comps.items():
        v, f = manifold_arrays(man)
        # model mm (x east, y north, z up; floor top at floor_mm) -> plan inches (x, up, z south)
        w = np.column_stack([v[:, 0] / s + minx, v[:, 2] / s - a.floor_mm / s, maxy - v[:, 1] / s])
        out[k] = pack(w, f)
    return out, a


def furniture_meshes():
    s = 25.4 / SCALE
    pieces = F.build_all(SCALE)
    out = {}
    for k, (name, group, color) in PIECES.items():
        f = F.FURNITURE[F.SRC.get(k, k)]
        if isinstance(color, dict):                         # built in colored parts
            parts = F.BUILDERS[k](f, s, parts=True)
        else:
            parts = [('main', pieces[k])]
        pivot = [m for role, m in parts if role == 'pivot']         # where a two-state piece stays put
        arrs = [(role, *manifold_arrays(m)) for role, m in parts if role != 'pivot']
        allv = np.vstack([v for _, v, _ in arrs]) / s        # real inches; x width, y depth (front at 0), z up
        x0, y0, z0 = allv.min(axis=0)
        x1, y1, z1 = allv.max(axis=0)
        z0 = min(z0, 0.0)                                   # wall-hung pieces keep their height off the floor
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        meshes = []
        for role, v, fc in arrs:
            v = v / s
            # local -> web: x right, y up, z toward the front (front faces +z when r = 0)
            w = np.column_stack([v[:, 0] - cx, v[:, 2] - z0, cy - v[:, 1]])
            meshes.append(dict(color=color[role] if isinstance(color, dict) else color, mesh=pack(w, fc)))
        W, D, H = x1 - x0, y1 - y0, z1 - z0
        rects = F.FOOTPRINTS[k](f) if k in F.FOOTPRINTS else [(x0, x1, y0, y1)]
        hits = [[rx0 - cx, rx1 - cx, cy - ry1, cy - ry0] for rx0, rx1, ry0, ry1 in rects]   # local web axes
        swatch = color if isinstance(color, str) else next(iter(color.values()))
        out[k] = dict(name=name, group=group, color=swatch, size=[round(W, 1), round(D, 1), round(H, 1)],
                      hit=[round(h, 2) for h in hits[0]], flat=k in FLAT, seat=k in SEATS, tuck=k in TUCK,
                      stack=STACK.get(k, False), support=k in SUPPORT, note=f.get('note', ''), parts=meshes)
        if len(hits) > 1:
            out[k]['hits'] = [[round(h, 2) for h in r] for r in hits]
        if pivot:
            pb = pivot[0].bounding_box()
            out[k]['pivot'] = [round((pb[0] + pb[3]) / 2 / s - cx, 2), round(cy - (pb[1] + pb[4]) / 2 / s, 2)]
        if k in DECK:
            out[k]['deck'] = DECK[k]
        if k in SMOOTH:
            out[k]['smooth'] = True
        if k in LIBNOTE:
            out[k]['libNote'] = LIBNOTE[k]
        if k in VARIANTS:
            alt, verb, anchor, lib = VARIANTS[k]
            out[k].update(alt=alt, altVerb=verb, anchor=anchor, hidden=lib is None, libNote=lib)
    return out


def plan_data(plan):
    X, Y = plan.X, plan.Y
    rect = lambda g: [round(v, 2) for v in g.bounds]         # x0, z0, x1, z1
    obstacles = [dict(kind='wall', r=rect(g)) for g in plan.walls()]
    obstacles += [dict(kind='window' if w['kind'] == 'sill' else 'glass', r=rect(g)) for w, g in plan.windows()]
    for f, g in plan.fixtures():
        o = dict(kind='fixture', name=f['name'], r=rect(g))
        if f.get('overhang'):                                   # stools may tuck under: collide with the block only
            b = g.bounds
            o['low'] = rect(g.difference(build.overhang_zone((b[0], b[2], b[1], b[3]), f['overhang'])))
        obstacles.append(o)
    windows = [dict(kind=w['kind'], r=rect(g)) for w, g in plan.windows()]
    doors = []
    for d, h, t, o, r in plan.doors():
        doors.append(dict(name=d.get('name', ''), hinge=[round(v, 2) for v in h], closed=[round(v, 2) for v in t],
                          open=[round(v, 2) for v in o], r=round(r, 2)))
    sliders = [[[round(v, 2) for v in p] for p in path] for path in plan.slider_paths()]

    kx = sorted(X, key=lambda k: fp.PX_X[k])
    ky = sorted(Y, key=lambda k: fp.PX_Y[k])

    def lbl(px, py):
        return (float(np.interp(px, [fp.PX_X[k] for k in kx], [X[k] for k in kx])),
                float(np.interp(py, [fp.PX_Y[k] for k in ky], [Y[k] for k in ky])))
    rooms = []
    for r in fp.ROOMS:
        if r['name'] == 'CL':
            continue
        x, y = lbl(*r['at'])
        size, measured = None, False
        if r['size']:
            x0n, x1n, y0n, y1n = r['size']
            size = [round(X[x1n] - X[x0n], 1), round(Y[y1n] - Y[y0n], 1)]
            measured = bool(build.measured_between('x', x0n, x1n) and build.measured_between('y', y0n, y1n))
        rooms.append(dict(name=r['name'].capitalize(),
                          at=[round(x, 1), round(y, 1)], size=size, measured=measured))
    fx0, fz0, fx1, fz1 = plan.footprint().bounds
    return dict(bounds=[round(v, 1) for v in (fx0, fz0, fx1, fz1)],
                outline=[[round(x, 2), round(y, 2)] for x, y in plan.footprint().exterior.coords],
                obstacles=obstacles, windows=windows, doors=doors, sliders=sliders, rooms=rooms)


SCENE_OPEN = '<!-- scene:begin (written by export_web.py) --><script type="application/json" id="scene-data">'
SCENE_CLOSE = '</script><!-- scene:end -->'
SRC_OPEN, MAIN_OPEN = '\n<script type="application/json" id="page-src">', '</script>\n<script>'


def with_page_src(page):
    """Rewrite the page's own source map (#page-src) from the page as it now stands. The page republishes itself
    as pre + head + sceneOpen + <scene> + sceneClose + srcOpen + <page-src> + mainOpen + <main script> + post, so a
    stale copy of the markup/CSS in here would silently undo edits to them on the next self-republish."""
    a, b = page.index(SCENE_OPEN), page.index(SCENE_CLOSE) + len(SCENE_CLOSE)
    s0 = page.index(SRC_OPEN, b)
    assert s0 == b, 'page-src must sit right after the scene block'
    m0 = page.index(MAIN_OPEN, s0 + len(SRC_OPEN))
    m1 = page.rindex('</script>')
    body = page.index('<body>') + len('<body>') if '<body>' in page[:a] else 0
    parts = dict(pre=page[:body], head=page[body:a], sceneOpen=SCENE_OPEN, sceneClose=SCENE_CLOSE, srcOpen=SRC_OPEN,
                 mainOpen=MAIN_OPEN, post=page[m1:])
    src = json.dumps(parts, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    out = page[:b] + SRC_OPEN + src + page[m0:]
    main_js = out[out.index(MAIN_OPEN, b + len(SRC_OPEN) + len(src)) + len(MAIN_OPEN):out.rindex('</script>')]
    rebuilt = (parts['pre'] + parts['head'] + SCENE_OPEN + out[a + len(SCENE_OPEN):b - len(SCENE_CLOSE)] + SCENE_CLOSE
               + SRC_OPEN + src + MAIN_OPEN + main_js + parts['post'])
    assert rebuilt == out, 'page-src does not rebuild the page'
    return out


def main():
    ap = argparse.ArgumentParser(description='Rebuild the scene data embedded in web/index.html.')
    ap.add_argument('--reset-layouts', action='store_true',
                    help='replace the built-in Standard / "With Guest" layouts with the example layout (EXAMPLE); '
                         'use after changing the floor plan, when the old placements no longer make sense')
    args = ap.parse_args()
    plan = build.Plan()
    apt, a = apartment(plan)
    scene = dict(version=1, units='inches', wall_height=a.wall_height, sill=a.sill,  # full walls 7'6" (8' read too tall)
                 apartment=apt, plan=plan_data(plan), furniture=furniture_meshes(),
                 example=[dict(k=k, x=x, z=z, r=r) for k, x, z, r in EXAMPLE])
    # Embedded in the page rather than fetched: a second request for a private artifact's file can fail in
    # browsers that block third-party cookies (it did on an iPad), so the page carries its own data.
    path = os.path.join(HERE, 'index.html')
    page = open(path, encoding='utf-8').read()
    a, b = page.index(SCENE_OPEN), page.index(SCENE_CLOSE)
    # The built-in main / "With Guest" layouts (for signed-out visitors) are maintained by the page itself: it
    # republishes with fresh copies when the owner changes them. Carry the current ones over.
    old = json.loads(page[a + len(SCENE_OPEN):b])
    if args.reset_layouts:
        items = [[k, x, z, r] for k, x, z, r in EXAMPLE]
        scene.update(main=dict(name='Standard', at=0, items=items), guest=dict(name='With Guest', at=0, items=items))
    else:
        scene.update({k: old[k] for k in ('main', 'guest') if k in old})
    blob = json.dumps(scene, separators=(',', ':')).replace('<', '\\u003c')
    page = with_page_src(page[:a] + SCENE_OPEN + blob + page[b:])
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(page)
    tris = sum(m['tris'] for m in apt.values()) + sum(m['mesh']['tris'] for p in scene['furniture'].values() for m in p['parts'])
    print(f'{path}: {os.path.getsize(path) / 1e6:.2f} MB, {tris} triangles, {len(scene["furniture"])} pieces')


if __name__ == '__main__':
    main()
