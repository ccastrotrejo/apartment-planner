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
from shapely.geometry import box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build                       # noqa: E402
import floorplan as fp             # noqa: E402
import furniture as F              # noqa: E402

SCALE = 12

# name, library group, color (one color, or {part: color} for pieces built in colored parts)
STAND = {'tires': '#1d1e20', 'kit': '#303338', 'stand': '#232528', 'red': '#c23a2e'}
WARROAD, AVAIL = {'frame': '#3f6d6b', **STAND}, {'frame': '#6e5a86', **STAND}
NALA = {'fur': '#1c1714', 'tan': '#a8642f', 'eye': '#241309', 'white': '#efe9e0', 'tag': '#cfd4d8'}
PIECES = {
    'sofa': ('Sofa (power recliner)', 'Living room',
             {'legs': '#2c221c', 'frame': '#8e8d88', 'cushions': '#9f9e99', 'backs': '#a7a6a1', 'controls': '#c2c7cc'}),
    'yellow-loveseat': ('Yellow loveseat chair', 'Living room',
                        {'legs': '#694429', 'frame': '#ca982a', 'cushion': '#ddb03c'}),
    'coffee-table': ('Coffee table', 'Living room',
                     {'carcass': '#7a4a2c', 'drawer': '#875434', 'pulls': '#c69f4e', 'legs': '#653b21'}),
    'tv-stand': ('TV on rolling stand', 'Living room',
                 {'stand': '#2e3136', 'bezel': '#1c1e22', 'screen': '#10151d'}),
    'white-dresser': ('White cabinet', 'Living room',
                      {'body': '#eeede7', 'doors': '#f5f4ef', 'knobs': '#c69e4e', 'legs': '#b99368'}),
    'side-table': ('Round side table 24"', 'Living room', {'top': '#96938d', 'frame': '#25272a'}),
    'floor-lamp': ('Trilage floor lamp', 'Living room',
                   {'base': '#eceae4', 'frame': '#c59e48', 'shade': '#f5f0e5', 'bulb': '#fff6dc'}),
    'plant': ('Bird of paradise', 'Living room',
              {'pot': '#ece8e0', 'soil': '#3b2e24', 'stems': '#3e6533', 'leaves': '#4e7d41'}),
    'bar-cart': ('Bar cart', 'Living room', {'frame': '#c8a548', 'glass': '#cfe3e6', 'casters': '#333538'}),
    'dining-round-36': ('Round table 36"', 'Dining & kitchen', {'top': '#c79d6f', 'base': '#ae8457'}),
    'dining-round-42': ('Round table 42"', 'Dining & kitchen', {'top': '#c79d6f', 'base': '#ae8457'}),
    'dining-oval-42x60': ('Oval table 42 × 60"', 'Dining & kitchen', {'top': '#c79d6f', 'base': '#ae8457'}),
    'dining-rect-30x48': ('Table 30 × 48"', 'Dining & kitchen', {'top': '#c79d6f', 'base': '#b08659'}),
    'dining-rect-36x60': ('Table 36 × 60"', 'Dining & kitchen', {'top': '#c79d6f', 'base': '#b08659'}),
    'dining-rect-36x78': ('Table 36 × 78" (leaf in)', 'Dining & kitchen', {'top': '#c79d6f', 'base': '#b08659'}),
    'drop-leaf-folded': ('Drop-leaf table (yours)', 'Dining & kitchen', {'top': '#f2f0ea', 'wood': '#d6b689'}),
    'drop-leaf-open': ('Drop-leaf table (yours), open', 'Dining & kitchen', {'top': '#f2f0ea', 'wood': '#d6b689'}),
    'dining-chair': ('Dining chair', 'Dining & kitchen', {'frame': '#846040', 'seat': '#cbc4b9'}),
    'bar-stool': ('Bar stool', 'Dining & kitchen', {'seat': '#a9a8a2', 'chrome': '#d4dae0'}),
    'standing-desk': ('Standing desk', 'Office', {'top': '#be9365', 'frame': '#2a2d31'}),
    'office-chair': ('Aeron chair', 'Office', {'frame': '#242629', 'mesh': '#484c51'}),
    'queen-bed': ('Queen bed', 'Bedrooms',
                  {'legs': '#4a3525', 'frame': '#989289', 'mattress': '#f5f3ee', 'duvet': '#dad5cb', 'pillows': '#fbfaf6'}),
    'nightstand': ('Nightstand (KULLEN)', 'Bedrooms', {'body': '#3a2f2a', 'drawers': '#463933'}),
    'nightstand-fluted': ('Fluted nightstand, 3 drawers (Wayfair)', 'Bedrooms',
                          {'body': '#c7a57c', 'drawers': '#d2b289', 'flutes': '#bf9b70', 'pulls': '#c29b45',
                           'strip': '#f1efe9'}),
    'dresser-main': ('Dresser 60" (planned)', 'Bedrooms',
                     {'body': '#b59978', 'drawers': '#bfa382', 'pulls': '#2d3034'}),
    'dresser-guest': ('Dresser 52" (current)', 'Bedrooms',
                      {'body': '#a18466', 'drawers': '#ab8e70', 'pulls': '#c49d4b'}),
    'dresser-16': ('Long dresser 78.7", 16 drawers (Wayfair)', 'Bedrooms',
                   {'body': '#eeede8', 'drawers': '#f5f4ef', 'pulls': '#c59d4c'}),
    'storklinta': ('IKEA STORKLINTA 3-drawer', 'Bedrooms',
                   {'body': '#c8a777', 'drawers': '#d1b182', 'pulls': '#c2c7cc'}),
    'sofa-bed-folded': ('Achillas sofa bed', 'Bedrooms',
                        {'legs': '#26282b', 'frame': '#33363a', 'mattress': '#7b858e', 'cushions': '#8b959e'}),
    'sofa-bed-open': ('Achillas sofa bed, opened as a bed', 'Bedrooms',
                      {'legs': '#26282b', 'frame': '#33363a', 'mattress': '#7b858e', 'cushions': '#ece9e2'}),
    'shoe-cabinet': ('Shoe cabinet', 'Entry & storage', {'body': '#f2f1ed', 'top': '#c8a57a', 'knobs': '#c79a4b'}),
    'mirror-65': ('Floor mirror 24 × 65"', 'Entry & storage', {'frame': '#4e3d30', 'glass': '#dce7ec'}),
    'mirror-77': ('Floor mirror 24 × 77"', 'Entry & storage', {'frame': '#4e3d30', 'glass': '#dce7ec'}),
    'bike-warroad': ('Salsa Warroad 54 cm, in a floor stand', 'Entry & storage', WARROAD),
    'bike-warroad-up': ('Salsa Warroad 54 cm, standing up in its stand', 'Entry & storage', WARROAD),
    'bike-avail': ('Liv Avail, in a floor stand', 'Entry & storage', AVAIL),
    'bike-avail-up': ('Liv Avail, standing up in its stand', 'Entry & storage', AVAIL),
    'bike-on-wall-hook': ('Bike on a vertical wall hook', 'Entry & storage',
                          {'frame': '#3f6d6b', 'tires': '#1d1e20', 'kit': '#303338'}),
    'dog-crate': ('Dog crate', 'Pet', {'wire': '#222427', 'tray': '#36393d'}),
    'dog': ('Nala', 'Pet', NALA),
    'dog-curled': ('Nala, curled up asleep', 'Pet', NALA),
    'dog-bed': ('Donut dog bed', 'Pet', {'plush': '#d3d0ca', 'cushion': '#c2beb7'}),
    'rug-6x9': ('Rug 6 × 9\'', 'Rugs & markers', {'field': '#c5bfb2', 'border': '#afa89a'}),
    'rug-8x10': ('Rug 8 × 10\'', 'Rugs & markers', {'field': '#b2babf', 'border': '#9ba4a9'}),
    'sofa-recline-zone': ('Recline zone (sofa footrests)', 'Rugs & markers', '#e3b98f'),
}

