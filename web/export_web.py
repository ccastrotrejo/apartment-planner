"""Exports the apartment and the modeled furniture for the web planner (index.html in this folder).

    python3 web/export_web.py        # -> the scene data embedded in web/index.html (between the scene: markers)

Geometry is the same code as the printed model. Furniture is built at 1:12 instead of 1:60, so the print
minimums (in mm) shrink to near-real sizes (legs, rods, rug thickness). Everything is written in real inches,
in plan coordinates: x east, z south (the plan's y), y up, floor at y = 0.
"""
import argparse
import base64
import json
import math
import os
import sys

import manifold3d as m3d
import numpy as np
from shapely.geometry import LineString, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build                       # noqa: E402
import floorplan as fp             # noqa: E402
import furniture as F              # noqa: E402
if __package__:
    from .layout_check import WalkCheck, front_from  # noqa: E402
else:
    from layout_check import WalkCheck, front_from  # noqa: E402

SCALE = 12

# name, library group, color (one color, or {part: color} for pieces built in colored parts)
TIRES = {'tires': '#1b1b1b', 'kit': '#2e2e2e'}
PIECES = {
    'sectional': ('Sectional, chaise on the left', 'Living room', {'upholstery': '#ece6da', 'legs': '#6b4a2f'}),
    'coffee-table': ('Lift-top coffee table', 'Living room', {'top': '#8a5a36', 'body': '#6f4528'}),
    'coffee-table-open': ('Lift-top coffee table, lifted', 'Living room', {'top': '#8a5a36', 'body': '#6f4528'}),
    'tv-stand': ('65″ TV on rolling stand', 'Living room', {'base': '#cbb08a', 'stand': '#eeece7', 'tv': '#1b1c1f'}),
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
    'bike-black': ('Black road bike on a wall rack', 'Entry & storage',
                   {'frame': '#2c3027', **TIRES, 'rack': '#a0774c'}),
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

# Material preset for each colored part (the page maps presets to roughness / metalness / sheen).
ROLE_MAT = {'upholstery': 'fabric', 'legs': 'wood', 'top': 'wood', 'body': 'wood', 'base': 'wood', 'stand': 'paint',
            'tv': 'screen', 'screens': 'screen', 'metal': 'metal', 'shade': 'fabric', 'frame': 'metal',
            'mesh': 'fabric', 'shell': 'plastic', 'wood': 'wood', 'bedding': 'fabric', 'pillows': 'fabric',
            'throw': 'fabric', 'cane': 'rattan', 'glass': 'mirror', 'pulls': 'brass', 'tires': 'rubber',
            'kit': 'metal', 'rack': 'wood', 'pot': 'ceramic', 'leaf': 'plant', 'main': 'wood'}
PIECE_ROLE_MAT = {
    'queen-bed': {'frame': 'fabric'},                     # upholstered frame
    'tripod-lamp': {'legs': 'metal'},
    'bike-black': {'frame': 'paint'}, 'bike-red-wall': {'frame': 'paint'},
    'rug-6x9': {'main': 'rug'},
}

# Floor finishes: porcelain tile in the bath and laundry alcove (out to the hall face of their doorways),
# oak everywhere else, with a metal threshold strip under each of these doors.
WET_FLOORS = [('core_W', 'bath_E_in', 'bath_N', 'bath_S'), ('core_W', 'wd_E', 'alc_S_out', 'wd_S')]
WET_DOORS = ('bath', 'W/D')
BATH_TILE = ('core_W_in', 'bath_E_in', 'bath_N', 'bath_S')        # walls tiled floor to ceiling (from the video)

# Example layout (plan inches; r = degrees, 0 = front faces south, 90 = east, 180 = north, -90 = west).
EXAMPLE = [
    # A 30 in route runs from the entry around the island, through both rooms, and to every door and fixture.
    ('sectional', 32, 120, 90), ('rug-6x9', 62, 104, 90), ('coffee-table', 64.5, 104, -90),
    ('tv-stand', 121, 104, -90), ('standing-desk', 57.5, 14.5, 0), ('office-chair', 57.5, 36, 180),
    ('queen-bed', 201.2, 62.9, -90), ('nightstand', 233.85, 22.2, -90),
    ('nightstand', 233.85, 103.6, -90),
    # Storage and bikes sit out of the circulation route. The stools line the living-side partition wall.
    ('bike-red-wall', 116.25, 310, -90), ('bike-black', 48, 182, 180),
    ('shoe-cabinet', 67.5, 367.5, 90), ('coat-rack', 117, 236, 0), ('arched-mirror', 137.25, 137, 90),
    ('hall-cabinet', 121, 59, -90), ('tier-shelf', 104, 42.5, 0),
    ('counter-stool', 70.75, 200, 90), ('counter-stool', 70.75, 218, 90),
    ('torchiere-lamp', 11, 45, 0), ('tripod-lamp', 217.7, 9, 0),
    ('plant-monstera', 14, 6, 0), ('plant-zz', 93, 5, 0),
]

# Layout ideas shown in the page's Layouts sheet: each starts from EXAMPLE and moves some pieces
# ({piece: [(x, z, r), ...]} replaces that piece's placements in order). Empty lists remove a piece.
# Each idea keeps clear door swings, fixture approach zones, a 30 in circulation route, and 24 in local access.
IDEAS = [
    ('Desk at the corner window', 'Standing desk turned to face the west window; the north window stays open '
     'for plants and the lamp.',
     {'standing-desk': [(16.9, 27.6, 90)], 'office-chair': [(44.5, 27.6, -90)],
      'torchiere-lamp': [(65, 9, 0)], 'plant-monstera': [(37, 6, 0)]}),
    ('Open lounge', 'The coffee table, rug, and side shelf are removed for the widest uninterrupted circulation '
     'and a clear center floor.',
     {'coffee-table': [], 'rug-6x9': [], 'tier-shelf': []}),
    ('Guest ready', 'The coffee table is stored away so the sectional can be used as a bed, and the desk chair '
     'is tucked under the desk.',
     {'coffee-table': [], 'office-chair': [(57.5, 24, 180)]}),
]

# The built-in "With guest" layout clears the sectional fully by storing the coffee table away.
GUEST = {'coffee-table': [], 'office-chair': [(57.5, 24, 180)]}


def idea_items(moves):
    out, used = [], {}
    for k, x, z, r in EXAMPLE:
        if k in moves:
            i = used.get(k, 0)
            used[k] = i + 1
            if i < len(moves[k]):
                out.append([k, *moves[k][i]])
        else:
            out.append([k, x, z, r])
    return out


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


def _frame(front, x0, z0, x1, z1):
    """Local fixture frame: u across the front (left to right as you face it), v from the front face (0) to the
    back, y up. Returns width, depth, a 3x4 matrix mapping local -> manifold inches (x east, -z south, y up),
    and a world (x, z) -> local (u, v) function. Every mapping is a proper rotation, so winding is kept."""
    if front == 'E':
        return z1 - z0, x1 - x0, [[0, -1, 0, x1], [1, 0, 0, -z1], [0, 0, 1, 0]], lambda x, z: (z1 - z, x1 - x)
    if front == 'W':
        return z1 - z0, x1 - x0, [[0, 1, 0, x0], [-1, 0, 0, -z0], [0, 0, 1, 0]], lambda x, z: (z - z0, x - x0)
    if front == 'N':
        return x1 - x0, z1 - z0, [[-1, 0, 0, x1], [0, -1, 0, -z0], [0, 0, 1, 0]], lambda x, z: (x1 - x, z - z0)
    return x1 - x0, z1 - z0, [[1, 0, 0, x0], [0, 1, 0, -z1], [0, 0, 1, 0]], lambda x, z: (x - x0, z1 - z)


def _local_rect(to_uv, r):
    """World rect (x0, z0, x1, z1) -> local (u0, v0, u1, v1)."""
    a, b = to_uv(r[0], r[1]), to_uv(r[2], r[3])
    return min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])


