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
STAND = {'tires': '#1b1b1b', 'kit': '#2e2e2e', 'stand': '#222222', 'red': '#c23a2e'}
WARROAD, AVAIL = {'frame': '#3f6d6b', **STAND}, {'frame': '#6e5a86', **STAND}
NALA = {'fur': '#1c1714', 'tan': '#a8642f', 'eye': '#2a160b', 'white': '#efe9e0', 'tag': '#b9bdc1'}
PIECES = {
    'sofa': ('Sofa (power recliner)', 'Living room', '#9b9a96'),
    'yellow-loveseat': ('Yellow loveseat chair', 'Living room', '#d6a531'),
    'coffee-table': ('Coffee table', 'Living room', '#7a4a2c'),
    'tv-stand': ('TV on rolling stand', 'Living room', '#3b3d42'),
    'white-dresser': ('White cabinet', 'Living room', '#ecebe6'),
    'side-table': ('Round side table 24"', 'Living room', {'top': '#8f8d88', 'frame': '#262626'}),
    'floor-lamp': ('Trilage floor lamp', 'Living room', '#4a4038'),
    'plant': ('Bird of paradise', 'Living room', '#4f7a43'),
    'bar-cart': ('Bar cart', 'Living room', {'frame': '#c8a548', 'glass': '#cfe3e6', 'casters': '#3a3a3a'}),
    'dining-round-36': ('Round table 36"', 'Dining & kitchen', '#c49a6c'),
    'dining-round-42': ('Round table 42"', 'Dining & kitchen', '#c49a6c'),
    'dining-oval-42x60': ('Oval table 42 × 60"', 'Dining & kitchen', '#c49a6c'),
    'dining-rect-30x48': ('Table 30 × 48"', 'Dining & kitchen', '#c49a6c'),
    'dining-rect-36x60': ('Table 36 × 60"', 'Dining & kitchen', '#c49a6c'),
    'dining-rect-36x78': ('Table 36 × 78" (leaf in)', 'Dining & kitchen', '#c49a6c'),
    'drop-leaf-folded': ('Drop-leaf table (yours)', 'Dining & kitchen', {'top': '#f1efe9', 'wood': '#d8b98c'}),
    'drop-leaf-open': ('Drop-leaf table (yours), open', 'Dining & kitchen', {'top': '#f1efe9', 'wood': '#d8b98c'}),
    'dining-chair': ('Dining chair', 'Dining & kitchen', '#8c6a4a'),
    'bar-stool': ('Bar stool', 'Dining & kitchen', {'seat': '#a7a7a2', 'chrome': '#cdd2d6'}),
    'standing-desk': ('Standing desk', 'Office', '#b98f62'),
    'office-chair': ('Aeron chair', 'Office', {'frame': '#232323', 'mesh': '#4a4e51'}),
    'queen-bed': ('Queen bed', 'Bedrooms', '#c9c3b8'),
    'nightstand': ('Nightstand (KULLEN)', 'Bedrooms', '#3b302b'),
    'nightstand-fluted': ('Fluted nightstand, 3 drawers (Wayfair)', 'Bedrooms',
                          {'body': '#c7a57c', 'drawers': '#d2b289', 'flutes': '#bf9b70', 'pulls': '#b8933f',
                           'strip': '#f1efe9'}),
    'dresser-main': ('Dresser 60" (planned)', 'Bedrooms', '#b59a7a'),
    'dresser-guest': ('Dresser 52" (current)', 'Bedrooms', '#a3876a'),
    'dresser-16': ('Long dresser 78.7", 16 drawers (Wayfair)', 'Bedrooms', '#ecebe6'),
    'storklinta': ('IKEA STORKLINTA 3-drawer', 'Bedrooms', '#c9a979'),
    'sofa-bed-folded': ('Achillas sofa bed', 'Bedrooms', '#7d8790'),
    'sofa-bed-open': ('Achillas sofa bed, opened as a bed', 'Bedrooms', '#7d8790'),
    'shoe-cabinet': ('Shoe cabinet', 'Entry & storage', {'body': '#f1f0ec', 'top': '#c8a57a', 'knobs': '#c79a4b'}),
    'mirror-65': ('Floor mirror 24 × 65"', 'Entry & storage', {'frame': '#4e3d30', 'glass': '#d5e0e4'}),
    'mirror-77': ('Floor mirror 24 × 77"', 'Entry & storage', {'frame': '#4e3d30', 'glass': '#d5e0e4'}),
    'bike-warroad': ('Salsa Warroad 54 cm, in a floor stand', 'Entry & storage', WARROAD),
    'bike-warroad-up': ('Salsa Warroad 54 cm, standing up in its stand', 'Entry & storage', WARROAD),
    'bike-avail': ('Liv Avail, in a floor stand', 'Entry & storage', AVAIL),
    'bike-avail-up': ('Liv Avail, standing up in its stand', 'Entry & storage', AVAIL),
    'bike-on-wall-hook': ('Bike on a vertical wall hook', 'Entry & storage',
                          {'frame': '#3f6d6b', 'tires': '#1b1b1b', 'kit': '#2e2e2e'}),
    'dog-crate': ('Dog crate', 'Pet', {'wire': '#1e1e1e', 'tray': '#3a3a3a'}),
    'dog': ('Nala', 'Pet', NALA),
    'dog-curled': ('Nala, curled up asleep', 'Pet', NALA),
    'dog-bed': ('Donut dog bed', 'Pet', {'plush': '#d3d0ca', 'cushion': '#c2beb7'}),
    'rug-6x9': ('Rug 6 × 9\'', 'Rugs & markers', '#bdb7aa'),
    'rug-8x10': ('Rug 8 × 10\'', 'Rugs & markers', '#aab2b6'),
    'sofa-recline-zone': ('Recline zone (sofa footrests)', 'Rugs & markers', '#e3b98f'),
}
FLAT = {'rug-6x9', 'rug-8x10', 'sofa-recline-zone'}           # lie under furniture, never collide with it
SEATS = {'dining-chair', 'bar-stool', 'office-chair'}            # may tuck under tables and desks
STACK = {'floor-lamp': ['side-table'], 'dog': ['dog-bed', 'dog-crate'], 'dog-curled': ['dog-bed', 'dog-crate']}   # may stand on these
SUPPORT = {k for v in STACK.values() for k in v}
DECK = {'dog-bed': F.FURNITURE['dog-bed']['deck'],               # what stands on it sits this high (default: its top)
        'dog-crate': 1.6}                                        # top of the crate's plastic tray (see dog_crate)