# Material preset role per piece/part for physically-based shading in the web viewer
ROLE_MAT = {
    'legs': 'wood', 'carcass': 'wood', 'wood': 'wood', 'flutes': 'wood',
    'cushions': 'fabric', 'backs': 'fabric', 'cushion': 'velvet', 'mattress': 'fabric',
    'duvet': 'fabric', 'pillows': 'fabric', 'mesh': 'fabric', 'shade': 'fabric', 'plush': 'velvet',
    'field': 'rug', 'border': 'rug', 'soil': 'rug',
    'pulls': 'brass', 'knobs': 'brass', 'chrome': 'chrome', 'controls': 'chrome', 'tag': 'chrome',
    'stand': 'metal', 'wire': 'metal', 'kit': 'metal',
    'tires': 'rubber', 'casters': 'rubber',
    'bezel': 'plastic', 'tray': 'plastic', 'strip': 'plastic', 'red': 'plastic',
    'screen': 'screen', 'pot': 'ceramic', 'eye': 'ceramic', 'bulb': 'bulb',
    'stems': 'plant', 'leaves': 'plant', 'glass': 'glass',
    'fur': 'fabric', 'tan': 'fabric', 'white': 'fabric',
}
PIECE_ROLE_MAT = {
    'sofa': {'frame': 'fabric'},
    'yellow-loveseat': {'frame': 'velvet'},
    'white-dresser': {'body': 'paint', 'doors': 'paint'},
    'side-table': {'top': 'stone', 'frame': 'metal'},
    'floor-lamp': {'base': 'stone', 'frame': 'brass'},
    'bar-cart': {'frame': 'brass', 'glass': 'glass'},
    'drop-leaf-folded': {'top': 'paint'}, 'drop-leaf-open': {'top': 'paint'},
    'dining-chair': {'frame': 'wood', 'seat': 'fabric'},
    'bar-stool': {'seat': 'leather'},
    'standing-desk': {'top': 'wood', 'frame': 'metal'},
    'office-chair': {'frame': 'plastic'},
    'queen-bed': {'frame': 'fabric'},
    'dresser-main': {'pulls': 'metal'},
    'dresser-16': {'body': 'paint', 'drawers': 'paint'},
    'storklinta': {'pulls': 'chrome'},
    'sofa-bed-folded': {'legs': 'metal', 'frame': 'metal'},
    'sofa-bed-open': {'legs': 'metal', 'frame': 'metal'},
    'shoe-cabinet': {'body': 'paint', 'top': 'wood'},
    'mirror-65': {'frame': 'wood', 'glass': 'mirror'},
    'mirror-77': {'frame': 'wood', 'glass': 'mirror'},
    'bike-warroad': {'frame': 'enamel'}, 'bike-warroad-up': {'frame': 'enamel'},
    'bike-avail': {'frame': 'enamel'}, 'bike-avail-up': {'frame': 'enamel'},
    'bike-on-wall-hook': {'frame': 'enamel'},
    'sofa-recline-zone': {'main': 'zone'},
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


def _build_web_fixtures(plan):
    """Detailed multi-material kitchen, bath, and laundry built-ins matching B7 photos (real inches)."""
    b3 = lambda x0, z0, y0, x1, z1, y1: F.cube(
        min(x0, x1), min(-z1, -z0), min(y0, y1), max(x0, x1), max(-z1, -z0), max(y0, y1))
    rb3 = lambda x0, z0, y0, x1, z1, y1, r, segs=10: F._rbox(
        min(x0, x1), min(-z1, -z0), min(y0, y1), max(x0, x1), max(-z1, -z0), max(y0, y1), r, segs)
    rslab3 = lambda x0, z0, y0, x1, z1, y1, rxy, rz=0.0, segs=16: F._rslab(
        min(x0, x1), min(-z1, -z0), min(y0, y1), max(x0, x1), max(-z1, -z0), max(y0, y1), rxy, rz, segs)
    cyl_y = lambda cx, cz, y0, y1, r0, r1=None, segs=28: m3d.Manifold.cylinder(
        y1 - y0, r0, r0 if r1 is None else r1, segs).translate([cx, -cz, y0])
    tube3 = lambda pts, r: F._tube([(x, -z, y) for x, z, y in pts], r)

    def ell_cs(rx, rz, segs=40):
        a = np.linspace(0, 2 * np.pi, segs, endpoint=False)
        return m3d.CrossSection([np.column_stack([rx * np.cos(a), rz * np.sin(a)])], m3d.FillRule.NonZero)

    g = {k: [] for k in ('cab_wood', 'cab_white', 'countertop', 'ceramic', 'appliance', 'fixture_dark', 'fixture_metal')}
    tanks = {}
    for fx, geom in plan.fixtures():
        if 'tank' in fx['name']:
            tanks[fx['name'].split()[1]] = geom.bounds  # x0, z0, x1, z1

    for fx, geom in plan.fixtures():
        kind = fx.get('kind')
        if kind is None:
            continue
        x0, z0, x1, z1 = geom.bounds
        h = float(fx['h'])
        if kind == 'cabinets':                                      # east-facing wood base cabinets + quartz counter
            g['fixture_dark'].append(b3(x0, z0, 0, x1 - 2.8, z1, 4.0))
            g['cab_wood'].append(b3(x0, z0, 4.0, x1 - 0.85, z1, h - 1.5))
            nb = max(1, round((z1 - z0) / 15.5))
            dz = (z1 - z0) / nb
            for i in range(nb):
                za, zb = z0 + i * dz + 0.16, z0 + (i + 1) * dz - 0.16
                g['cab_wood'].append(rb3(x1 - 0.88, za, h - 7.4, x1 - 0.15, zb, h - 1.72, 0.12))
                g['cab_wood'].append(rb3(x1 - 0.88, za, 4.22, x1 - 0.15, zb, h - 7.75, 0.12))
                zm = (za + zb) / 2
                g['fixture_metal'].append(rb3(x1 - 0.2, zm - 2.1, h - 4.7, x1 + 0.25, zm + 2.1, h - 4.35, 0.08))
                hp_z = zb - 1.2 if i % 2 == 0 else za + 1.2
                g['fixture_metal'].append(rb3(x1 - 0.2, hp_z - 0.18, h - 13.5, x1 + 0.25, hp_z + 0.18, h - 9.2, 0.08))
            g['countertop'].append(rslab3(x0, z0, h - 1.5, x1 + 0.65, z1, h, 0.25, rz=0.08))
            g['countertop'].append(b3(x0, z0, h - 0.1, x0 + 0.55, z1, h + 3.5))

        elif kind == 'range':                                       # 30" slide-in stainless range + glass cooktop
            g['appliance'].append(b3(x0, z0 + 0.12, 0, x1 - 0.85, z1 - 0.12, h - 0.55))
            g['appliance'].append(rb3(x1 - 0.9, z0 + 0.22, 0.5, x1 - 0.08, z1 - 0.22, 6.7, 0.15))
            door = rb3(x1 - 0.9, z0 + 0.22, 7.1, x1 - 0.08, z1 - 0.22, 29.8, 0.18)
            win_cut = b3(x1 - 0.55, z0 + 4.4, 11.4, x1 + 0.2, z1 - 4.4, 25.4)
            g['appliance'].append(door - win_cut)
            g['fixture_dark'].append(b3(x1 - 0.62, z0 + 4.4, 11.4, x1 - 0.28, z1 - 4.4, 25.4))
            g['appliance'].append(rb3(x1 - 0.9, z0 + 0.22, 30.2, x1 + 0.05, z1 - 0.22, 35.45, 0.18))
            g['fixture_dark'].append(rslab3(x0 + 0.5, z0 + 0.2, h - 0.58, x1 - 0.15, z1 - 0.2, h + 0.05, 0.2))
            d, w = x1 - x0, z1 - z0
            for cu, r_b in ((0.34, 3.1), (0.71, 3.7)):
                for cv in (0.27, 0.73):
                    bx, bz = x0 + cu * d, z0 + cv * w
                    ring = cyl_y(bx, bz, h + 0.02, h + 0.11, r_b) - cyl_y(bx, bz, h - 0.1, h + 0.2, r_b - 0.24)
                    g['fixture_metal'].append(ring)
            g['fixture_metal'].append(tube3([(x1 - 0.1, z0 + 3.0, 27.8), (x1 + 1.1, z0 + 3.0, 27.8),
                                             (x1 + 1.1, z1 - 3.0, 27.8), (x1 - 0.1, z1 - 3.0, 27.8)], 0.34))
            for kz in np.linspace(z0 + 4.0, z1 - 4.0, 5):
                knob = m3d.Manifold.cylinder(0.65, 0.68, 0.62, 20).rotate([0, 90, 0]).translate([x1, -kz, 32.85])
                g['fixture_metal'].append(knob)

        elif kind == 'fridge':                                      # stainless French-door fridge + bottom freezer
            zm = (z0 + z1) / 2
            g['appliance'].append(b3(x0, z0 + 0.2, 0, x1 - 2.1, z1 - 0.2, h - 0.5))
            g['appliance'].append(rb3(x1 - 2.2, z0 + 0.22, 0.8, x1, z1 - 0.22, 27.2, 0.35))
            ldoor = rb3(x1 - 2.2, z0 + 0.22, 27.7, x1, zm - 0.18, h, 0.35)
            niche = b3(x1 - 1.35, z0 + 3.2, 38.2, x1 + 0.2, zm - 3.2, 48.2)
            g['appliance'].append(ldoor - niche)
            g['fixture_dark'].append(b3(x1 - 1.45, z0 + 3.2, 38.2, x1 - 1.15, zm - 3.2, 48.2))
            g['appliance'].append(rb3(x1 - 2.2, zm + 0.18, 27.7, x1, z1 - 0.22, h, 0.35))
            for hz in (zm - 1.55, zm + 1.55):
                g['fixture_metal'].append(tube3([(x1 - 0.1, hz, 31.5), (x1 + 1.15, hz, 31.5),
                                                 (x1 + 1.15, hz, 58.5), (x1 - 0.1, hz, 58.5)], 0.36))
            g['fixture_metal'].append(tube3([(x1 - 0.1, z0 + 3.2, 24.5), (x1 + 1.15, z0 + 3.2, 24.5),
                                             (x1 + 1.15, z1 - 3.2, 24.5), (x1 - 0.1, z1 - 3.2, 24.5)], 0.36))

        elif kind == 'peninsula':                                   # wood kitchen face, white end/living panels, overhang
            ov = fx['overhang']['inches']
            bx1 = x1 - ov
            g['fixture_dark'].append(b3(x0 + 2.8, z0, 0, bx1 - 0.65, z1 - 0.65, 4.0))
            sx0, sx1, sz0, sz1 = plan.rect(fx['sink'], frame=fx['rect'])
            g['cab_wood'].append(b3(x0 + 0.85, z0, 4.0, bx1 - 0.65, z1 - 0.65, h - 1.5)
                                 - rslab3(sx0 - 0.9, sz0 - 0.9, h - 9.0, sx1 + 0.9, sz1 + 0.9, h, 1.6))
            g['cab_white'].append(b3(bx1 - 0.68, z0, 0, bx1, z1, h - 1.5))
            g['cab_white'].append(b3(x0 + 0.12, z1 - 0.68, 0, bx1, z1, h - 1.5))
            nb = 5
            dz = (z1 - 0.7 - z0) / nb
            for i in range(nb):
                za, zb = z0 + i * dz + 0.16, z0 + (i + 1) * dz - 0.16
                g['cab_wood'].append(rb3(x0 + 0.15, za, h - 7.4, x0 + 0.88, zb, h - 1.72, 0.12))
                g['cab_wood'].append(rb3(x0 + 0.15, za, 4.22, x0 + 0.88, zb, h - 7.75, 0.12))
                zm = (za + zb) / 2
                g['fixture_metal'].append(rb3(x0 - 0.25, zm - 2.1, h - 4.7, x0 + 0.2, zm + 2.1, h - 4.35, 0.08))
            slab = rslab3(x0 - 0.55, z0, h - 1.5, x1, z1 + 0.45, h, 0.45, rz=0.1)
            cut = rslab3(sx0, sz0, h - 2.5, sx1, sz1, h + 1.0, 1.25)
            g['countertop'].append(slab - cut)
            sink_outer = rslab3(sx0 - 0.85, sz0 - 0.85, h - 8.6, sx1 + 0.85, sz1 + 0.85, h - 1.35, 1.55)
            sink_inner = rslab3(sx0, sz0, h - 8.0, sx1, sz1, h - 0.8, 1.25)
            scx, scz = (sx0 + sx1) / 2, (sz0 + sz1) / 2
            g['fixture_metal'].append(sink_outer - sink_inner)
            g['fixture_dark'].append(cyl_y(scx, scz, h - 8.05, h - 7.82, 1.55))
            # High-arc gooseneck kitchen faucet on the east deck of the sink
            fx_x = sx1 + 2.1
            arc = [(fx_x, scz, h - 0.1), (fx_x, scz, h + 7.5)]
            for a_deg in np.linspace(0, 165, 14):
                rad = math.radians(a_deg)
                arc.append((fx_x - 3.6 * (1 - math.cos(rad)), scz, h + 7.5 + 3.6 * math.sin(rad)))
            g['fixture_metal'].append(tube3(arc, 0.42))
            g['fixture_metal'].append(cyl_y(fx_x, scz, h - 0.1, h + 1.2, 0.95, 0.8))
            g['fixture_metal'].append(tube3([(fx_x, scz + 0.8, h + 1.8), (fx_x, scz + 3.2, h + 3.2)], 0.22))

        elif kind == 'vanity':                                      # floating two-drawer wood vanity on thin metal legs
            for lx in (x0 + 1.1, x1 - 1.1):
                for lz in (z0 + 1.2, z1 - 1.2):
                    g['fixture_metal'].append(cyl_y(lx, lz, 0, 6.3, 0.45))
            bcx, bcz = (x0 + x1) / 2, (z0 + z1) / 2 - 1.6
            g['cab_wood'].append(b3(x0 + 0.2, z0 + 0.8, 6.0, x1 - 0.2, z1, h - 1.25)
                                 - rslab3(bcx - 9.1, bcz - 6.5, h - 7.2, bcx + 9.1, bcz + 6.5, h, 2.7))
            mid_y = 6.0 + (h - 1.25 - 6.0) / 2
            for ya, yb in ((6.2, mid_y - 0.18), (mid_y + 0.18, h - 1.48)):
                g['cab_wood'].append(rb3(x0 + 0.28, z0 + 0.12, ya, x1 - 0.28, z0 + 0.85, yb, 0.12))
                cx = (x0 + x1) / 2
                g['fixture_metal'].append(rb3(cx - 3.2, z0 - 0.28, yb - 1.35, cx + 3.2, z0 + 0.15, yb - 1.0, 0.08))
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2 - 1.6
            sw, sd = 16.4, 11.2
            top_slab = rslab3(x0 - 0.3, z0 - 0.35, h - 1.25, x1 + 0.3, z1, h, 0.3, rz=0.08)
            bsplash = b3(x0 - 0.2, z1 - 0.55, h - 0.1, x1 + 0.2, z1, h + 2.6)
            scut = rslab3(cx - sw / 2, cz - sd / 2, h - 2.2, cx + sw / 2, cz + sd / 2, h + 0.8, 2.2)
            g['countertop'].append(F.union([top_slab, bsplash]) - scut)
            b_out = rslab3(cx - sw / 2 - 0.8, cz - sd / 2 - 0.8, h - 6.8, cx + sw / 2 + 0.8, cz + sd / 2 + 0.8, h - 1.15, 2.6)
            b_in = rslab3(cx - sw / 2, cz - sd / 2, h - 6.1, cx + sw / 2, cz + sd / 2, h - 0.6, 2.2)
            g['ceramic'].append(b_out - b_in)
            g['fixture_metal'].append(cyl_y(cx, cz, h - 6.15, h - 5.95, 1.0))
            fz = cz + sd / 2 + 1.9
            g['fixture_metal'].append(tube3([(cx, fz, h - 0.1), (cx, fz, h + 4.4), (cx, fz - 3.4, h + 3.9)], 0.35))

        elif kind == 'toilet':                                      # sculpted porcelain bowl, lid, and tank
            tid = fx['name'].split()[1]
            tx0, tz0, tx1, tz1 = tanks[tid]
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            rx, rz = (x1 - x0) / 2, (z1 - z0) / 2
            skirt = m3d.Manifold.batch_hull([
                ell_cs(rx * 0.68, rz * 0.64).extrude(0.3).translate([cx, -(cz + 1.2), 0]),
                ell_cs(rx, rz).extrude(2.2).translate([cx, -cz, 12.6]),
            ])
            well = ell_cs(rx * 0.72, rz * 0.72).extrude(5.0).translate([cx, -(cz - 0.5), 10.5])
            lid = m3d.Manifold.batch_hull([
                ell_cs(rx * 0.98, rz * 0.98).extrude(0.35).translate([cx, -cz, 14.85]),
                ell_cs(rx * 0.90, rz * 0.90).extrude(0.25).translate([cx, -cz, 15.45]),
            ])
            bridge = b3(x0 + 1.4, z1 - 4.5, 0, x1 - 1.4, tz1 - 0.2, 14.6)
            tank = rb3(tx0 + 0.35, tz0 + 0.2, 14.3, tx1 - 0.35, tz1 - 0.15, 28.1, 0.95)
            tlid = rslab3(tx0, tz0, 28.0, tx1, tz1, 29.1, 1.05, rz=0.2)
            g['ceramic'].append(F.union([skirt - well, lid, bridge, tank, tlid]))
            g['fixture_metal'].append(rb3(tx0 - 0.45, tz0 + 0.5, 26.2, tx0 + 0.5, tz0 + 2.2, 26.7, 0.12))

        elif kind == 'tub':                                         # alcove tub: white apron + deep sculpted basin
            apron = b3(x0, z0, 0, x0 + 1.25, z1, h - 0.9) - b3(x0 - 0.2, z0 + 3.2, 2.6, x0 + 0.38, z1 - 3.2, h - 3.2)
            g['cab_white'].append(apron)
            deck = F.union([b3(x0 + 1.0, z0, 0, x1, z1, h - 0.8), rslab3(x0, z0, h - 1.0, x1, z1, h, 0.35, rz=0.12)])
            basin = m3d.Manifold.batch_hull([
                rslab3(x0 + 4.4, z0 + 6.5, 3.2, x1 - 3.8, z1 - 4.6, 3.8, 5.2),
                rslab3(x0 + 3.2, z0 + 3.5, h - 0.4, x1 - 2.8, z1 - 3.6, h + 1.0, 5.6),
            ])
            g['ceramic'].append(deck - basin)
            mx = (x0 + x1) / 2 + 0.2
            g['fixture_metal'].append(cyl_y(mx, z1 - 7.5, 3.15, 3.38, 1.25))
            g['fixture_metal'].append(tube3([(mx, z1 + 0.1, h + 3.5), (mx, z1 - 4.6, h + 3.2)], 0.58))
            g['fixture_metal'].append(cyl_y(mx, z1 - 1.5, h - 4.5, h - 4.1, 1.1).rotate([90, 0, 0]))

        elif kind == 'shower':                                      # porcelain curb & pan + drain + wall trim
            pan = b3(x0, z0, 0, x1, z1, 2.8) - rslab3(x0 + 1.6, z0 + 1.6, 1.1, x1 - 2.6, z1 - 1.6, 3.5, 1.4)
            g['ceramic'].append(pan)
            cx, cz = (x0 + x1 - 1.0) / 2, (z0 + z1) / 2
            g['fixture_metal'].append(rslab3(cx - 2.1, cz - 2.1, 1.05, cx + 2.1, cz + 2.1, 1.22, 0.3))
            g['fixture_metal'].append(tube3([(cx, z1 - 0.2, 36.0), (cx, z1 - 1.2, 36.0), (cx, z1 - 1.2, 46.5)], 0.35))

        elif kind == 'appliance':                                   # stacked front-load washer/dryer facing north (-z)
            cx = (x0 + x1) / 2
            g['appliance'].append(rb3(x0, z0 + 0.85, 0.3, x1, z1, 37.6, 0.55))
            g['appliance'].append(rb3(x0, z0 + 0.85, 38.2, x1, z1, h, 0.55))
            g['fixture_dark'].append(b3(x0 + 0.4, z0 + 0.75, 37.5, x1 - 0.4, z1 - 0.4, 38.3))
            for yh in (19.5, 57.5):
                ring = (m3d.Manifold.cylinder(1.15, 7.3, 6.9, 36)
                        - m3d.Manifold.cylinder(1.6, 5.5, 5.5, 36).translate([0, 0, -0.2]))
                g['fixture_metal'].append(ring.rotate([-90, 0, 0]).translate([cx, -(z0 + 1.05), yh]))
                glass = m3d.Manifold.cylinder(0.55, 5.6, 5.6, 32).rotate([-90, 0, 0]).translate([cx, -(z0 + 0.9), yh])
                g['fixture_dark'].append(glass)
            g['fixture_metal'].append(m3d.Manifold.cylinder(0.65, 1.05, 0.95, 24).rotate([-90, 0, 0]).translate(
                [cx, -(z0 + 1.0), 39.8]))

    # Brushed metal threshold transition strips under W/D, Bath 1, and Bath 2 doorways
    X, Y = plan.X, plan.Y
    ym = (Y['hall_S'] + Y['bath_top_in']) / 2
    for sl_name in ('W/D', 'bath 1', 'bath 2'):
        sl = next(s_ for s_ in fp.SLIDERS if s_['name'] == sl_name)
        xa, xb = sorted((X[sl['x'][0]], X[sl['x'][1]]))
        g['fixture_metal'].append(b3(xa, ym - 0.32, 0.0, xb, ym + 0.32, 0.09))

    return {k: F.union(ms) for k, ms in g.items() if ms}


def apartment(plan):
    a = argparse.Namespace(scale=SCALE, wall_height=90.0, sill=30.0, glass_curb_mm=1.2, floor_mm=2.0,
                           groove_mm=0.8, groove_depth_mm=0.6)
    comps, _, T, s = build.build_model(plan, a)
    fpoly = plan.footprint()
    minx, maxy = fpoly.bounds[0], fpoly.bounds[3]
    X, Y = plan.X, plan.Y

    def pack_T(man):
        v, f = manifold_arrays(man)
        w = np.column_stack([v[:, 0] / s + minx, v[:, 2] / s - a.floor_mm / s, maxy - v[:, 1] / s])
        return pack(w, f)

    def pack_in(man):
        v, f = manifold_arrays(man)
        return pack(np.column_stack([v[:, 0], v[:, 2], -v[:, 1]]), f)

    # Split floor cleanly into oak planks (living/kitchen/bedrooms/foyer) and porcelain tile (Bath 1, Bath 2, W/D)
    ym = (Y['hall_S'] + Y['bath_top_in']) / 2
    wet_poly = unary_union([
        box(X['wd_L_out'] - 0.1, ym, X['bath1_W_out'] + 0.1, Y['wd_out_bot'] + 1.0),
        box(X['bath1_W_out'] - 0.1, ym, X['bath_E_out'] + 1.0, Y['bath_S_out'] + 1.0),
    ])
    wet_cut = build.to_xsec(wet_poly, T).extrude(a.floor_mm + 4.0).translate([0, 0, -2.0])

    # Interior stepped baseboards along painted walls, clipped clear of doorways, sliders, full glass, and built-ins
    wall_u = unary_union(plan.walls())
    clear = [g.buffer(0.8) for w, g in plan.windows() if w['kind'] == 'full']
    clear.append(box(*build._xyxy(plan.rect(fp.ENTRY_OPENING))).buffer(0.8))
    for sl in fp.SLIDERS:
        xa, xb = X[sl['x'][0]], X[sl['x'][1]]
        ya, yb = Y[sl['y'][0]], Y[sl['y'][1]]
        clear.append(box(min(xa, xb) - 0.6, min(ya, yb) - 0.6, max(xa, xb) + 0.6, max(ya, yb) + 0.6))
    for _, h_pt, c_pt, _, _ in plan.doors():
        clear.append(box(min(h_pt[0], c_pt[0]) - 1.2, min(h_pt[1], c_pt[1]) - 1.2,
                         max(h_pt[0], c_pt[0]) + 1.2, max(h_pt[1], c_pt[1]) + 1.2))
    for fx, g in plan.fixtures():
        if fx.get('kind') in ('cabinets', 'range', 'fridge', 'peninsula', 'tub', 'shower', 'vanity'):
            clear.append(g.buffer(0.15))
    clear_u = unary_union(clear)
    bb_low = (wall_u.buffer(0.45, join_style=2).difference(wall_u)).intersection(fpoly.buffer(-0.08)).difference(clear_u)
    bb_top = (wall_u.buffer(0.30, join_style=2).difference(wall_u)).intersection(fpoly.buffer(-0.08)).difference(clear_u)
    fl = a.floor_mm
    baseboard_m = F.union([
        build.to_xsec(bb_low, T).extrude(3.0 * s).translate([0, 0, fl - 0.02]),
        build.to_xsec(bb_top, T).extrude(3.6 * s).translate([0, 0, fl - 0.02]),
    ])

    out = {
        'floor_wood': pack_T(comps['floor'] - wet_cut),
        'floor_tile': pack_T(comps['floor'] ^ wet_cut),
        'wall': pack_T(comps['wall']),
        'sill': pack_T(comps['sill']),
        'glass': pack_T(comps['glass']),
        'baseboard': pack_T(baseboard_m),
    }
    for k, man in _build_web_fixtures(plan).items():
        out[k] = pack_in(man)
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
        pmap = PIECE_ROLE_MAT.get(k, {})
        for role, v, fc in arrs:
            v = v / s
            # local -> web: x right, y up, z toward the front (front faces +z when r = 0)
            w = np.column_stack([v[:, 0] - cx, v[:, 2] - z0, cy - v[:, 1]])
            mtype = pmap.get(role) or ROLE_MAT.get(role) or ('wood' if role in ('top', 'base', 'body', 'drawers', 'drawer', 'doors') else 'paint')
            meshes.append(dict(color=color[role] if isinstance(color, dict) else color, mat=mtype, mesh=pack(w, fc)))
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
        if isinstance(color, str):
            swatch = color
        else:
            swatch = next((color[rk] for rk in ('cushions', 'cushion', 'duvet', 'mattress', 'top', 'drawers', 'doors',
                                                'leaves', 'plush', 'field', 'seat', 'mesh', 'frame', 'body', 'fur')
                           if rk in color), next(iter(color.values())))
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
    room_boxes = {
        'BEDROOM 1': [X['W_in'], Y['N_in'], X['bed1_E'], Y['bed1_S_in']],
        'BEDROOM 2': [X['bed2_W_in'], Y['bed2_N'], X['E_in'], Y['bed2_S_in']],
        'LIVING': [X['pen_E'], Y['N_in'], X['E_in'], Y['liv_S']],
        'KITCHEN': [X['fridge'] + 2.0, Y['N_in'] + 4.0, X['pen_W'] - 2.0, Y['pen_bot']],
        'BATH 1': [X['bath1_W_in'], Y['bath_top_in'], X['tub_L'], Y['bath_S_in'] - 28.0],
        'BATH 2': [X['shower_R'], Y['bath_top_in'], X['bed2_W_out'], Y['bath_S_in'] - 28.0],
        'FOYER': [X['W_in'] + 4.0, Y['stub_bot'], X['bath1_W_out'], Y['hall_S']],
    }
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
        rb = room_boxes.get(r['name'])
        rooms.append(dict(name=r['name'].title().replace('Bedroom 2', 'Main bedroom').replace('Bedroom 1', 'Guest bedroom'),
                          at=[round(x, 1), round(y, 1)], size=size, measured=measured,
                          box=[round(v, 1) for v in rb] if rb else None))
    sh_fx = next((g.bounds for fx, g in plan.fixtures() if fx.get('kind') == 'shower'), None)
    shower_screen = [round(sh_fx[2] - 0.65, 2), round(sh_fx[1], 2), round(sh_fx[2], 2), round(sh_fx[3], 2)] if sh_fx else None
    fx0, fz0, fx1, fz1 = plan.footprint().bounds
    return dict(bounds=[round(v, 1) for v in (fx0, fz0, fx1, fz1)],
                outline=[[round(x, 2), round(y, 2)] for x, y in plan.footprint().exterior.coords],
                obstacles=obstacles, windows=windows, shower_screen=shower_screen, doors=doors, sliders=sliders, rooms=rooms)


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