# Local-frame primitives (u, v, y in real inches)
def _B(u0, v0, y0, u1, v1, y1):
    return F.cube(min(u0, u1), min(v0, v1), min(y0, y1), max(u0, u1), max(v0, v1), max(y0, y1))


def _RB(u0, v0, y0, u1, v1, y1, r, segs=10):
    return F._rbox(min(u0, u1), min(v0, v1), min(y0, y1), max(u0, u1), max(v0, v1), max(y0, y1), r, segs)


def _RS(u0, v0, y0, u1, v1, y1, rxy, rz=0.0, segs=16):
    return F._rslab(min(u0, u1), min(v0, v1), min(y0, y1), max(u0, u1), max(v0, v1), max(y0, y1), rxy, rz, segs)


def _CY(u, v, y0, y1, r0, r1=None, segs=28):
    return m3d.Manifold.cylinder(y1 - y0, r0, r0 if r1 is None else r1, segs).translate([u, v, y0])


def _CYV(u, v_back, y, length, r0, r1=None, segs=28):
    """Cylinder whose axis points out of the front: spans v in [v_back - length, v_back]."""
    return m3d.Manifold.cylinder(length, r0, r0 if r1 is None else r1, segs).rotate([90, 0, 0]).translate([u, v_back, y])


def _ellipse(ru, rv, segs=40):
    a = np.linspace(0, 2 * np.pi, segs, endpoint=False)
    return m3d.CrossSection([np.column_stack([ru * np.cos(a), rv * np.sin(a)])], m3d.FillRule.NonZero)