SMOOTH = {'dog', 'dog-curled', 'dog-bed'}                        # organic shapes: smooth shading, not faceted
# Two-state pieces: one library entry; the selected piece switches state (button, F key, double-click).
# anchor 'back': the back edge stays put (the sofa bed opens forward); 'center': the middle stays put.
VARIANTS = {'sofa-bed-folded': ('sofa-bed-open', 'Open into a bed', 'back', 'Opens forward to 61″ deep'),
            'sofa-bed-open': ('sofa-bed-folded', 'Fold back into a sofa', 'back', None),
            'drop-leaf-folded': ('drop-leaf-open', 'Open the leaves', 'center', 'Opens to a 40″ round'),
            'drop-leaf-open': ('drop-leaf-folded', 'Fold the leaves down', 'center', None),
            'bike-warroad': ('bike-warroad-up', 'Stand it up', 'pivot', 'Stands up in its stand: 37½″ × 17″, 5′7″ tall'),
            'bike-warroad-up': ('bike-warroad', 'Lay it down', 'pivot', None),
            'bike-avail': ('bike-avail-up', 'Stand it up', 'pivot', 'Stands up in its stand: 36½″ × 17″, 5′6″ tall'),
            'bike-avail-up': ('bike-avail', 'Lay it down', 'pivot', None),
            'dog': ('dog-curled', 'Curl up for a nap', 'center', 'Curls up to sleep · lies in the donut bed or her crate'),
            'dog-curled': ('dog', 'Wake up', 'center', None)}
LIBNOTE = {'nightstand-fluted': 'top at 23⅞″ inside a 3″ rim',
           'mirror-65': '½″ thick · leans out about 6″ at the bottom', 'mirror-77': '1″ thick · leans out about 7″ at the bottom'}
SRC = {'sofa-bed-folded': 'sofa-bed', 'sofa-bed-open': 'sofa-bed', 'drop-leaf-open': 'drop-leaf-table',
       'drop-leaf-folded': 'drop-leaf-table', 'bike-on-wall-hook': 'bike-warroad', 'dog-curled': 'dog',
       'bike-warroad-up': 'bike-warroad', 'bike-avail-up': 'bike-avail'}