UPPER_Y0, UPPER_Y1, UPPER_D = 54.0, 88.0, 13.0       # kitchen uppers (web only: drawn with full-height walls)


def _backing(g, W, D, h, top=None):
    """Matte panel closing the back of a kitchen run, floor to counter (and counter to the top of the uppers on the
    web-only layer), so the run reads as finished casework when the wall is see-through. It reaches 0.05" into
    the wall so nothing behind it is coplanar with its faces."""
    g['backing'].append(_B(0, D - 0.3, 0, W, D + 0.05, h - 0.05))
    g['upper_backing'].append(_B(0, D - 0.3, h - 0.05, W, D + 0.05, (top or UPPER_Y1) - 0.02))


def _cabinets(g, W, D, h, sink=None, end_panel=None):
    """Handle-less slab base cabinets (greige wood) with a white quartz top, an optional undermount sink
    (local rect) and an optional wood end panel at an exposed end ('lo' = u 0, 'hi' = u W). Adds the
    full-height backsplash and pale slab uppers to the web-only upper_* layers."""
    g['fixture_dark'].append(_B(0, 3.0, 0, W, D, 3.8))
    body = _B(0, 0.85, 3.8, W, D, h - 1.25)
    if sink:
        su0, sv0, su1, sv1 = sink
        body = body - _RS(su0 - 0.9, sv0 - 0.9, h - 9.0, su1 + 0.9, sv1 + 0.9, h, 1.6)
    g['cab_wood'].append(body)
    nb = max(1, round(W / 18.0))
    du = W / nb
    for i in range(nb):                                  # full-height slab doors, 1/8" reveals, no pulls
        g['cab_wood'].append(_B(i * du + 0.07, 0.1, 4.0, (i + 1) * du - 0.07, 0.86, h - 2.7))
    g['fixture_dark'].append(_B(0, 0.6, h - 2.7, W, 0.9, h - 1.25))     # finger-pull channel under the counter
    if end_panel:
        u0, u1 = (0.0, 0.75) if end_panel == 'lo' else (W - 0.75, W)
        g['cab_wood'].append(_B(u0, 0.0, 0.0, u1, D, h - 1.25))
    slab = _B(0, -0.6, h - 1.25, W, D, h)
    if sink:
        slab = slab - _RS(su0, sv0, h - 2.5, su1, sv1, h + 1.0, 1.25)
    g['countertop'].append(slab)
    g['upper_backsplash'].append(_B(0, D - 0.35, h, W, D, UPPER_Y0))
    _uppers(g, W, D, UPPER_Y0)
    _backing(g, W, D, h)
    if sink:
        bowl = (_RS(su0 - 0.85, sv0 - 0.85, h - 8.6, su1 + 0.85, sv1 + 0.85, h - 1.15, 1.0)
                - _RS(su0, sv0, h - 8.0, su1, sv1, h - 0.6, 0.8))
        g['fixture_metal'].append(bowl)
        cu, cv = (su0 + su1) / 2, (sv0 + sv1) / 2
        g['fixture_dark'].append(_CY(cu, cv, h - 8.05, h - 7.82, 1.55))
        fv = min(sv1 + 2.1, D - 1.2)                     # pull-down gooseneck behind the bowl, spout over it
        arc = [(cu, fv, h - 0.1), (cu, fv, h + 9.5)]
        for a_deg in np.linspace(0, 165, 14):
            rad = math.radians(a_deg)
            arc.append((cu, fv - 3.4 * (1 - math.cos(rad)), h + 9.5 + 3.4 * math.sin(rad)))
        g['fixture_metal'].append(F._tube(arc, 0.42))
        g['fixture_metal'].append(_CY(cu, fv, h - 0.1, h + 1.2, 0.95, 0.8))
        g['fixture_metal'].append(F._tube([(cu + 0.8, fv, h + 2.5), (cu + 2.8, fv, h + 4.5)], 0.22))


def _uppers(g, W, D, y0):
    """Pale handle-less slab uppers against the back wall, from y0 to the top of the run."""
    v0 = D - UPPER_D
    g['upper_cab_white'].append(_B(0, v0 + 0.8, y0, W, D, UPPER_Y1))
    nb = max(1, round(W / 18.0))
    du = W / nb
    for i in range(nb):
        g['upper_cab_white'].append(_B(i * du + 0.07, v0, y0 + 0.1, (i + 1) * du - 0.07, v0 + 0.82, UPPER_Y1 - 0.1))
    if y0 <= UPPER_Y0:                                   # under-cabinet LED strip
        g['upper_bulb'].append(_B(1.0, v0 + 1.2, y0 - 0.25, W - 1.0, v0 + 1.8, y0))


def _range(g, W, D, h):
    """Slide-in gas range: stainless body, cast black grates over four burners, front controls, oven window."""
    g['appliance'].append(_B(0.12, 0.85, 0, W - 0.12, D, h - 0.4))
    g['appliance'].append(_RB(0.22, 0.08, 0.5, W - 0.22, 0.9, 6.7, 0.15))
    g['appliance'].append(_RB(0.22, 0.08, 7.1, W - 0.22, 0.9, 29.8, 0.18) - _B(4.4, -0.2, 11.4, W - 4.4, 0.55, 25.4))
    g['fixture_dark'].append(_B(4.4, 0.28, 11.4, W - 4.4, 0.62, 25.4))
    g['appliance'].append(_RB(0.22, -0.05, 30.2, W - 0.22, 0.9, 35.45, 0.18))
    g['cooktop'].append(_RS(0.2, 0.1, h - 0.45, W - 0.2, D - 0.5, h, 0.4))            # charcoal enamel cooktop
    gv0, gv1, gy = 1.2, D - 1.6, h + 0.95
    for ga, gb in ((0.9, W / 2 - 0.2), (W / 2 + 0.2, W - 0.9)):                    # two cast-iron grates
        bars = [_B(ga, gv0, h, gb, gv0 + 0.5, gy), _B(ga, gv1 - 0.5, h, gb, gv1, gy),
                _B(ga, gv0, h, ga + 0.5, gv1, gy), _B(gb - 0.5, gv0, h, gb, gv1, gy),
                _B((ga + gb) / 2 - 0.25, gv0, h, (ga + gb) / 2 + 0.25, gv1, gy),
                _B(ga, (gv0 + gv1) / 2 - 0.25, h, gb, (gv0 + gv1) / 2 + 0.25, gy)]
        g['fixture_dark'].append(F.union(bars))
    for fv in (0.3, 0.7):
        for fu in (0.25, 0.75):
            g['fixture_dark'].append(_CY(W * fu, gv0 + (gv1 - gv0) * fv, h, h + 0.55, 1.6, 1.4))
    g['fixture_metal'].append(F._tube([(3.0, 0.1, 27.8), (3.0, -1.1, 27.8), (W - 3.0, -1.1, 27.8), (W - 3.0, 0.1, 27.8)], 0.34))
    for ku in np.linspace(3.5, W - 3.5, 5):
        g['fixture_dark'].append(_CYV(ku, 0.0, 32.85, 0.75, 0.72, 0.66, 20))
    # over-the-range microwave with pale uppers above it, and backsplash tile between
    g['upper_backsplash'].append(_B(0, D - 0.35, h, W, D, UPPER_Y0))
    g['upper_appliance'].append(_RB(0.3, D - 15.5, UPPER_Y0, W - 0.3, D - 0.4, UPPER_Y0 + 16.4, 0.3))
    g['upper_fixture_dark'].append(_B(2.0, D - 15.62, UPPER_Y0 + 2.6, W - 7.0, D - 15.4, UPPER_Y0 + 13.6))
    g['upper_fixture_metal'].append(F._tube([(W - 5.5, D - 15.4, UPPER_Y0 + 2.6), (W - 5.5, D - 16.6, UPPER_Y0 + 2.6),
                                             (W - 5.5, D - 16.6, UPPER_Y0 + 13.6), (W - 5.5, D - 15.4, UPPER_Y0 + 13.6)], 0.32))
    _uppers(g, W, D, UPPER_Y0 + 16.8)
    _backing(g, W, D, h)


def _fridge(g, W, D, h):
    """Stainless bottom-freezer fridge (one door over a freezer drawer), boxed in by wood side panels and a
    wood cabinet above (the panels' upper half and the cabinet are web-only upper layers)."""
    pu0, pu1 = 0.8, W - 0.8
    g['appliance'].append(_B(pu0 + 0.2, 2.1, 0, pu1 - 0.2, D, h - 0.5))
    g['appliance'].append(_RB(pu0 + 0.22, 0, 0.8, pu1 - 0.22, 2.2, 27.2, 0.35))
    g['appliance'].append(_RB(pu0 + 0.22, 0, 27.7, pu1 - 0.22, 2.2, h, 0.35))
    g['fixture_dark'].append(_B(pu0 + 0.9, -0.02, 38.0, pu0 + 1.9, 0.6, 62.0))      # flush pocket handle, door edge
    g['fixture_dark'].append(_B(pu0 + 4.0, -0.02, 25.6, pu1 - 4.0, 0.6, 26.6))      # recessed freezer-drawer pull
    for u0, u1 in ((0.0, 0.75), (W - 0.75, W)):
        g['cab_wood'].append(_B(u0, 0.0, 0.0, u1, D, h))
        g['upper_cab_wood'].append(_B(u0, 0.0, h, u1, D, UPPER_Y1))
    g['upper_cab_wood'].append(_B(0.75, 0.8, h + 0.5, W - 0.75, D, UPPER_Y1))
    g['upper_cab_wood'].append(_B(0.82, 0.0, h + 0.6, W - 0.82, 0.82, UPPER_Y1 - 0.1))
    _backing(g, W, D, h)