TUCK = {'dining-round-36', 'dining-round-42', 'dining-oval-42x60', 'dining-rect-30x48', 'dining-rect-36x60',
        'dining-rect-36x78', 'standing-desk', 'coffee-table', 'drop-leaf-open', 'drop-leaf-folded'}

# Example layout (plan inches; r = degrees, 0 = front faces south, 90 = east, 180 = north, -90 = west).
EXAMPLE = [
    ('sofa', 340, 107, 180), ('coffee-table', 340, 62, 180), ('rug-6x9', 334, 72, 0),
    ('tv-stand', 340, 23, 0), ('yellow-loveseat', 268, 83, 90), ('side-table', 288, 110, 0),
    ('floor-lamp', 290.2, 113.5, 0), ('plant', 394, 112, 0), ('white-dresser', 282, 9, 0),
    ('bar-stool', 256, 28, -90), ('bar-stool', 256, 56, -90),
    ('shoe-cabinet', 30, 136.5, 0), ('mirror-77', 315, 136.1, 0), ('mirror-65', 62, 118.7, 180),
    ('office-chair', 79, 50, 90),
    ('dining-round-42', 413, 34, 0), ('dining-chair', 384, 34, 90), ('dining-chair', 413, 63, 180),
    ('queen-bed', 342, 209.5, 90), ('nightstand', 308, 169, 90), ('dresser-16', 380, 140.6, 0),
    ('sofa-bed-folded', 20.5, 61, 90), ('dresser-guest', 60, 9.5, 0), ('standing-desk', 98.5, 50, -90),
    ('dog-bed', 98.5, 13.5, 0), ('dog-curled', 98.5, 13.5, 0),
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
        f = F.FURNITURE[SRC.get(k, k)]
        if isinstance(color, dict):                         # built in colored parts
            parts = F.BUILDERS[k](f, s, parts=True)
        else:
            man = pieces[k]
            if k == 'tv-stand':
                man = F.union([man, F.tv_on_stand(F.FURNITURE['tv-stand'], s)])
            if k == 'coffee-table':
                man = man.mirror([0, 0, 1]).translate([0, 0, F.FURNITURE[k]['h'] * s])
            elif k.startswith('dining-') and k != 'dining-chair':
                man = man.rotate([180, 0, 0]).translate([0, 0, F.FURNITURE[k]['h'] * s])
            parts = [('main', man)]
        pivot = [m for role, m in parts if role == 'pivot']         # where a two-state piece stays put
        arrs = [(role, *manifold_arrays(m)) for role, m in parts if role != 'pivot']
        allv = np.vstack([v for _, v, _ in arrs]) / s        # real inches; x width, y depth (front at 0), z up
        x0, y0, z0 = allv.min(axis=0)
        x1, y1, z1 = allv.max(axis=0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        meshes = []
        for role, v, fc in arrs:
            v = v / s
            # local -> web: x right, y up, z toward the front (front faces +z when r = 0)
            w = np.column_stack([v[:, 0] - cx, v[:, 2] - z0, cy - v[:, 1]])
            meshes.append(dict(color=color[role] if isinstance(color, dict) else color, mesh=pack(w, fc)))
        W, D, H = x1 - x0, y1 - y0, z1 - z0
        hit = [-W / 2, W / 2, -D / 2, D / 2]
        if k == 'floor-lamp':
            r = f['base_dia'] / 2
            allm = np.vstack([v for _, v, _ in arrs]) / s
            bx, by = allm[allm[:, 2] < z0 + 0.5].mean(axis=0)[:2]
            hit = [bx - cx - r, bx - cx + r, cy - by - r, cy - by + r]
        elif k == 'plant':
            r = f['saucer_dia'] / 2
            hit = [-r, r, -r, r]
        swatch = color if isinstance(color, str) else next(iter(color.values()))
        out[k] = dict(name=name, group=group, color=swatch, size=[round(W, 1), round(D, 1), round(H, 1)],
                      hit=[round(h, 2) for h in hit], flat=k in FLAT, seat=k in SEATS, tuck=k in TUCK,
                      stack=STACK.get(k, False), support=k in SUPPORT, note=f.get('note', ''), parts=meshes)
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
        rooms.append(dict(name=r['name'].title().replace('Bedroom 2', 'Main bedroom').replace('Bedroom 1', 'Guest bedroom'),
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