def _vanity(g, W, D, h):
    """Two-drawer handle-less greige vanity on chrome legs, white top with an integrated basin."""
    cu, cv = W / 2, D / 2 - 1.6
    sw, sd = min(16.4, W - 6.0), min(11.2, D - 8.0)
    for lu in (1.1, W - 1.1):
        for lv in (1.2, D - 1.2):
            g['fixture_metal'].append(_CY(lu, lv, 0, 8.3, 0.4))
    g['cab_wood'].append(_B(0.2, 0.8, 8.0, W - 0.2, D, h - 1.25)
                         - _RS(cu - sw / 2 - 1.2, cv - sd / 2 - 1.2, h - 7.2, cu + sw / 2 + 1.2, cv + sd / 2 + 1.2, h, 2.7))
    mid = 8.0 + (h - 1.25 - 8.0) / 2
    for ya, yb in ((8.1, mid - 0.25), (mid + 0.25, h - 2.0)):     # finger-pull gap above each drawer
        g['cab_wood'].append(_B(0.25, 0.1, ya, W - 0.25, 0.85, yb))
    top = F.union([_RS(-0.3, -0.35, h - 1.25, W + 0.3, D, h, 0.3, rz=0.08), _B(-0.2, D - 0.55, h - 0.1, W + 0.2, D, h + 2.6)])
    g['ceramic'].append(top - _RS(cu - sw / 2, cv - sd / 2, h - 2.2, cu + sw / 2, cv + sd / 2, h + 0.8, 2.2))
    g['ceramic'].append(_RS(cu - sw / 2 - 0.8, cv - sd / 2 - 0.8, h - 6.8, cu + sw / 2 + 0.8, cv + sd / 2 + 0.8, h - 1.15, 2.6)
                        - _RS(cu - sw / 2, cv - sd / 2, h - 6.1, cu + sw / 2, cv + sd / 2, h - 0.6, 2.2))
    g['fixture_metal'].append(_CY(cu, cv, h - 6.15, h - 5.95, 1.0))
    fv = cv + sd / 2 + 1.9
    g['fixture_metal'].append(F._tube([(cu, fv, h - 0.1), (cu, fv, h + 5.4), (cu, fv - 3.6, h + 5.0)], 0.32))
    g['upper_mirror'].append(_B(0.6, D - 0.8, h + 8.0, W - 0.6, D, 72.0))                  # frameless mirror cabinet
    g['upper_fixture_metal'].append(_RB(cu - 9.0, D - 1.1, 76.4, cu + 9.0, D, 77.6, 0.3))     # light bar
    for du_ in (-5.5, 5.5):
        g['upper_fixture_metal'].append(_CY(cu + du_, D - 2.4, 75.5, 77.0, 0.35))
        g['upper_bulb'].append(m3d.Manifold.sphere(2.3, 28).translate([cu + du_, D - 2.6, 74.8]))


def _toilet(g, bowl, tank):
    """Sculpted porcelain bowl, closed lid, and tank (local rects; the tank sits behind the bowl)."""
    u0, v0, u1, v1 = bowl
    tu0, tv0, tu1, tv1 = tank
    cu, cv, ru, rv = (u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) / 2, (v1 - v0) / 2
    skirt = m3d.Manifold.batch_hull([_ellipse(ru * 0.68, rv * 0.64).extrude(0.3).translate([cu, cv + 1.2, 0]),
                                     _ellipse(ru, rv).extrude(2.2).translate([cu, cv, 12.6])])
    well = _ellipse(ru * 0.72, rv * 0.72).extrude(5.0).translate([cu, cv - 0.5, 10.5])
    lid = m3d.Manifold.batch_hull([_ellipse(ru * 0.98, rv * 0.98).extrude(0.35).translate([cu, cv, 14.85]),
                                   _ellipse(ru * 0.9, rv * 0.9).extrude(0.25).translate([cu, cv, 15.45])])
    bridge = _B(u0 + 1.4, v1 - 4.5, 0, u1 - 1.4, tv1 - 0.2, 14.6)
    body = _RB(tu0 + 0.35, tv0 + 0.2, 14.3, tu1 - 0.35, tv1 - 0.15, 28.1, 0.95)
    tlid = _RS(tu0, tv0, 28.0, tu1, tv1, 29.1, 1.05, rz=0.2)
    g['ceramic'].append(F.union([skirt - well, lid, bridge, body, tlid]))
    g['fixture_metal'].append(_RB(tu0 + 0.5, tv0 - 0.45, 26.2, tu0 + 2.2, tv0 + 0.5, 26.7, 0.12))


def _tub(g, W, D, h):
    """Alcove tub: white apron at the front, deep sculpted basin, spout and drain at the u = 0 end."""
    g['cab_white'].append(_B(0, 0, 0, W, 1.25, h - 0.9) - _B(3.2, -0.2, 2.6, W - 3.2, 0.38, h - 3.2))
    deck = F.union([_B(0, 1.0, 0, W, D, h - 0.8), _RS(0, 0, h - 1.0, W, D, h, 0.35, rz=0.12)])
    basin = m3d.Manifold.batch_hull([_RS(4.6, 4.4, 3.2, W - 6.5, D - 3.8, 3.8, 5.2),
                                     _RS(3.6, 3.2, h - 0.4, W - 3.5, D - 2.8, h + 1.0, 5.6)])
    g['ceramic'].append(deck - basin)
    mv = D / 2 + 0.2
    g['fixture_metal'].append(_CY(7.5, mv, 3.15, 3.38, 1.25))
    g['fixture_metal'].append(F._tube([(-0.1, mv, h + 3.5), (4.6, mv, h + 3.2)], 0.58))
    g['fixture_metal'].append(m3d.Manifold.cylinder(0.4, 1.1, 1.1, 24).rotate([0, 90, 0]).translate([3.7, mv, h - 4.5]))
    g['fixture_metal'].append(m3d.Manifold.cylinder(2.2, 1.5, 1.3, 24).rotate([0, 90, 0]).translate([-0.1, mv, h + 11.0]))
    rod = [(0.2 + (W - 0.4) * t, 1.4 - 5.0 * (1 - (2 * t - 1) ** 2), 77.0) for t in np.linspace(0, 1, 17)]
    g['upper_fixture_metal'].append(F._tube(rod, 0.5))                  # curved shower rod
    for ru in (0.0, W - 0.6):
        g['upper_fixture_metal'].append(m3d.Manifold.cylinder(0.6, 1.3, 1.3, 24).rotate([0, 90, 0]).translate([ru, 1.4, 77.0]))
    g['upper_fixture_metal'].append(F._tube([(-0.1, mv, 73.0), (4.5, mv, 72.0), (6.0, mv, 70.6)], 0.35))   # showerhead arm
    g['upper_fixture_metal'].append(m3d.Manifold.cylinder(0.8, 2.2, 2.6, 28).rotate([0, -35, 0]).translate([6.2, mv, 69.6]))


def _laundry(g, W, D, h):
    """Stacked front-load washer and dryer: porthole doors with chrome bezels, a control knob."""
    cu = W / 2
    g['appliance'].append(_RB(0, 0.85, 0.3, W, D, 37.6, 0.55))
    g['appliance'].append(_RB(0, 0.85, 38.2, W, D, h, 0.55))
    g['fixture_dark'].append(_B(0.4, 0.75, 37.5, W - 0.4, D - 0.4, 38.3))
    for yh in (19.5, 57.5):
        ring = m3d.Manifold.cylinder(1.15, 7.3, 6.9, 36) - m3d.Manifold.cylinder(1.6, 5.5, 5.5, 36).translate([0, 0, -0.2])
        g['fixture_metal'].append(ring.rotate([90, 0, 0]).translate([cu, 1.0, yh]))
        g['fixture_dark'].append(_CYV(cu, 0.9, yh, 0.55, 5.6, 5.6, 32))
    g['fixture_metal'].append(_CYV(W - 4.5, 1.0, h - 3.5, 0.65, 1.05, 0.95, 24))


UPPER_KEYS = ('upper_cab_white', 'upper_cab_wood', 'upper_backsplash', 'upper_appliance', 'upper_fixture_dark',
              'upper_fixture_metal', 'upper_backing', 'upper_bulb', 'upper_mirror')


def web_fixtures(plan):
    """Detailed multi-material built-ins, keyed by fixture kind and placed by each fixture's front. upper_* layers
    (kitchen uppers, backsplash, microwave) rise above the 4' cut, so the page shows them with full walls only."""
    keys = ('cab_wood', 'cab_white', 'countertop', 'ceramic', 'appliance', 'cooktop', 'fixture_dark', 'fixture_metal', 'backing') + UPPER_KEYS
    g = {k: [] for k in keys}
    fixtures = list(plan.fixtures())
    doors = {d.get('name', ''): h for d, h, t, o, r in plan.doors()}
    tank = next((gm.bounds for f, gm in fixtures if 'tank' in f['name']), None)

    def place(front, bounds, build_fn):
        W, D, M, to_uv = _frame(front, *bounds)
        local = {k: [] for k in g}
        build_fn(local, W, D, to_uv)
        for k, ms in local.items():
            g[k] += [m.transform(np.array(M, float)) for m in ms]

    def exposed_end(f, gm):
        """'lo' / 'hi' if that end of a run has no other fixture against it (gets a wood end panel)."""
        x0, z0, x1, z1 = gm.bounds
        ends = {'E': (box(x0, z1, x1, z1 + 1), box(x0, z0 - 1, x1, z0)), 'W': (box(x0, z0 - 1, x1, z0), box(x0, z1, x1, z1 + 1)),
                'N': (box(x1, z0, x1 + 1, z1), box(x0 - 1, z0, x0, z1)), 'S': (box(x0 - 1, z0, x0, z1), box(x1, z0, x1 + 1, z1))}
        lo, hi = ends[f['front']]
        others = [o for o2, o in fixtures if o is not gm]
        free = lambda strip: not any(o.intersection(strip).area > 0.5 for o in others)
        return 'hi' if free(hi) else ('lo' if free(lo) else None)

    for f, gm in fixtures:
        kind, b, h = f.get('kind'), gm.bounds, float(f['h'])
        if kind == 'cabinets':
            sink = plan.rect(f['sink'], frame=f['rect']) if f.get('sink') else None
            end = exposed_end(f, gm)
            place(f['front'], b, lambda L, W, D, uv: _cabinets(
                L, W, D, h, _local_rect(uv, (sink[0], sink[2], sink[1], sink[3])) if sink else None, end))
        elif kind == 'range':
            place(f['front'], b, lambda L, W, D, uv: _range(L, W, D, h))
        elif kind == 'fridge':
            place(f['front'], b, lambda L, W, D, uv: _fridge(L, W, D, h))
        elif kind == 'vanity':
            place(f['front'], b, lambda L, W, D, uv: _vanity(L, W, D, h))
        elif kind == 'tub':
            place(f['front'], b, lambda L, W, D, uv: _tub(L, W, D, h))
        elif kind == 'toilet' and tank:
            c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            front = {'E': 'W', 'W': 'E', 'N': 'S', 'S': 'N'}[front_from(c, ((tank[0] + tank[2]) / 2, (tank[1] + tank[3]) / 2))]
            both = (min(b[0], tank[0]), min(b[1], tank[1]), max(b[2], tank[2]), max(b[3], tank[3]))
            place(front, both, lambda L, W, D, uv: _toilet(L, _local_rect(uv, b), _local_rect(uv, tank)))
        elif kind == 'appliance':
            c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            hinge = doors.get('W/D')
            front = f.get('front') or (front_from(c, hinge) if hinge is not None else 'S')
            place(front, b, lambda L, W, D, uv: _laundry(L, W, D, h))
    return {k: F.union(ms) for k, ms in g.items() if ms}


def apartment(plan):
    a = argparse.Namespace(scale=SCALE, wall_height=90.0, sill=18.0, glass_curb_mm=1.2, floor_mm=2.0,
                           groove_mm=0.8, groove_depth_mm=0.6)
    comps, _, T, s = build.build_model(plan, a)
    fpoly = plan.footprint()
    minx, maxy = fpoly.bounds[0], fpoly.bounds[3]
    X, Y = plan.X, plan.Y

    def pack_model(man):
        v, f = manifold_arrays(man)
        # model mm (x east, y north, z up; floor top at floor_mm) -> plan inches (x, up, z south)
        return pack(np.column_stack([v[:, 0] / s + minx, v[:, 2] / s - a.floor_mm / s, maxy - v[:, 1] / s]), f)

    def pack_inches(man):
        v, f = manifold_arrays(man)                     # (x east, -z south, y up) -> (x, y, z)
        return pack(np.column_stack([v[:, 0], v[:, 2], -v[:, 1]]), f)

    wet = unary_union([box(X[x0], Y[y0], X[x1], Y[y1]) for x0, x1, y0, y1 in WET_FLOORS])
    wet_cut = build.to_xsec(wet, T).extrude(a.floor_mm + 4.0).translate([0, 0, -2.0])

    # Stepped baseboards on the room side of every wall, clear of doorways, sliders, glass and built-ins
    walls = unary_union(plan.walls())
    clear = [g.buffer(0.8) for w, g in plan.windows() if w['kind'] == 'full']
    clear.append(box(*build._xyxy(plan.rect(fp.ENTRY_OPENING))).buffer(0.8))
    clear += [LineString(p).buffer(1.2) for p in plan.slider_paths()]
    clear += [box(min(h[0], t[0]), min(h[1], t[1]), max(h[0], t[0]), max(h[1], t[1])).buffer(1.2)
              for d, h, t, o, r in plan.doors()]
    clear += [g.buffer(0.15) for f, g in plan.fixtures()]
    bath = box(X[BATH_TILE[0]], Y[BATH_TILE[2]], X[BATH_TILE[1]], Y[BATH_TILE[3]])
    clear.append(bath)
    clear = unary_union(clear)
    room = fpoly.buffer(-0.08)
    fl = a.floor_mm
    base = F.union([build.to_xsec(walls.buffer(w, join_style=2).difference(walls).intersection(room).difference(clear), T)
                    .extrude(hh * s).translate([0, 0, fl - 0.02]) for w, hh in ((0.45, 3.0), (0.30, 3.6))])

    out = {
        'floor_wood': pack_model(comps['floor'] - wet_cut),
        'floor_tile': pack_model(comps['floor'] ^ wet_cut),
        'wall': pack_model(comps['wall']),
        'sill': pack_model(comps['sill']),
        'baseboard': pack_model(base),
    }
    band = (bath.intersection(walls.buffer(0.3, join_style=2)).difference(walls)
            .difference(unary_union([box(min(h[0], t[0]), min(h[1], t[1]), max(h[0], t[0]), max(h[1], t[1])).buffer(1.0)
                                     for d, h, t, o, r in plan.doors() if d.get('name') == 'bath'])))
    out['walltile'] = pack_model(build.to_xsec(band, T).extrude(47.9 * s).translate([0, 0, fl - 0.02]))
    out['upper_walltile'] = pack_model(build.to_xsec(band, T).extrude((a.wall_height - 48.0) * s).translate([0, 0, fl + 47.9 * s]))
    if not comps['glass'].is_empty():
        out['glass'] = pack_model(comps['glass'])
    fx = web_fixtures(plan)
    for d, h, t, o, r in plan.doors():                  # brushed threshold strips where tile meets oak
        if d.get('name') in WET_DOORS:
            strip = LineString([h, t]).buffer(0.32, cap_style=2)
            fx['fixture_metal'] = F.union([fx['fixture_metal'],
                                           build.to_xsec(strip, [1, 0, 0, -1, 0, 0]).extrude(0.09)])
    for k, man in fx.items():
        out[k] = pack_inches(man)
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
        pmat = PIECE_ROLE_MAT.get(k, {})
        for role, v, fc in arrs:
            v = v / s
            # local -> web: x right, y up, z toward the front (front faces +z when r = 0)
            w = np.column_stack([v[:, 0] - cx, v[:, 2] - z0, cy - v[:, 1]])
            meshes.append(dict(color=color[role] if isinstance(color, dict) else color,
                               mat=pmat.get(role) or ROLE_MAT.get(role, 'wood'), mesh=pack(w, fc)))
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
                 example=[dict(k=k, x=x, z=z, r=r) for k, x, z, r in EXAMPLE],
                 ideas=[dict(name=n, note=note, items=idea_items(m)) for n, note, m in IDEAS])
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
        scene.update(main=dict(name='Standard', at=0, items=items),
                     guest=dict(name='With Guest', at=0, items=idea_items(GUEST)))
    else:
        scene.update({k: old[k] for k in ('main', 'guest') if k in old})
    wc = WalkCheck(plan, scene['plan'], scene['furniture'])
    layouts = ([('Standard', scene['main']['items']), ('With guest', scene['guest']['items'])] if 'main' in scene else [])
    layouts += [(i['name'], i['items']) for i in scene['ideas']]
    failures = [(name, msg) for name, items in layouts for msg in wc.problems([tuple(it) for it in items])]
    if failures:
        details = '\n'.join(f'- {name}: {msg}' for name, msg in failures)
        raise ValueError(f'built-in layouts must have clear circulation:\n{details}')
    blob = json.dumps(scene, separators=(',', ':')).replace('<', '\\u003c')
    page = with_page_src(page[:a] + SCENE_OPEN + blob + page[b:])
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(page)
    tris = sum(m['tris'] for m in apt.values()) + sum(m['mesh']['tris'] for p in scene['furniture'].values() for m in p['parts'])
    print(f'{path}: {os.path.getsize(path) / 1e6:.2f} MB, {tris} triangles, {len(scene["furniture"])} pieces')


if __name__ == '__main__':
    main()
