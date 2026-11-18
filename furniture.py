"""Printable furniture for the B7 apartment model, at the same scale as the apartment (1:60 by default).

    python3 furniture.py              # -> output/furniture/*.stl, a one-plate STL, a preview sheet
    python3 furniture.py --scale 48

Dimensions are REAL inches. The first set comes from one photo of the current living room (2026-10-15),
so they are estimates: measure the actual pieces and edit FURNITURE, then re-run.
Width = left-right as you face the piece, depth = front-back, height = floor to top.
"""
import argparse
import math
import os

import manifold3d as m3d
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath
import numpy as np
import trimesh

import build   # reuses the preview renderer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'output', 'furniture')

FURNITURE = {
    'sofa': dict(w=78.5, d=39, h=41, seat_h=20, arm_w=8, arm_h=25, back_d=10, seats=3,
                 note='3-seat power recliner with headrests; width measured 78-79", depth/height estimated'),
    'sofa-recline-zone': dict(d=22, note='flat tab: floor the footrests cover when reclined; lay it in front of the sofa'),
    'coffee-table': dict(w=42.5, d=16, h=18, leg_h=7, cubby_w=12,      # measured 2026-10-16
                         note='mid-century, splayed legs, open cubby at one end; prints upside down'),
    'yellow-loveseat': dict(w=29.5, d=30, h=33, seat_h=17, back_d=8, leg_h=5,
                            note='armless mustard loveseat chair; W x D x H measured'),
    'standing-desk': dict(w=47, d=23.6, h=29, top_t=1.2, leg_w=2.0, leg_inset=3.0,
                          note='top measured 47 x 23.6; modeled at sitting height (29"), adjustable'),
    # Brightech Trilage (marble-base version): official 84" tall, 12.5" x 2" base; arm heights, reaches and
    # shade heights from retailer listings (no per-arm spec is published); default catalog pose, arms fanned
    # Brightech Trilage. Official: 84" tall, 12.5" x 2" marble base. Shade bottoms ~61.5/57/54" (retailer) and the
    # pose (pole to ~37", rods bundled to ~52", then fanning out; tips ~84/76.5/71", shades 10-18" from the pole)
    # read from the owner's living-room photo. Arms swivel, up to ~34" reach; this is the pose in the photo.
    # measured 2026-10-16: 74" tall overall (listing said 84"), base 12.5", shades 12.5 / 11.5 / 10.5"; heights below
    # are the photo pose scaled to 74"
    'floor-lamp': dict(base_dia=12.5, base_t=2, pole_h=32.6, bundle_z=45.8, pole_mm=1.8, rod_mm=1.0, drop_mm=0.8,
                       arms=[dict(dir_deg=-20, reach=16, tip_z=74, shade_dia=12.5, shade_h=8.5, shade_bottom_z=54.2),
                             dict(dir_deg=190, reach=11, tip_z=67.4, shade_dia=11.5, shade_h=8.5, shade_bottom_z=50.2),
                             dict(dir_deg=-60, reach=9, tip_z=62.5, shade_dia=10.5, shade_h=8.5, shade_bottom_z=47.6)],
                       note='Brightech Trilage in the photo pose; shades need supports'),
    # bird of paradise (measured 2026-10-16): 7" pot, 55" tall, about 42" across at the widest (leaves move a bit).
    # Pot height estimated; the 16" saucer is a print aid (a 7" pot is too small a base for a 55" print).
    'plant': dict(pot_dia=7, pot_h=7, saucer_dia=16, stem_mm=1.5, leaf_t_mm=1.0,
                  leaves=[dict(dir=90, tilt=4, stem=28, len=21, w=7), dict(dir=20, tilt=20, stem=26, len=20, w=7),
                          dict(dir=160, tilt=32, stem=19, len=19, w=7), dict(dir=250, tilt=18, stem=27, len=19, w=6.5),
                          dict(dir=340, tilt=32, stem=19, len=19, w=6.5), dict(dir=210, tilt=26, stem=16, len=19, w=6),
                          dict(dir=60, tilt=26, stem=17, len=18, w=6)],
                  note='bird of paradise in a 7" pot: 55" tall, about 42" across'),
    'white-dresser': dict(w=27.7, d=14, h=32, doors=2, leg_h=2,
                          note='white living-room dresser: two doors on the 27.7" face, on short feet; measured'),
    # Dining options for the living room's window corner (standard sizes, 30" high). Chairs are shared: 6 loose ones.
    'dining-round-36': dict(dia=36, h=30, base_dia=18, column_dia=7, label='Ø36', note='round 36", seats 2-4'),
    'dining-round-42': dict(dia=42, h=30, base_dia=20, column_dia=7, label='Ø42', note='round 42", seats 4; extends to the 42 x 60 oval'),
    'dining-oval-42x60': dict(w=60, d=42, h=30, base_dia=20, column_dia=7, label='42×60', note='the 42" round with its 18" leaf in: seats 6'),
    'dining-rect-30x48': dict(w=48, d=30, h=30, label='30×48', note='rectangle 30 x 48", seats 4 (2 if pushed against a wall)'),
    'dining-rect-36x60': dict(w=60, d=36, h=30, label='36×60', note='rectangle 36 x 60", seats 4-6'),
    'dining-rect-36x78': dict(w=78, d=36, h=30, leaf_at=[30, 48], label='36×78', note='the 36 x 60 extended with an 18" leaf: seats 6-8'),
    'dining-chair': dict(w=18, d=21, h=32, seat_h=18, back_t=2, note='generic armless dining chair; print 6'),
    # AX WABER rolling TV stand, model AX1004TGM (Amazon B0DJ6W15RX): 21.65 x 14.96 in base on 4 locking casters,
    # one pole, 50-62 in tall in 9 steps, VESA 100-400. Modeled at its lowest setting. Pole and caster sizes estimated.
    'tv-stand': dict(base_w=21.65, base_d=14.96, base_h=3.5, caster_h=2.5, pole_w=2.2, pole_d=1.4, pole_h=50,
                     mount_z=46, mount_off=3.5, tv_w=48.5, tv_h=28.1, tv_t=2.5,
                     note='AX WABER AX1004TGM at its lowest setting (50 in); TV center about 46 in'),
    'rug-6x9': dict(w=108, d=72, label='6×9', note='6 x 9 ft rug; printed 0.8 mm thick regardless of scale'),
    'rug-8x10': dict(w=120, d=96, label='8×10', note='8 x 10 ft rug (option for the new apartment); 0.8 mm thick'),
    # Bedrooms (2026-10-15): bed and nightstands are researched standard sizes (see README); dresser measured
    'queen-bed': dict(frame_w=66, frame_l=83, frame_h=13, mattress_w=60, mattress_l=80, mattress_t=11,   # 66 x 83 measured
                      headboard_h=48, headboard_t=2.5, leg_h=4,
                      note='generic upholstered platform frame; mattress top at 24"'),
    'dresser-guest': dict(w=52, d=18, h=32.5, rows=3, cols=2, base_h=3,
                          note='current bedroom dresser, moving to the guest room; measured 52 x 18 x 32.5'),
    'dresser-main': dict(w=60, d=18, h=32.5, rows=3, cols=2, base_h=3,
                         note='planned wider dresser for the main bedroom: same depth/height, 8" wider (assumed 60")'),
    'nightstand': dict(w=14, d=16, h=19.5, drawers=2, leg_h=1.0,
                       note='IKEA KULLEN 2-drawer chest (black-brown), measured 14 x 16 x 19.5; print 2'),
    # Achillas sofa bed (guest room) by Innovation Living: 200 x 100 x 78 cm sofa, 200 x 155 cm bed (manufacturer)
    'sofa-bed': dict(w=78.7, d=39.4, h=30.7, seat_h=15.7, leg_h=8.7, back_t=7.9, mattress_t=8.1,
                     cushion_w=35.8, cushion_d=9.1, cushions=2, bed_l=61.0, bed_h=15.7, seat_unit_d=31.5,
                     note='Achillas (Innovation Living): armless, caster legs; opens forward to 78.7 x 61'),
    # Added 2026-10-16 from the owner's measurements and photos. Website only for now (not on the print plates).
    'side-table': dict(dia=24, h=16, top_t=1.0, note='round side table: concrete-look top on a black metal frame; '
                                                      'measured 24 x 16. The Trilage lamp can stand on it.'),
    'drop-leaf-table': dict(dia=40, h=29, center_w=10, top_t=0.75,
                            note='white drop-leaf round table on a pine gateleg base with casters; measured 40 round, '
                                 '10 wide folded, 29 tall'),
    'bar-cart': dict(w=30, d=16, h=33, shelf_z=15, note='gold bar cart, two glass shelves, wine rack; measured 30 x 16 x 33'),
    'shoe-cabinet': dict(w=32, d=10, h=48, doors=[18, 14.5, 13], note='white shoe cabinet, 3 tilt-out doors, oak-look '
                                                                        'top; measured 32 x 10 x 48'),
    'mirror-65': dict(w=24, h=65, t=0.5, lean=5, note='floor mirror leaning on a wall: 24 x 65 measured, about 1/2 in '
                                                      'thick; 5 deg lean assumed, so the bottom sits about 6 in out'),
    'mirror-77': dict(w=24, h=77, t=1, lean=5, note='floor mirror leaning on a wall: 24 x 77 measured, about 1 in '
                                                    'thick; 5 deg lean assumed, so the bottom sits about 7 in out'),
    'bar-stool': dict(seat_h=26, w=19.5, d=18.5, back_h=10, arm_h=5, base_dia=16.5, foot_z=9,
                      note='grey bucket-seat swivel stool on a chrome gas lift: standard size, set to counter height '
                           '(26 in seat; adjusts about 24-32)'),
    'office-chair': dict(w=27, d=26, h=42, seat_h=18, note='Herman Miller Aeron, size B assumed: about 27 W x 26 D, '
                                                           '41-45 in tall'),
    'dresser-16': dict(w=78.7, d=15.7, h=36.4, rows=4, cols=4, base_h=3.5,
                       note='16-drawer long dresser with LED strip and charging station (Wayfair, Wrought Studio). '
                            '78.7 x 15.7 x 36.4 from identical listings sold under other brands; 4 x 4 drawer grid '
                            'assumed'),
    'storklinta': dict(w=27.5, d=18.875, h=29.5, rows=3, cols=1, base_h=2.5,
                       note='IKEA STORKLINTA 3-drawer dresser, oak effect: 27 1/2 x 18 7/8 x 29 1/2 (IKEA listing)'),
    'nightstand-fluted': dict(w=26.6, d=15.7, h=27, gallery=3.15, drawers=3,
                              note='Latitude Run nightstand with 3 fluted drawers, gold pulls and a charging strip '
                                   '(Wayfair W123971603): 26.6 W x 15.7 D x 27 H to the top of the side panels, which '
                                   'rise 3.15 in above the top (so the top is at about 23.9 in). Drawers 23.7 x 11.8 x '
                                   '4.7 in inside. From the listing\'s dimension drawing.'),
    'dog-crate': dict(w=18, d=24, h=19, pitch=1.5, note='black wire dog crate with a plastic tray, door on the 18 in end; '
                                                        '18 W x 24 D x 19 H (owner\'s size)'),
    # Nala: shape from the owner's photo; size is a typical 15 lb dachshund (estimate) -- set length (nose to tail
    # tip) and shoulder height once measured and the whole dog rescales
    'dog': dict(length=29.0, shoulder=9.0, note='Nala: black-and-tan long-haired dachshund, 15 lb. Shape from a '
                                                'photo; about 29 in nose to tail tip and 9 in at the shoulder '
                                                '(typical for her weight, not measured)'),
    'dog-bed': dict(dia=23, h=7, deck=2.0, note='grey plush donut bed from the owner\'s photo; 23 in across x 7 in '
                                                 'is the usual small size (estimate)'),
    # bikes: overall size from typical geometry for these sizes (estimates); length along x, bars across y
    'bike-warroad': dict(wheelbase=40.0, wheel_d=27.2, tire=1.5, bars=16.5, seat_tube=21.3, stack=22.3, reach=15.3,
                         saddle_z=37.5, note='Salsa Warroad 54 cm: about 67 x 17 x 40 in (estimated from typical '
                                             '54 cm geometry)'),
    'bike-avail': dict(wheelbase=39.2, wheel_d=27.0, tire=1.25, bars=15.7, seat_tube=20.5, stack=21.5, reach=14.8,
                       saddle_z=36.5, note='Liv Avail, about 52 cm (size S): about 66 x 16 x 39 in (estimated)'),
}

GROOVE_W, GROOVE_D = 0.6, 0.5          # mm, engraved detail lines
MIN_POST = 1.6                          # mm, thinnest printable leg/pole
TALL_POST = 2.4                         # mm, legs/poles taller than ~10 mm: 1.6-2 mm ones snapped mid-print
LABEL_FONT = FontProperties(family='DejaVu Sans', weight='bold')
LABEL_D = 0.4                           # mm, depth of the engraved size labels (tables, rugs)
TABLE_LABEL_H, RUG_LABEL_H = 3.0, 6.0   # mm, digit height; ~0.7 mm strokes at 3 mm
TABLE_TOP_MIN = 1.0                     # mm, labeled tabletops: label + leaf seams leave >= 0.5 mm of top
RUG_T = 0.8                             # mm, rug sheet: label engraved halfway


def cube(x0, y0, z0, x1, y1, z1):
    return m3d.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def union(ms):
    return m3d.Manifold.batch_boolean(ms, m3d.OpType.Add)


def _rbox(x0, y0, z0, x1, y1, z1, r, segs=12):
    """3D rounded box (web scale): convex hull of 8 corner spheres."""
    r = min(r, (x1 - x0) * 0.45, (y1 - y0) * 0.45, (z1 - z0) * 0.45)
    if r <= 1e-4:
        return cube(x0, y0, z0, x1, y1, z1)
    sp = m3d.Manifold.sphere(r, segs)
    return m3d.Manifold.batch_hull([sp.translate([x, y, z])
                                    for x in (x0 + r, x1 - r) for y in (y0 + r, y1 - r) for z in (z0 + r, z1 - r)])


def _rslab(x0, y0, z0, x1, y1, z1, rxy, rz=0.0, segs=16):
    """Rounded-corner horizontal slab with optional top/bottom chamfer rz."""
    w, d, h = x1 - x0, y1 - y0, z1 - z0
    rxy = min(rxy, w * 0.48, d * 0.48)
    cs = m3d.CrossSection.square([w - 2 * rxy, d - 2 * rxy], center=True).offset(
        rxy, m3d.JoinType.Round, circular_segments=segs)
    if rz <= 1e-4:
        return cs.extrude(h).translate([(x0 + x1) / 2, (y0 + y1) / 2, z0])
    rz = min(rz, h * 0.45, rxy * 0.9)
    mid = cs.extrude(h - 2 * rz).translate([0, 0, rz])
    inner = cs.offset(-rz, m3d.JoinType.Round, circular_segments=segs)
    return m3d.Manifold.batch_hull([mid, inner.extrude(0.02),
                                    inner.extrude(0.02).translate([0, 0, h - 0.02])]).translate(
        [(x0 + x1) / 2, (y0 + y1) / 2, z0])


def _taper_leg(p0, p1, r0, r1, segs=12):
    """Tapered round leg between two 3D points."""
    return m3d.Manifold.batch_hull([m3d.Manifold.sphere(r0, segs).translate(list(p0)),
                                    m3d.Manifold.sphere(r1, segs).translate(list(p1))])


# Each builder works in model mm with x = width, y = depth (front face at y = 0), z = up.
def sofa(f, s, parts=False):
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    aw, ah, sh, bd = f['arm_w'] * s, f['arm_h'] * s, f['seat_h'] * s, f['back_d'] * s
    n = f['seats']
    cw = (W - 2 * aw) / n
    if parts:
        lh = 1.8 * s
        legs = [cube(x, y, 0, x + 2.4 * s, y + 2.4 * s, lh + 0.3 * s)
                for x in (1.2 * s, W / 2 - 1.2 * s, W - 3.6 * s) for y in (1.5 * s, D - 3.9 * s)]
        frame = [
            _rbox(aw * 0.35, 0.8 * s, lh, W - aw * 0.35, D - 0.3 * s, 8.2 * s, 0.8 * s),
            _rbox(aw * 0.4, D - bd * 0.48, lh, W - aw * 0.4, D, H - 6.2 * s, 1.2 * s),
            _rbox(0.15 * s, 0.4 * s, lh, aw, D - 0.2 * s, ah - 3.6 * s, 1.0 * s),
            _rbox(W - aw, 0.4 * s, lh, W - 0.15 * s, D - 0.2 * s, ah - 3.6 * s, 1.0 * s),
            _rbox(0, 0.1 * s, ah - 4.8 * s, aw + 0.5 * s, D - 0.4 * s, ah, 2.0 * s),
            _rbox(W - aw - 0.5 * s, 0.1 * s, ah - 4.8 * s, W, D - 0.4 * s, ah, 2.0 * s),
        ]
        cushions, backs = [], []
        gap = 0.28 * s
        for i in range(n):
            x0, x1 = aw + i * cw + gap, aw + (i + 1) * cw - gap
            cushions.append(_rbox(x0, 0, lh + 0.5 * s, x1, 4.8 * s, 13.6 * s, 1.1 * s))          # footrest bolster
            cushions.append(_rbox(x0, 0, 13.7 * s, x1, D - bd + 1.6 * s, sh + 0.3 * s, 1.8 * s))  # seat cushion
            backs.append(_rbox(x0 + 0.1 * s, D - bd - 1.0 * s, sh - 0.6 * s,
                               x1 - 0.1 * s, D - bd * 0.34, H - 5.6 * s, 2.1 * s))                # lumbar back
            backs.append(_rbox(x0 + 0.9 * s, D - bd * 0.9, H - 5.8 * s,
                               x1 - 0.9 * s, D - 0.2 * s, H, 1.7 * s))                            # headrest
        ctrl = [cube(0, 9.5 * s, 15.0 * s, 0.35 * s, 13.0 * s, 17.0 * s),
                cube(W - 0.35 * s, 9.5 * s, 15.0 * s, W, 13.0 * s, 17.0 * s)]
        return [('legs', union(legs)), ('frame', union(frame)), ('cushions', union(cushions)),
                ('backs', union(backs)), ('controls', union(ctrl))]
    back_top = H - 5 * s                                       # headrests stand 5" above the back
    pts = [cube(0, 0, 0, aw, D, ah), cube(W - aw, 0, 0, W, D, ah),
           cube(aw, 0, 0, W - aw, D, sh), cube(aw, D - bd, 0, W - aw, D, back_top)]
    gap = 1.5 * s
    for i in range(n):                                         # one headrest per seat
        pts.append(cube(aw + i * cw + gap / 2, D - bd * 0.85, 0, aw + (i + 1) * cw - gap / 2, D, H))
    body = union(pts)
    cuts = [cube(aw - 0.1, -0.1, 14 * s - GROOVE_W / 2, W - aw + 0.1, GROOVE_D, 14 * s + GROOVE_W / 2)]  # footrest line
    for i in range(1, n):
        x = aw + i * cw
        cuts += [cube(x - GROOVE_W / 2, -0.1, sh - GROOVE_D, x + GROOVE_W / 2, D - bd + 0.1, sh + 1),  # seat split
                 cube(x - GROOVE_W / 2, -0.1, 3 * s, x + GROOVE_W / 2, GROOVE_D, sh + 0.1),            # front split
                 cube(x - GROOVE_W / 2, D - bd - 0.1, sh, x + GROOVE_W / 2, D - bd + GROOVE_D, H + 1)]  # back split
    return body - union(cuts)


def sofa_recline_zone(f, s, sofa_f):
    aw = sofa_f['arm_w'] * s
    W = sofa_f['w'] * s
    return cube(0, 0, 0, W - 2 * aw, f['d'] * s, 0.6)


def coffee_table(f, s, parts=False):
    W, D, H, lh = f['w'] * s, f['d'] * s, f['h'] * s, f['leg_h'] * s
    cw = f['cubby_w'] * s
    if parts:
        t = 0.85 * s
        div_x = W - cw - t
        top_s = _rslab(0, 0, H - t, W, D, H, 0.45 * s, rz=0.14 * s)
        bot_s = _rslab(0, 0, lh, W, D, lh + t, 0.45 * s, rz=0.1 * s)
        walls = [cube(0.15 * s, 0.15 * s, lh + t - 0.1, t, D - 0.15 * s, H - t + 0.1),
                 cube(W - t, 0.15 * s, lh + t - 0.1, W - 0.15 * s, D - 0.15 * s, H - t + 0.1),
                 cube(div_x, 0.15 * s, lh + t - 0.1, div_x + t, D - 0.15 * s, H - t + 0.1),
                 cube(0.15 * s, D - t, lh + t - 0.1, W - 0.15 * s, D - 0.15 * s, H - t + 0.1)]
        drawer = _rbox(t + 0.22 * s, 0.28 * s, lh + t + 0.22 * s,
                       div_x - 0.22 * s, 1.0 * s, H - t - 0.22 * s, 0.2 * s)
        mx = (t + div_x) / 2
        mz = (lh + H) / 2
        pull = _rbox(mx - 2.2 * s, 0.02 * s, mz - 0.25 * s, mx + 2.2 * s, 0.35 * s, mz + 0.25 * s, 0.12 * s)
        legs = []
        for sx, x_top, x_bot in ((-1, 3.8 * s, 1.8 * s), (1, W - 3.8 * s, W - 1.8 * s)):
            for y_top, y_bot in ((3.0 * s, 1.5 * s), (D - 3.0 * s, D - 1.5 * s)):
                legs.append(_taper_leg((x_top, y_top, lh + 0.3 * s), (x_bot, y_bot, 0.45 * s), 0.78 * s, 0.48 * s))
                pull = union([pull, _taper_leg((x_bot, y_bot, 0.9 * s), (x_bot, y_bot, 0.42 * s), 0.5 * s, 0.42 * s)])
        return [('carcass', union([top_s, bot_s] + walls)), ('drawer', drawer), ('pulls', pull), ('legs', union(legs))]
    body = cube(0, 0, lh, W, D, H)
    cubby = cube(W - cw - 1.0 * s, -0.1, lh + 1.5 * s, W - 1.0 * s, D * 0.7, H - 1.5 * s)   # open shelf, front
    leg = max(MIN_POST, 1.5 * s)
    ins = 2.0 * s
    legs = [cube(x, y, 0, x + leg, y + leg, lh + 0.1)
            for x in (ins, W - ins - leg) for y in (ins, D - ins - leg)]
    top_line = cube(-0.1, -0.1, H - 1.0 * s - GROOVE_W / 2, W + 0.1, GROOVE_D, H - 1.0 * s + GROOVE_W / 2)
    upright = union([body] + legs) - union([cubby, top_line])
    # print upside down: tabletop on the bed, legs up (no overhang under the top)
    return upright.mirror([0, 0, 1]).translate([0, 0, H])


def accent_chair(f, s, parts=False):
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    sh, bd, lh = f['seat_h'] * s, f['back_d'] * s, f['leg_h'] * s
    if parts:
        legs = [_taper_leg((xt, yt, lh + 0.8 * s), (xb, yb, 0.5 * s), 0.85 * s, 0.5 * s)
                for xt, xb in ((3.5 * s, 1.8 * s), (W - 3.5 * s, W - 1.8 * s))
                for yt, yb in ((3.5 * s, 2.0 * s), (D - 3.5 * s, D - 1.8 * s))]
        frame = [_rbox(0, 0.5 * s, lh, W, D, lh + 5.2 * s, 1.5 * s),
                 _rbox(0, D - bd, lh + 2.5 * s, W, D, H, 2.2 * s)]
        cushions = [_rbox(0.3 * s, 0, lh + 4.8 * s, W - 0.3 * s, D - bd + 1.6 * s, sh + 0.2 * s, 2.0 * s),
                    _rbox(4.2 * s, D - bd - 3.0 * s, sh - 0.2 * s, W - 4.2 * s, D - bd + 0.6 * s, sh + 8.8 * s, 1.7 * s)]
        return [('legs', union(legs)), ('frame', union(frame)), ('cushion', union(cushions))]
    body = union([cube(0, 0, 0, W, D - bd, sh), cube(0, D - bd, 0, W, D, H)])
    r = 0.8                                                    # recessed base reads as open legs
    base = union([cube(-0.1, -0.1, -0.1, W + 0.1, r, lh), cube(-0.1, -0.1, -0.1, r, D + 0.1, lh),
                  cube(W - r, -0.1, -0.1, W + 0.1, D + 0.1, lh), cube(-0.1, D - r, -0.1, W + 0.1, D + 0.1, lh)])
    seam = cube(-0.1, -0.1, sh - 4 * s - GROOVE_W / 2, W + 0.1, GROOVE_D, sh - 4 * s + GROOVE_W / 2)
    return body - union([base, seam])


def plant(f, s, parts=False):
    """Bird of paradise: a floor pot, a clump of stems fanning out, a paddle leaf at the end of each. The leaves
    face outward and taper from the stem, so no edge leans more than ~40 deg from vertical: no supports."""
    rp, ph = f['pot_dia'] * s / 2, f['pot_h'] * s
    rs = f['saucer_dia'] * s / 2                                # saucer: a wider footprint for a tall, top-heavy print
    if parts:
        rc = rp * 1.35                                          # realistic 9.5" ceramic floor planter at web scale
        saucer = m3d.Manifold.cylinder(0.7 * s, rc * 1.08, rc * 0.96, 48)
        outer = m3d.Manifold.cylinder(ph * 1.15, rc * 0.88, rc * 1.02, 48).translate([0, 0, 0.45 * s])
        well = m3d.Manifold.cylinder(2.0 * s, rc * 0.86, rc * 0.90, 48).translate([0, 0, ph * 1.15 - 1.2 * s])
        pot = union([saucer, outer - well])
        soil = m3d.Manifold.cylinder(0.5 * s, rc * 0.88, rc * 0.88, 36).translate([0, 0, ph * 1.15 - 1.3 * s])
        stems, blades = [], []
        th = max(0.35, 0.22 * s)
        for lf in f['leaves']:
            phi, al = math.radians(lf['dir']), math.radians(lf['tilt'])
            ux, uy = math.cos(phi), math.sin(phi)
            a = np.array([math.sin(al) * ux, math.sin(al) * uy, math.cos(al)])
            t = np.array([-uy, ux, 0.0])
            n = np.cross(t, a)
            p0 = np.array([0.3 * rp * ux, 0.3 * rp * uy, ph - 0.3 * s])
            p1 = p0 + lf['stem'] * s * a
            pm = (p0 + p1) / 2 + np.array([0.0, 0.0, 1.2 * s])
            stems.append(_tube([p0, pm, p1], 0.32 * s))
            L, hw = lf['len'] * s, lf['w'] * s / 2
            us = np.linspace(0, L, 25)
            half = np.where(us < 0.6 * L, np.sin(np.pi / 2 * us / (0.6 * L)),
                            np.cos(np.pi / 2 * (us - 0.6 * L) / (0.4 * L)))
            half = np.maximum(hw * half, 0.05)
            outline = np.array([(h, u) for u, h in zip(us, half)] + [(-h, u) for u, h in zip(us[::-1], half[::-1])])
            blade = m3d.CrossSection([outline], m3d.FillRule.NonZero).extrude(th).translate([0, 0, -th / 2])
            origin = p1 - 0.3 * a
            blades.append(blade.transform(np.column_stack([t, a, n, origin])))
        return [(k, m.translate([rs, rs, 0])) for k, m in
                (('pot', pot), ('soil', soil), ('stems', union(stems)), ('leaves', union(blades)))]
    pts = [m3d.Manifold.cylinder(0.6, rs, rs, 48), m3d.Manifold.cylinder(ph, rp, rp, 48)]
    th = f['leaf_t_mm']
    for lf in f['leaves']:
        phi, al = math.radians(lf['dir']), math.radians(lf['tilt'])
        ux, uy = math.cos(phi), math.sin(phi)
        a = np.array([math.sin(al) * ux, math.sin(al) * uy, math.cos(al)])     # stem/leaf axis
        t = np.array([-uy, ux, 0.0])                                            # across the leaf
        n = np.cross(t, a)                                                      # leaf faces outward
        p0 = np.array([0.3 * rp * ux, 0.3 * rp * uy, ph - 0.5])
        p1 = p0 + lf['stem'] * s * a
        pts.append(_tube([p0, p1], f['stem_mm'] / 2))
        L, hw = lf['len'] * s, lf['w'] * s / 2
        us = np.linspace(0, L, 25)                                              # widest at 60%, pointed tips
        half = np.where(us < 0.6 * L, np.sin(np.pi / 2 * us / (0.6 * L)), np.cos(np.pi / 2 * (us - 0.6 * L) / (0.4 * L)))
        half = np.maximum(hw * half, 0.05)
        outline = np.array([(h, u) for u, h in zip(us, half)] + [(-h, u) for u, h in zip(us[::-1], half[::-1])])
        blade = m3d.CrossSection([outline], m3d.FillRule.NonZero).extrude(th).translate([0, 0, -th / 2])
        origin = p1 - 0.3 * a
        pts.append(blade.transform(np.column_stack([t, a, n, origin])))
    return union(pts).translate([rs, rs, 0])


def door_cabinet(f, s, parts=False):
    """Cabinet with hinged doors across the front (y = 0), a top edge line and short feet."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    legs = f.get('leg_h', 0) * s
    n = f.get('doors', 2)
    if parts:
        top_t = 0.85 * s
        carcass = union([cube(0.15 * s, 0.8 * s, legs, W - 0.15 * s, D, H - top_t + 0.1),
                         _rslab(0, 0.25 * s, H - top_t, W, D, H, 0.35 * s, rz=0.12 * s)])
        doors, knobs = [], []
        dw = (W - 0.5 * s) / n
        st = 1.6 * s
        for i in range(n):
            x0, x1 = 0.25 * s + i * dw + 0.12 * s, 0.25 * s + (i + 1) * dw - 0.12 * s
            z0, z1 = legs + 0.3 * s, H - top_t - 0.22 * s
            slab = cube(x0, 0.32 * s, z0, x1, 0.85 * s, z1)
            recess = cube(x0 + st, 0.28 * s, z0 + st, x1 - st, 0.55 * s, z1 - st)
            doors.append(slab - recess)
            kx = x1 - 1.1 * s if i == 0 else x0 + 1.1 * s
            knobs.append(m3d.Manifold.cylinder(0.38 * s, 0.42 * s, 0.32 * s, 16).rotate([90, 0, 0]).translate(
                [kx, 0.38 * s, (z0 + z1) * 0.56]))
        feet = [_taper_leg((x, y, legs + 0.3 * s), (x, y, 0.35 * s), 0.7 * s, 0.45 * s)
                for x in (2.0 * s, W - 2.0 * s) for y in (2.0 * s, D - 2.0 * s)]
        return [('body', carcass), ('doors', union(doors)), ('knobs', union(knobs)), ('legs', union(feet))]
    cuts = _grooves_front(W, H, s, zs=[H - 1.0 * s, legs + 0.5 * s],
                          xs=[W * i / n for i in range(1, n)], z_lo=legs + 0.5 * s, z_hi=H - 1.0 * s)
    if legs:
        cuts += _recessed_base(W, D, legs)
    return cube(0, 0, 0, W, D, H) - union(cuts)


def standing_desk(f, s, parts=False):
    """Desktop on two full-depth side frames. Upright, the top bridges cleanly between the frames."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    t, lw, li = f['top_t'] * s, max(MIN_POST, f['leg_w'] * s), f['leg_inset'] * s
    if parts:
        top = _rslab(0, 0, H - t, W, D, H, 0.75 * s, rz=0.18 * s)
        cw, cd = 2.4 * s, 1.6 * s
        frame = [cube(li, D / 2 - 5.5 * s, H - t - 1.2 * s, W - li, D / 2 + 5.5 * s, H - t + 0.05)]
        frame.append(cube(li, D / 2 - 2.0 * s, H - t - 2.0 * s, W - li, D / 2 + 2.0 * s, H - t))
        for x in (li + 1.0 * s, W - li - 1.0 * s - cw):
            frame.append(_rslab(x - 0.4 * s, 1.6 * s, 0, x + cw + 0.4 * s, D - 1.6 * s, 1.0 * s, 0.5 * s, rz=0.15 * s))
            frame.append(cube(x, D / 2 - cd / 2, 0.8 * s, x + cw, D / 2 + cd / 2, 15.0 * s))
            frame.append(cube(x + 0.2 * s, D / 2 - cd * 0.38, 14.5 * s, x + cw - 0.2 * s, D / 2 + cd * 0.38, H - t))
        frame.append(_rbox(W - 8.5 * s, 0.25 * s, H - t - 0.75 * s, W - 5.5 * s, 2.4 * s, H - t + 0.05, 0.15 * s))
        return [('top', top), ('frame', union(frame))]
    legs = [cube(x, 1.5 * s, 0, x + lw, D - 1.5 * s, H - t + 0.1) for x in (li, W - li - lw)]
    return union([cube(0, 0, H - t, W, D, H)] + legs)


def tv_stand(f, s, parts=False):
    """AX WABER-style rolling stand: base plate on 4 casters (shown as a recessed band so it prints solid),
    one pole, and a mount block with a 45-degree underside (no supports). The TV prints separately as a flat
    slab and glues onto the mount block's front face. Front (TV side) at y = 0."""
    W, D = f['base_w'] * s, f['base_d'] * s
    bh, ch = f['base_h'] * s, f['caster_h'] * s
    if parts:
        cx, cy = W / 2, D / 2
        pw, pd = f['pole_w'] * s, f['pole_d'] * s
        stand = [_rslab(0, 0, ch, W, D, bh, 1.2 * s, rz=0.2 * s),
                 _rslab(cx - pw * 0.8, cy - pd * 0.8, bh - 0.1, cx + pw * 0.8, cy + pd * 0.8, bh + 0.8 * s, 0.4 * s),
                 _rslab(cx - pw / 2, cy - pd / 2, bh, cx + pw / 2, cy + pd / 2, f['pole_h'] * s, 0.35 * s),
                 _rslab(cx - 7.5 * s, cy - pd / 2 - 4.5 * s, 18 * s, cx + 7.5 * s, cy + 1.0 * s, 18.6 * s, 0.6 * s)]
        for x in (2.2 * s, W - 2.2 * s):
            for y in (2.2 * s, D - 2.2 * s):
                stand.append(m3d.Manifold.cylinder(0.8 * s, 1.05 * s, 1.05 * s, 20).rotate([0, 90, 0]).translate(
                    [x - 0.4 * s, y, 1.05 * s]))
                stand.append(cube(x - 0.55 * s, y - 0.55 * s, 1.05 * s, x + 0.55 * s, y + 0.55 * s, ch + 0.2 * s))
        mz, off = f['mount_z'] * s, f['mount_off'] * s
        y_front = cy - pd / 2 - off
        stand.append(cube(cx - 8 * s, y_front - 0.2 * s, mz - 4 * s, cx + 8 * s, cy - pd / 2 + 0.2 * s, mz + 4 * s))
        tw, th, tt = f['tv_w'] * s, f['tv_h'] * s, f['tv_t'] * s
        tx0, tx1 = cx - tw / 2, cx + tw / 2
        tz0, tz1 = mz - th / 2, mz + th / 2
        ty0 = y_front - tt                                      # viewer-facing screen plane (toward y = 0)
        bz = 0.42 * s
        panel = _rbox(tx0, ty0, tz0, tx1, ty0 + 0.65 * s, tz1, 0.18 * s)
        housing = _rbox(tx0 + 3.5 * s, ty0 + 0.5 * s, tz0 + 2.5 * s, tx1 - 3.5 * s, y_front, tz1 - 4.0 * s, 0.4 * s)
        rec = cube(tx0 + bz, ty0 - 0.2 * s, tz0 + bz, tx1 - bz, ty0 + 0.22 * s, tz1 - bz)
        bezel = union([panel, housing]) - rec
        screen = cube(tx0 + bz, ty0 + 0.14 * s, tz0 + bz, tx1 - bz, ty0 + 0.32 * s, tz1 - bz)
        return [('stand', union(stand)), ('bezel', bezel), ('screen', screen)]
    base = cube(0, 0, 0, W, D, bh) - union(_recessed_base(W, D, ch))
    pw, pd = max(TALL_POST, f['pole_w'] * s), max(TALL_POST, f['pole_d'] * s)
    cx, cy = W / 2, D / 2
    pole = cube(cx - pw / 2, cy - pd / 2, 0, cx + pw / 2, cy + pd / 2, f['pole_h'] * s)
    c = 1.0                                                      # 45-degree collar where the pole meets the base
    collar = m3d.Manifold.batch_hull([cube(cx - pw / 2 - c, cy - pd / 2 - c, bh - 0.05, cx + pw / 2 + c, cy + pd / 2 + c, bh),
                                      cube(cx - pw / 2, cy - pd / 2, bh + c - 0.01, cx + pw / 2, cy + pd / 2, bh + c)])
    mz, off = f['mount_z'] * s, f['mount_off'] * s
    bw, bhh = 8 * s, 8 * s                                       # VESA plate area
    y0 = cy - pd / 2
    lower = m3d.Manifold.cube([bw, 0.01, 0.01]).translate([cx - bw / 2, y0 - 0.01, mz - bhh / 2 - off])
    upper = m3d.Manifold.cube([bw, off + 0.01, bhh]).translate([cx - bw / 2, y0 - off, mz - bhh / 2])
    return union([base, pole, collar, m3d.Manifold.batch_hull([lower, upper])])


def tv_on_stand(f, s):
    """The TV slab stood up and placed on the stand's mount (for previews only)."""
    W, D = f['base_w'] * s, f['base_d'] * s
    pd = max(MIN_POST, f['pole_d'] * s)
    y_front = D / 2 - pd / 2 - f['mount_off'] * s
    t = max(0.8, f['tv_t'] * s)
    slab = cube(0, -t, 0, f['tv_w'] * s, 0, f['tv_h'] * s)
    return slab.translate([W / 2 - f['tv_w'] * s / 2, y_front, f['mount_z'] * s - f['tv_h'] * s / 2])


def tv(f, s):
    """The TV as a flat slab (prints lying down); glue its back to the stand's mount block."""
    return cube(0, 0, 0, f['tv_w'] * s, f['tv_h'] * s, max(0.8, f['tv_t'] * s))


def pedestal_table(f, s, parts=False):
    """Round (dia) or oval (w x d) top on a pedestal. Printed upside down: top on the bed, the column and a
    45-degree flare up to the base disc, so nothing overhangs."""
    w, d = f.get('w', f.get('dia')) * s, f.get('d', f.get('dia')) * s
    if parts:
        H, t = f['h'] * s, f.get('top_t', 1.25) * s
        rc = f.get('column_dia', 4) * s / 2
        rb = f.get('base_dia', 18) * s / 2
        if abs(w - d) < 1e-6:
            cs = m3d.CrossSection.circle(w / 2, 64)
        else:
            r = d / 2
            cs = m3d.CrossSection.square([w - 2 * r, 0.02], center=True).offset(
                r, m3d.JoinType.Round, circular_segments=48)
        rz = min(0.2 * s, t * 0.35)
        inner = cs.offset(-rz, m3d.JoinType.Round, circular_segments=32)
        top = m3d.Manifold.batch_hull([
            cs.extrude(t - 2 * rz).translate([0, 0, H - t + rz]),
            inner.extrude(0.02).translate([0, 0, H - t]),
            inner.extrude(0.02).translate([0, 0, H - 0.02]),
        ])
        flare = min(4.5 * s, (rb - rc) * 0.65)
        base = union([
            m3d.Manifold.cylinder(0.75 * s, rb, rb * 0.97, 64),
            m3d.Manifold.cylinder(flare, rb * 0.95, rc, 48).translate([0, 0, 0.65 * s]),
            m3d.Manifold.cylinder(H - t - 0.5 * s, rc, rc * 0.92, 36).translate([0, 0, 0.65 * s]),
            m3d.Manifold.cylinder(0.8 * s, rc * 2.1, rc * 2.4, 36).translate([0, 0, H - t - 0.75 * s]),
        ])
        return [('top', top.translate([w / 2, d / 2, 0])), ('base', base.translate([w / 2, d / 2, 0]))]
    H, t = f['h'] * s, max(TABLE_TOP_MIN, f.get('top_t', 1.25) * s)
    rc = max(MIN_POST / 2 + 0.2, f.get('column_dia', 4) * s / 2)
    rb = f.get('base_dia', 18) * s / 2
    flare = rb - rc
    if abs(w - d) < 1e-6:
        top = m3d.Manifold.cylinder(t, w / 2, w / 2, 64)
    else:                                                       # stadium-shaped oval top
        r = d / 2
        caps = [m3d.Manifold.cylinder(t, r, r, 48).translate([sx * (w / 2 - r), 0, 0]) for sx in (-1, 1)]
        top = m3d.Manifold.batch_hull(caps)
    col = m3d.Manifold.cylinder(H - t - 1.0 * s + 0.05, rc, rc, 32).translate([0, 0, t - 0.05])
    # 45-degree collar where the column meets the top: the root is where a thin column snaps (it did at 2 mm)
    collar = m3d.Manifold.cylinder(1.0, rc + 1.0, rc, 32).translate([0, 0, t - 0.05])
    # cone overlaps the disc slightly (no coincident rims: those make non-manifold edges after vertex merging)
    cone = m3d.Manifold.cylinder(flare + 0.05, rc, rb - 0.05, 48).translate([0, 0, H - 1.0 * s - flare])
    disc = m3d.Manifold.cylinder(1.0 * s, rb, rb, 48).translate([0, 0, H - 1.0 * s])
    body = union([top, col, collar, cone, disc]) - _bed_label(f['label'], TABLE_LABEL_H, 0, 0)
    return body.translate([w / 2, d / 2, 0])


def leg_table(f, s, parts=False):
    """Rectangular top on 4 legs. Printed upside down: top on the bed, legs up."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    if parts:
        t = f.get('top_t', 1.25) * s
        top = _rslab(0, 0, H - t, W, D, H, 0.85 * s, rz=0.18 * s)
        if f.get('leaf_at'):
            seams = [cube(xx * s - 0.08 * s, -0.1, H - 0.14 * s, xx * s + 0.08 * s, D + 0.1, H + 0.1)
                     for xx in f['leaf_at']]
            top = top - union(seams)
        ins = 2.6 * s
        aw, ah = 0.9 * s, 3.0 * s
        x0, x1, y0, y1 = ins, W - ins, ins, D - ins
        apron = [cube(x0, y0, H - t - ah, x1, y0 + aw, H - t + 0.1),
                 cube(x0, y1 - aw, H - t - ah, x1, y1, H - t + 0.1),
                 cube(x0, y0, H - t - ah, x0 + aw, y1, H - t + 0.1),
                 cube(x1 - aw, y0, H - t - ah, x1, y1, H - t + 0.1)]
        legs = [_taper_leg((xt, yt, H - t - 0.4 * s), (xb, yb, 0.55 * s), 1.05 * s, 0.62 * s)
                for xt, xb in ((ins + 0.8 * s, ins - 0.3 * s), (W - ins - 0.8 * s, W - ins + 0.3 * s))
                for yt, yb in ((ins + 0.8 * s, ins - 0.3 * s), (D - ins - 0.8 * s, D - ins + 0.3 * s))]
        return [('top', top), ('base', union(apron + legs))]
    t = max(TABLE_TOP_MIN, f.get('top_t', 1.25) * s)
    leg, ins = max(TALL_POST, 2.0 * s), 2.5 * s
    pts = [cube(0, 0, 0, W, D, t)]
    pts += [cube(x, y, t - 0.1, x + leg, y + leg, H) for x in (ins, W - ins - leg) for y in (ins, D - ins - leg)]
    # apron under the top, flush with the legs' outer faces: braces the leg roots
    aw, ah = 1.0, max(1.0, 3.0 * s)
    x0, x1, y0, y1 = ins, W - ins, ins, D - ins
    pts += [cube(x0, y0, t - 0.1, x1, y0 + aw, t + ah), cube(x0, y1 - aw, t - 0.1, x1, y1, t + ah),
            cube(x0, y0, t - 0.1, x0 + aw, y1, t + ah), cube(x1 - aw, y0, t - 0.1, x1, y1, t + ah)]
    label = _bed_label(f['label'], TABLE_LABEL_H, W / 2, D / 2)
    cuts = [label]
    if f.get('leaf_at'):                                        # seams on the tabletop (bed side, reads from above),
        b = label.bounding_box()                                # broken around the label
        keep = cube(-1, b[1] - 0.8, -1, W + 1, b[4] + 0.8, t + 1)
        cuts += [cube(xx * s - GROOVE_W / 2, -0.1, -0.1, xx * s + GROOVE_W / 2, D + 0.1, GROOVE_D) - keep
                 for xx in f['leaf_at']]
    return union(pts) - union(cuts)


def dining_chair(f, s, parts=False):
    """Armless dining chair: solid seat (recessed base reads as legs) + thin back."""
    W, D, H, sh = f['w'] * s, f['d'] * s, f['h'] * s, f['seat_h'] * s
    if parts:
        ins = 1.4 * s
        frame = [
            _taper_leg((ins + 0.4 * s, ins + 0.6 * s, sh - 1.4 * s), (ins, ins, 0.45 * s), 0.68 * s, 0.46 * s),
            _taper_leg((W - ins - 0.4 * s, ins + 0.6 * s, sh - 1.4 * s), (W - ins, ins, 0.45 * s), 0.68 * s, 0.46 * s),
            _tube([(ins, D - 1.8 * s, 0.45 * s), (ins + 0.3 * s, D - 2.3 * s, sh), (ins + 0.2 * s, D - 0.7 * s, H - 0.6 * s)], 0.58 * s),
            _tube([(W - ins, D - 1.8 * s, 0.45 * s), (W - ins - 0.3 * s, D - 2.3 * s, sh), (W - ins - 0.2 * s, D - 0.7 * s, H - 0.6 * s)], 0.58 * s),
            cube(ins + 0.2 * s, ins + 0.3 * s, sh - 2.4 * s, W - ins - 0.2 * s, D - 2.0 * s, sh - 1.2 * s),
            _rbox(ins - 0.2 * s, D - 1.5 * s, H - 5.6 * s, W - ins + 0.2 * s, D, H, 0.55 * s),
        ]
        seat = _rbox(0.35 * s, 0.2 * s, sh - 1.6 * s, W - 0.35 * s, D - 1.7 * s, sh + 0.2 * s, 0.85 * s)
        return [('frame', union(frame)), ('seat', seat)]
    bt = max(1.2, f.get('back_t', 2) * s)
    body = union([cube(0, 0, 0, W, D, sh), cube(0, D - bt, 0, W, D, H)])
    return body - union(_recessed_base(W, D, sh - 2 * s, r=0.6, sides='FLR'))


def rug(f, s, parts=False):
    W, D = f['w'] * s, f['d'] * s
    if parts:
        rt, bw = 0.28 * s, 3.2 * s
        outer = _rslab(0, 0, 0, W, D, rt * 0.9, 1.0 * s, rz=0.08 * s)
        hole = cube(bw, bw, -0.5, W - bw, D - bw, rt + 0.5)
        field = _rslab(bw - 0.05 * s, bw - 0.05 * s, 0, W - bw + 0.05 * s, D - bw + 0.05 * s, rt, 0.4 * s, rz=0.06 * s)
        return [('field', field), ('border', outer - hole)]
    label = _label(f['label'], RUG_LABEL_H).extrude(LABEL_D + 0.1).translate([W / 2, D / 2, RUG_T - LABEL_D])
    return cube(0, 0, 0, W, D, RUG_T) - label


def _label(text, cap_h, mirror=False):
    """Outline of `text` as a CrossSection centered on the origin, digits cap_h mm tall. mirror=True flips it
    front-to-back, for a face printed against the bed: it reads right once the piece is turned over."""
    k = cap_h / TextPath((0, 0), '0', size=1, prop=LABEL_FONT).get_extents().height
    polys = [p * [k, -k if mirror else k] for p in TextPath((0, 0), text, size=1, prop=LABEL_FONT).to_polygons()]
    lo, hi = np.min([p.min(axis=0) for p in polys], axis=0), np.max([p.max(axis=0) for p in polys], axis=0)
    return m3d.CrossSection([p - (lo + hi) / 2 for p in polys], m3d.FillRule.NonZero)


def _bed_label(text, cap_h, cx, cy):
    """Cutter for a label engraved LABEL_D into the bed face (z = 0) of a piece printed upside down."""
    return _label(text, cap_h, mirror=True).extrude(LABEL_D + 0.1).translate([cx, cy, -0.1])


def _grooves_front(W, H, s, zs=(), xs=(), z_lo=None, z_hi=None):
    """Engraved lines on the front face (y = 0): horizontal at heights zs (mm), vertical at xs (mm)."""
    cuts = [cube(-0.1, -0.1, z - GROOVE_W / 2, W + 0.1, GROOVE_D, z + GROOVE_W / 2) for z in zs]
    cuts += [cube(x - GROOVE_W / 2, -0.1, z_lo, x + GROOVE_W / 2, GROOVE_D, z_hi) for x in xs]
    return cuts


def _recessed_base(W, D, h, r=0.8, sides='FLRB'):
    """A shallow recess around the bottom so a box reads as standing on legs (prints fine, 0.8 mm ledge)."""
    c = []
    if 'F' in sides:
        c.append(cube(-0.1, -0.1, -0.1, W + 0.1, r, h))
    if 'B' in sides:
        c.append(cube(-0.1, D - r, -0.1, W + 0.1, D + 0.1, h))
    if 'L' in sides:
        c.append(cube(-0.1, -0.1, -0.1, r, D + 0.1, h))
    if 'R' in sides:
        c.append(cube(W - r, -0.1, -0.1, W + 0.1, D + 0.1, h))
    return c


def queen_bed(f, s, parts=False):
    """Frame + mattress + headboard + two pillows. Foot of the bed at y = 0, headboard at the back."""
    W, L = f['frame_w'] * s, f['frame_l'] * s
    fh, mt = f['frame_h'] * s, f['mattress_t'] * s
    mw, ml = f['mattress_w'] * s, f['mattress_l'] * s
    hb_h, hb_t = f['headboard_h'] * s, f['headboard_t'] * s
    mx0 = (W - mw) / 2
    my1 = L - hb_t - 0.5 * s
    my0 = my1 - ml
    if parts:
        lh = f.get('leg_h', 4) * s
        legs = [_taper_leg((x, y, lh + 0.5 * s), (x, y, 0.45 * s), 0.9 * s, 0.58 * s)
                for x in (2.4 * s, W - 2.4 * s) for y in (2.4 * s, L - 2.4 * s)]
        rail_outer = _rslab(0, 0, lh, W, L - hb_t + 0.4 * s, fh, 1.1 * s, rz=0.25 * s)
        rail_well = cube(mx0 + 0.4 * s, my0 + 0.4 * s, fh - 2.2 * s, mx0 + mw - 0.4 * s, my1 + 0.4 * s, fh + 1.0)
        hb = [_rbox(0, L - hb_t + 0.25 * s, lh * 0.5, W, L, hb_h, 0.9 * s)]
        nc, bdr = 4, 2.2 * s
        cw = (W - 2 * bdr) / nc
        for i in range(nc):
            hb.append(_rbox(bdr + i * cw + 0.18 * s, L - hb_t - 0.45 * s, fh - 1.0 * s,
                            bdr + (i + 1) * cw - 0.18 * s, L - 0.3 * s, hb_h - 1.8 * s, 0.85 * s))
        frame = union([rail_outer - rail_well] + hb)
        matt = _rbox(mx0, my0, fh - 1.4 * s, mx0 + mw, my1, fh + mt, 1.5 * s)
        cuff = _rbox(mx0 - 0.55 * s, my1 - 24.5 * s, fh + mt - 0.5 * s, mx0 + mw + 0.55 * s, my1 - 19.2 * s, fh + mt + 1.05 * s, 0.55 * s)
        duvet = _rbox(mx0 - 0.75 * s, my0 - 0.55 * s, fh + 1.8 * s, mx0 + mw + 0.75 * s, my1 - 20.5 * s, fh + mt + 0.8 * s, 1.7 * s)
        pw, gap = 25.5 * s, (mw - 51.0 * s) / 3
        pills = []
        for i in range(2):
            x0 = mx0 + gap + i * (pw + gap)
            sham = _rbox(0, 0, 0, pw, 5.2 * s, 12.5 * s, 1.7 * s).rotate([14, 0, 0]).translate(
                [x0, my1 - 6.8 * s, fh + mt - 0.6 * s])
            slp = _rbox(0.5 * s, 0, 0, pw - 0.5 * s, 12.5 * s, 4.6 * s, 1.7 * s).rotate([7, 0, 0]).translate(
                [x0, my1 - 18.8 * s, fh + mt - 0.2 * s])
            pills += [sham, slp]
        return [('legs', union(legs)), ('frame', frame), ('mattress', union([matt, cuff])),
                ('duvet', duvet), ('pillows', union(pills))]
    pts = [cube(0, 0, 0, W, L - hb_t, fh), cube(mx0, my0, fh - 0.1, mx0 + mw, my1, fh + mt),
           cube(0, L - hb_t, 0, W, L, hb_h)]
    pw, pd, ph = 26 * s, 18 * s, 4 * s                         # two standard pillows across the head
    gap = (mw - 2 * pw) / 3
    for i in range(2):
        x0 = mx0 + gap + i * (pw + gap)
        pts.append(cube(x0, my1 - 2 * s - pd, fh + mt - 0.1, x0 + pw, my1 - 2 * s, fh + mt + ph))
    body = union(pts)
    fold = cube(mx0 - 0.1, my1 - 2 * s - pd - 10 * s - GROOVE_W / 2, fh + mt - GROOVE_D,
                mx0 + mw + 0.1, my1 - 2 * s - pd - 10 * s + GROOVE_W / 2, fh + mt + 1)    # duvet fold line
    cuts = [fold] + _recessed_base(W, L - hb_t, f.get('leg_h', 0) * s, sides='FLR') if f.get('leg_h') else [fold]
    return body - union(cuts)


def dresser(f, s, parts=False):
    """rows x cols drawers, top edge line, recessed base."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    base = f.get('base_h', 3) * s
    top_t = 1.0 * s
    rows, cols = f['rows'], f['cols']
    if parts:
        carcass = union([
            cube(0.15 * s, 0.85 * s, base, W - 0.15 * s, D, H - top_t + 0.1),
            cube(0.45 * s, 1.35 * s, 0, W - 0.45 * s, D - 0.2 * s, base + 0.2),
            _rslab(0, 0.2 * s, H - top_t, W, D, H, 0.35 * s, rz=0.12 * s),
        ])
        gap = 0.24 * s
        dh = (H - top_t - base - gap * (rows + 1)) / rows
        dw = (W - 0.6 * s - gap * (cols + 1)) / cols
        fronts, pulls = [], []
        pw = min(5.2 * s, dw * 0.38)
        for r in range(rows):
            z0 = base + gap + r * (dh + gap)
            for c in range(cols):
                x0 = 0.3 * s + gap + c * (dw + gap)
                fronts.append(_rbox(x0, 0.32 * s, z0, x0 + dw, 0.9 * s, z0 + dh, 0.14 * s))
                cx = x0 + dw / 2
                pz = z0 + dh * 0.62
                pulls.append(_rbox(cx - pw / 2, 0, pz - 0.2 * s, cx + pw / 2, 0.36 * s, pz + 0.2 * s, 0.08 * s))
        return [('body', carcass), ('drawers', union(fronts)), ('pulls', union(pulls))]
    zs = [H - top_t] + [base + (H - top_t - base) * i / rows for i in range(1, rows)]
    xs = [W * j / cols for j in range(1, cols)]
    cuts = _grooves_front(W, H, s, zs=zs, xs=xs, z_lo=base, z_hi=H - top_t)
    cuts += _recessed_base(W, D, base, sides='FLR')
    return cube(0, 0, 0, W, D, H) - union(cuts)


def nightstand(f, s, parts=False):
    """Small bedside table: optional drawer(s), optional open shelf, optional legs."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    legs = f.get('leg_h', 0) * s
    if parts:
        top_t, side_t, plinth = 0.75 * s, 0.65 * s, max(1.6 * s, legs)
        body = union([
            cube(0, 0.45 * s, 0, side_t, D, H - top_t + 0.1),
            cube(W - side_t, 0.45 * s, 0, W, D, H - top_t + 0.1),
            cube(side_t - 0.1, D - side_t, 0, W - side_t + 0.1, D, H - top_t + 0.1),
            cube(side_t - 0.1, 0.75 * s, 0, W - side_t + 0.1, D, plinth),
            cube(side_t - 0.1, 0.65 * s, plinth, W - side_t + 0.1, D, H - top_t + 0.1),
            _rslab(0, 0, H - top_t, W, D, H, 0.28 * s, rz=0.1 * s),
        ])
        n = max(1, f.get('drawers', 2))
        gap = 0.55 * s
        dh = (H - top_t - plinth - gap * (n + 1)) / n
        fronts = [_rbox(side_t + 0.15 * s, 0.08 * s, plinth + gap + i * (dh + gap),
                        W - side_t - 0.15 * s, 0.7 * s, plinth + gap + i * (dh + gap) + dh, 0.14 * s)
                  for i in range(n)]
        return [('body', body), ('drawers', union(fronts))]
    body = cube(0, 0, 0, W, D, H)
    cuts = []
    top_t = 0.8 * s
    drawer_lo, drawer_hi = legs + 1.0 * s, H - top_t
    if f.get('shelf'):                                          # open compartment, on top or at the bottom
        if f.get('shelf_top'):
            sh_hi, sh_lo = H - top_t, H - top_t - f['shelf'] * s
            drawer_hi = sh_lo - 1.0 * s
        else:
            sh_lo, sh_hi = legs + 1.0 * s, legs + f['shelf'] * s
            drawer_lo = sh_hi + 1.0 * s
        cuts.append(cube(1.0 * s, -0.1, sh_lo, W - 1.0 * s, D * 0.8, sh_hi))
    n = f.get('drawers', 0)
    if n:
        zs = [drawer_lo + (drawer_hi - drawer_lo) * i / n for i in range(1, n)] + [drawer_lo - 0.5 * s, drawer_hi]
        cuts += _grooves_front(W, H, s, zs=zs)
    if legs:
        cuts += _recessed_base(W, D, legs, r=min(1.0, W * 0.15))
    return body - union(cuts) if cuts else body


def sofa_bed(f, s, opened=False, parts=False):
    """Innovation Living-style sofa bed (Achillas): armless, on caster legs. Folded = seat unit in front,
    upright back section behind, two leaning back cushions. Opened = the seat slides forward and the back
    folds down: one flat mattress, back edge where the sofa's back was. Front at y = 0."""
    W = f['w'] * s
    leg = f['leg_h'] * s
    if parts:
        mt = f['mattress_t'] * s
        D_tot = (f['bed_l'] if opened else f['d']) * s
        legs = []
        for x in (4.5 * s, W - 4.5 * s):
            legs.append(_taper_leg((x, 4.5 * s, leg + 0.3 * s), (x, 2.2 * s, 0.4 * s), 0.62 * s, 0.42 * s))
            legs.append(_taper_leg((x, D_tot - 4.5 * s, leg + 0.3 * s), (x, D_tot - 3.5 * s, 1.1 * s), 0.6 * s, 0.45 * s))
            legs.append(m3d.Manifold.cylinder(0.8 * s, 1.1 * s, 1.1 * s, 20).rotate([0, 90, 0]).translate(
                [x - 0.4 * s, D_tot - 3.5 * s, 1.1 * s]))
        rails = cube(2.5 * s, 2.5 * s, leg - 1.1 * s, W - 2.5 * s, D_tot - 2.5 * s, leg + 0.3 * s)
        if not opened:
            D, H, sh, bt = f['d'] * s, f['h'] * s, f['seat_h'] * s, f['back_t'] * s
            matt = union([_rbox(0, 0, leg, W, D - bt + 0.6 * s, sh, 1.7 * s),
                          _rbox(0, D - bt, leg, W, D, H, 1.7 * s)])
            cw, cd = f['cushion_w'] * s, f['cushion_d'] * s
            n = f.get('cushions', 2)
            gap = (W - n * cw) / (n + 1)
            cush = [_rbox(0, 0, 0, cw, cd, H - sh - 0.6 * s, 1.8 * s).rotate([11, 0, 0]).translate(
                    [gap + i * (cw + gap), D - bt - cd + 0.4 * s, sh - 0.4 * s]) for i in range(n)]
        else:
            L, bh, ys = f['bed_l'] * s, f['bed_h'] * s, f['seat_unit_d'] * s
            matt = union([_rbox(0, 0, leg, W, ys - 0.15 * s, bh, 1.5 * s),
                          _rbox(0, ys + 0.15 * s, leg, W, L, bh, 1.5 * s)])
            pw, gap = 22.5 * s, (W - 45.0 * s) / 3
            cush = [_rbox(gap + i * (pw + gap), L - 16.5 * s, bh - 0.3 * s,
                          gap + i * (pw + gap) + pw, L - 2.5 * s, bh + 3.4 * s, 1.4 * s) for i in range(2)]
        return [('legs', union(legs)), ('frame', rails), ('mattress', matt), ('cushions', union(cush))]
    if not opened:
        D, H, sh = f['d'] * s, f['h'] * s, f['seat_h'] * s
        bt = f['back_t'] * s
        pts = [cube(0, 0, 0, W, D - bt, sh), cube(0, D - bt, 0, W, D, H)]
        cw, cd = f['cushion_w'] * s, f['cushion_d'] * s
        n = f.get('cushions', 2)
        gap = (W - n * cw) / (n + 1)
        for i in range(n):                                       # cushions lean on the back, seat to back top
            x0 = gap + i * (cw + gap)
            pts.append(cube(x0, D - bt - cd, sh - 0.1, x0 + cw, D - bt + 0.1, H - 1.0 * s))
        body = union(pts)
        cuts = _recessed_base(W, D, leg) + _grooves_front(W, H, s, zs=[sh - f['mattress_t'] * s])  # mattress edge
    else:
        L, bh = f['bed_l'] * s, f['bed_h'] * s
        body = cube(0, 0, 0, W, L, bh)
        y = f['seat_unit_d'] * s                                  # seam between the two mattress halves
        cuts = _recessed_base(W, L, leg) + [cube(-0.1, y - GROOVE_W / 2, bh - GROOVE_D, W + 0.1, y + GROOVE_W / 2, bh + 1)]
        cuts += _grooves_front(W, bh, s, zs=[bh - f['mattress_t'] * s])
    return body - union(cuts)


def _tube(points, r):
    """Round tube through 3D points (mm), as a union of capsules."""
    sph = [m3d.Manifold.sphere(r, 16).translate(list(p)) for p in points]
    return union([m3d.Manifold.batch_hull([sph[i], sph[i + 1]]) for i in range(len(sph) - 1)])


def arc_lamp(f, s, parts=False):
    """Brightech Trilage as it stands in the owner's photo: a thick lower pole, then three thin rods rising
    together and fanning out like reeds, each ending at a tip with a short vertical drop rod to a drum shade.
    The rods only ever rise (max ~40 deg from vertical), so the shades are the only parts that need supports."""
    rb = f['base_dia'] * s / 2
    if parts:
        bt = f['base_t'] * s
        base = m3d.Manifold.cylinder(bt, rb, rb * 0.97, 56)
        ph, bz = f['pole_h'] * s, f['bundle_z'] * s
        brass = [m3d.Manifold.cylinder(1.2 * s, 1.3 * s, 0.85 * s, 28).translate([0, 0, bt - 0.1]),
                 m3d.Manifold.cylinder(ph, 0.65 * s, 0.62 * s, 24).translate([0, 0, bt * 0.5]),
                 m3d.Manifold.cylinder(1.4 * s, 0.82 * s, 0.82 * s, 24).translate([0, 0, bz - 0.7 * s])]
        shades, bulbs = [], []
        for arm in f['arms']:
            a = math.radians(arm['dir_deg'])
            ux, uy = math.cos(a), math.sin(a)
            reach, tip = arm['reach'] * s, arm['tip_z'] * s
            rise = tip - bz
            Q = [(0, bz), (0, bz + 0.45 * rise), (reach * 0.6, tip - 0.3 * rise), (reach, tip)]
            pts = [(0, 0, ph - 0.2)]
            for i in range(25):
                t = i / 24
                w = ((1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3)
                r_ = sum(c * q[0] for c, q in zip(w, Q))
                z_ = sum(c * q[1] for c, q in zip(w, Q))
                pts.append((r_ * ux, r_ * uy, z_))
            brass.append(_tube(pts, 0.26 * s))
            sh, sb = arm['shade_h'] * s, arm['shade_bottom_z'] * s
            rs = arm['shade_dia'] * s / 2
            cx, cy = reach * ux, reach * uy
            brass.append(_tube([(cx, cy, tip), (cx, cy, sb + sh * 0.72)], 0.2 * s))
            drum = m3d.Manifold.cylinder(sh, rs, rs * 0.96, 48) - m3d.Manifold.cylinder(
                sh + 1.0, rs - 0.24 * s, rs * 0.96 - 0.24 * s, 48).translate([0, 0, -0.5])
            shades.append(drum.translate([cx, cy, sb]))
            bulbs.append(m3d.Manifold.sphere(1.35 * s, 20).translate([cx, cy, sb + sh * 0.52]))
        return [('base', base), ('frame', union(brass)), ('shade', union(shades)), ('bulb', union(bulbs))]
    pts = [m3d.Manifold.cylinder(max(1.2, f['base_t'] * s), rb, rb, 48)]
    rp = f['pole_mm'] / 2
    ph, bz = f['pole_h'] * s, f['bundle_z'] * s
    pts.append(m3d.Manifold.cylinder(ph + 0.2, rp, rp, 24))
    rr, rd = f['rod_mm'] / 2, f['drop_mm'] / 2
    for arm in f['arms']:
        a = math.radians(arm['dir_deg'])
        ux, uy = math.cos(a), math.sin(a)
        reach, tip = arm['reach'] * s, arm['tip_z'] * s
        rise = tip - bz
        Q = [(0, bz), (0, bz + 0.45 * rise), (reach * 0.6, tip - 0.3 * rise), (reach, tip)]
        p_ = [(0, 0, ph - 0.2)]                                   # straight up out of the pole
        for i in range(25):
            t = i / 24
            w = ((1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3)
            r_ = sum(c * q[0] for c, q in zip(w, Q))
            z_ = sum(c * q[1] for c, q in zip(w, Q))
            p_.append((r_ * ux, r_ * uy, z_))
        pts.append(_tube(p_, rr))
        sh, sb = arm['shade_h'] * s, arm['shade_bottom_z'] * s
        rs = arm['shade_dia'] * s / 2
        pts.append(_tube([(reach * ux, reach * uy, tip), (reach * ux, reach * uy, sb + sh - 0.1)], rd))   # drop rod
        pts.append(m3d.Manifold.cylinder(sh, rs, rs, 48).translate([reach * ux, reach * uy, sb]))
    return union(pts)


def _parts(parts, out):
    """New builders return [(role, manifold)] when parts=True (the website colors each role), else one solid."""
    return out if parts else union([m for _, m in out])


def _ring(R, r, segs=48):
    """Torus around the z axis: major radius R, tube radius r."""
    return m3d.Manifold.revolve(m3d.CrossSection.circle(r, 16).translate([R, 0]), segs)


def _disc(r, h, segs=48):
    return m3d.Manifold.cylinder(h, r, r, segs)


def side_table(f, s, parts=False):
    """Round side table: top disc on a black frame (rim ring, three posts, floor ring)."""
    R, H, t = f['dia'] * s / 2, f['h'] * s, f['top_t'] * s
    top = _disc(R, t).translate([0, 0, H - t])
    rr, tube = R - 1.5 * s, 0.4 * s
    frame = [_ring(rr, tube).translate([0, 0, H - t - tube]), _ring(rr, tube).translate([0, 0, tube])]
    for a in (90, 210, 330):
        x, y = rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a))
        frame.append(_tube([(x, y, tube), (x, y, H - t - tube)], tube))
    out = [('top', top), ('frame', union(frame))]
    return _parts(parts, [(k, m.translate([R, R, 0])) for k, m in out])


def drop_leaf_table(f, s, folded=False, parts=False):
    """Round drop-leaf table on a gateleg base. Folded: a 10 in strip with both leaves hanging straight down."""
    R, H, t, cw = f['dia'] * s / 2, f['h'] * s, f['top_t'] * s, f['center_w'] * s / 2
    disc = m3d.CrossSection.circle(R, 64)
    strip = disc ^ m3d.CrossSection.square([2 * R, 2 * cw], center=True)
    tops = [strip.extrude(t).translate([0, 0, H - t])]
    if folded:
        for sgn in (1, -1):
            leaf = disc ^ m3d.CrossSection.square([2 * R, R - cw]).translate([-R, cw])     # segment beyond y = cw
            m = leaf.extrude(t)                                     # leaf lying flat at z 0..t, y from cw to R
            m = m.translate([0, -cw, 0]).rotate([-90, 0, 0]).translate([0, cw, H - t])       # hinge down
            tops.append(m if sgn == 1 else m.mirror([0, 1, 0]))
    else:
        tops.append(disc.extrude(t).translate([0, 0, H - t]))
    lw = 1.6 * s
    wood = []
    for x in (-R * 0.85, R * 0.85 - lw):                            # two end frames
        for y in (-cw + 0.2 * s, cw - 0.2 * s - lw):
            wood.append(cube(x, y, 2.0 * s, x + lw, y + lw, H - t + 0.05))
        wood.append(cube(x, -cw + 0.2 * s, H - t - 3 * s, x + lw, cw - 0.2 * s, H - t + 0.05))
        wood.append(cube(x, -cw + 0.2 * s, 5 * s, x + lw, cw - 0.2 * s, 6.5 * s))
        for y in (-cw + 0.2 * s + lw / 2, cw - 0.2 * s - lw / 2):     # casters
            wood.append(m3d.Manifold.sphere(1.0 * s, 16).translate([x + lw / 2, y, 1.0 * s]))
    wood.append(cube(-R * 0.85, -lw / 2, 5 * s, R * 0.85, lw / 2, 6.5 * s))      # stretcher
    if not folded:
        for sgn in (1, -1):                                         # gate legs swung out under the leaves
            y = sgn * R * 0.6
            wood.append(cube(-lw / 2, y - lw / 2, 0, lw / 2, y + lw / 2, H - t + 0.05))
            wood.append(cube(-lw / 2, min(0, y), H - t - 2 * s, lw / 2, max(0, y), H - t + 0.05))
    out = [('top', union(tops)), ('wood', union(wood))]
    b = union([m for _, m in out]).bounding_box()
    return _parts(parts, [(k, m.translate([-b[0], -b[1], 0])) for k, m in out])


def bar_cart(f, s, parts=False):
    """Gold bar cart: two glass shelves, corner posts, a U-shaped arc front and back, a ring wine rack, casters."""
    W, D, H, sz = f['w'] * s, f['d'] * s, f['h'] * s, f['shelf_z'] * s
    tr, ch = 0.45 * s, 3.0 * s
    glass = [cube(0, 0, H - 0.5 * s, W, D, H), cube(0.6 * s, 0.6 * s, sz, W - 0.6 * s, D - 0.6 * s, sz + 0.4 * s)]
    frame = []
    for x in (tr, W - tr):
        for y in (tr, D - tr):
            frame.append(_tube([(x, y, ch), (x, y, H - 0.5 * s)], tr))
    for z in (ch, H - 0.6 * s):                                     # rectangular rails
        frame.append(_tube([(tr, tr, z), (W - tr, tr, z), (W - tr, D - tr, z), (tr, D - tr, z), (tr, tr, z)], tr))
    Ra = W / 2 - tr
    zc = ch + Ra
    for y in (tr, D - tr):                                          # U arcs
        frame.append(_tube([(W / 2 + Ra * math.cos(a), y, zc + Ra * math.sin(a))
                            for a in np.linspace(math.pi, 2 * math.pi, 25)], tr * 0.8))
    for i, (x, z) in enumerate([(W / 2 + dx * 3.6 * s, ch + 4.5 * s + row * 3.4 * s)
                                for row in range(2) for dx in (-1, 0, 1)]):
        frame.append(_ring(1.7 * s, 0.18 * s, 24).rotate([90, 0, 0]).translate([x, D / 2, z]))
    casters = [m3d.Manifold.sphere(1.2 * s, 16).translate([x, y, 1.2 * s]) for x in (2 * s, W - 2 * s) for y in (2 * s, D - 2 * s)]
    casters += [_tube([(x, y, 1.2 * s), (x, y, ch)], 0.35 * s) for x in (2 * s, W - 2 * s) for y in (2 * s, D - 2 * s)]
    return _parts(parts, [('frame', union(frame)), ('glass', union(glass)), ('casters', union(casters))])


def shoe_cabinet(f, s, parts=False):
    """Shoe cabinet: white carcass, three tilt-out doors (shaker recessed panels), oak-look top, small gold knobs."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    top_t, plinth = 1.0 * s, 1.8 * s
    carcass = union([
        cube(0, 0.75 * s, plinth, W, D, H - top_t + 0.05),
        cube(0.35 * s, 1.2 * s, 0, W - 0.35 * s, D, plinth + 0.1),
    ])
    top = _rslab(-0.3 * s, -0.4 * s, H - top_t, W + 0.3 * s, D, H, 0.3 * s, rz=0.1 * s)
    doors, knobs, z = [], [], H - top_t - 0.2 * s
    st = 1.35 * s
    for h in f['doors']:
        z0 = max(plinth + 0.2 * s, z - h * s + 0.22 * s)
        slab = _rbox(0.45 * s, 0.2 * s, z0, W - 0.45 * s, 0.8 * s, z, 0.12 * s)
        rec = cube(0.45 * s + st, 0.15 * s, z0 + st, W - 0.45 * s - st, 0.45 * s, z - st)
        doors.append(slab - rec)
        zk = z - 2.3 * s
        for x in (5 * s, W - 5 * s):
            knobs.append(m3d.Manifold.cylinder(0.45 * s, 0.42 * s, 0.34 * s, 16).rotate([90, 0, 0]).translate([x, 0.25 * s, zk]))
        z -= h * s
    return _parts(parts, [('body', union([carcass] + doors)), ('top', top), ('knobs', union(knobs))])


def mirror_leaning(f, s, parts=False):
    """Floor mirror leaning back against a wall: frame + glass face, tilted `lean` degrees (front at y = 0)."""
    W, H, T = f['w'] * s, f['h'] * s, f['t'] * s
    b = min(1.25 * s, W / 6)
    frame = _rbox(0, 0.1 * s, 0, W, T, H, 0.28 * s)
    glass = cube(b, 0, b, W - b, 0.25 * s, H - b)
    a = f['lean']
    lift = T * math.sin(math.radians(a))
    out = [(k, m.rotate([-a, 0, 0]).translate([0, 0, lift])) for k, m in (('frame', frame), ('glass', glass))]
    return _parts(parts, out)


def bar_stool(f, s, parts=False):
    """Swivel bar stool: bucket seat with a wraparound back (lower at the arms), chrome column, disc base, foot ring."""
    W, D, SH = f['w'] * s, f['d'] * s, f['seat_h'] * s
    cx, cy = W / 2, D / 2
    ell = lambda h, rx, ry: m3d.Manifold.cylinder(h, 1, 1, 48).scale([rx, ry, 1])
    seat = ell(3.0 * s, W / 2, D / 2).translate([cx, cy, SH - 3.0 * s])
    shell = ell(f['back_h'] * s, W / 2, D / 2) - ell(f['back_h'] * s + 1, W / 2 - 1.6 * s, D / 2 - 1.6 * s).translate([0, 0, -0.5])
    shell = shell - cube(-W, -D, f['arm_h'] * s, W, 0, f['back_h'] * s + 1)          # lower in front (arms)
    shell = shell - cube(-W, -D, -1, W, -D * 0.25, f['arm_h'] * s + 1)                 # open front
    seat = union([seat, shell.translate([cx, cy, SH - 0.5 * s])])
    Rb = f['base_dia'] * s / 2
    chrome = [m3d.Manifold.cylinder(1.2 * s, Rb, Rb * 0.25, 48).translate([cx, cy, 0]),
              m3d.Manifold.cylinder(SH - 3.0 * s, 1.1 * s, 1.1 * s, 24).translate([cx, cy, 0]),
              _ring(7.0 * s, 0.35 * s).translate([cx, cy - 1.5 * s, f['foot_z'] * s]),
              _tube([(cx, cy - 1.5 * s + 7.0 * s, f['foot_z'] * s), (cx, cy, f['foot_z'] * s + 2 * s)], 0.35 * s)]
    return _parts(parts, [('seat', seat), ('chrome', union(chrome))])


def office_chair(f, s, parts=False):
    """Aeron-style task chair: 5-star base on casters, column, seat pan, tall reclined back, arms. Front at y = 0."""
    W, D, H, SH = f['w'] * s, f['d'] * s, f['h'] * s, f['seat_h'] * s
    cx, cy = W / 2, D / 2
    base_r = min(W, D) / 2 - 1.3 * s
    frame = []
    for i in range(5):
        a = math.radians(90 + 72 * i)
        x, y = cx + base_r * math.cos(a), cy + base_r * math.sin(a)
        frame.append(_tube([(cx, cy, 3.0 * s), (x, y, 2.5 * s)], 0.65 * s))
        frame.append(m3d.Manifold.cylinder(0.95 * s, 1.15 * s, 1.15 * s, 18).rotate([0, 90, 0]).translate([x - 0.47 * s, y, 1.15 * s]))
        frame.append(_tube([(x, y, 1.3 * s), (x, y, 2.5 * s)], 0.45 * s))
    frame.append(m3d.Manifold.cylinder(SH - 5 * s, 1.15 * s, 1.05 * s, 24).translate([cx, cy, 2.8 * s]))
    sw, sd = 19.8 * s, 18.5 * s
    seat_frame = _rslab(cx - sw / 2, cy - sd / 2 - 1 * s, SH - 2.3 * s, cx + sw / 2, cy + sd / 2 - 1 * s, SH - 0.8 * s, 2.8 * s, rz=0.35 * s)
    seat_well = _rslab(cx - sw / 2 + 1.2 * s, cy - sd / 2 - 0.1 * s, SH - 1.5 * s, cx + sw / 2 - 1.2 * s, cy + sd / 2 - 2.0 * s, SH + 0.5 * s, 2.0 * s)
    mesh = [_rslab(cx - sw / 2 + 1.1 * s, cy - sd / 2 - 0.2 * s, SH - 1.25 * s, cx + sw / 2 - 1.1 * s, cy + sd / 2 - 1.9 * s, SH - 0.15 * s, 2.0 * s, rz=0.2 * s)]
    bw, bh = 18.8 * s, H - SH - 1.0 * s
    back = _rbox(-bw / 2, 0, 0, bw / 2, 1.3 * s, bh, 2.4 * s)
    back_cut = _rbox(-bw / 2 + 1.35 * s, -0.4 * s, 1.35 * s, bw / 2 - 1.35 * s, 1.7 * s, bh - 1.35 * s, 1.6 * s)
    back_mesh = _rbox(-bw / 2 + 1.2 * s, 0.35 * s, 1.2 * s, bw / 2 - 1.2 * s, 0.95 * s, bh - 1.2 * s, 1.5 * s)
    lumbar = _rbox(-bw / 2 + 1.0 * s, 0.7 * s, bh * 0.26, bw / 2 - 1.0 * s, 1.45 * s, bh * 0.44, 0.35 * s)
    tilt = lambda m: m.rotate([-12, 0, 0]).translate([cx, cy + sd / 2 - 1.5 * s, SH + 0.5 * s])
    frame += [seat_frame - seat_well, tilt(union([back - back_cut, lumbar])),
              _tube([(cx, cy + sd / 2 - 3.5 * s, SH - 2 * s), (cx, cy + sd / 2 - 1.2 * s, SH + 1.2 * s)], 0.95 * s)]
    mesh.append(tilt(back_mesh))
    for sx in (-1, 1):                                              # arms: post + contoured pad
        x = cx + sx * (W / 2 - 1.5 * s)
        frame.append(_tube([(x, cy + 2.5 * s, SH - 1.8 * s), (x, cy + 1.2 * s, SH + 7.8 * s)], 0.58 * s))
        frame.append(_rbox(x - 1.65 * s, cy - 4.2 * s, SH + 7.5 * s, x + 1.65 * s, cy + 4.8 * s, SH + 8.6 * s, 0.5 * s))
    return _parts(parts, [('frame', union(frame)), ('mesh', union(mesh))])


def dog_crate(f, s, parts=False):
    """Wire dog crate: square-section wires on a grid, heavier edge frame, door outline + latch on the front (y = 0),
    folding handle on top, plastic tray in the base."""
    W, D, H, p = f['w'] * s, f['d'] * s, f['h'] * s, f['pitch'] * s
    w, e = 0.2 * s, 0.35 * s                                    # wire and edge-frame thickness
    bar = lambda x0, y0, z0, x1, y1, z1, t=w: cube(min(x0, x1) - t / 2, min(y0, y1) - t / 2, min(z0, z1) - t / 2,
                                                  max(x0, x1) + t / 2, max(y0, y1) + t / 2, max(z0, z1) + t / 2)
    lo, hi = e / 2, H - e / 2
    xs = np.arange(e / 2, W - e / 2 + 1e-6, (W - e) / round((W - e) / p))
    ys = np.arange(e / 2, D - e / 2 + 1e-6, (D - e) / round((D - e) / p))
    wires = []
    for x in xs:                                                # front, back, and top cross wires
        wires += [bar(x, e / 2, lo, x, e / 2, hi), bar(x, D - e / 2, lo, x, D - e / 2, hi), bar(x, e / 2, hi, x, D - e / 2, hi)]
    for y in ys:                                                # side wires
        wires += [bar(e / 2, y, lo, e / 2, y, hi), bar(W - e / 2, y, lo, W - e / 2, y, hi)]
    for z in np.linspace(lo, hi, 5)[1:-1]:                      # horizontal wires all round
        wires.append(bar(e / 2, e / 2, z, W - e / 2, e / 2, z))
        wires.append(bar(e / 2, D - e / 2, z, W - e / 2, D - e / 2, z))
        wires.append(bar(e / 2, e / 2, z, e / 2, D - e / 2, z))
        wires.append(bar(W - e / 2, e / 2, z, W - e / 2, D - e / 2, z))
    for y in (D / 3, 2 * D / 3):                                # top wires running front to back
        wires.append(bar(e / 2, y, hi, W - e / 2, y, hi))
    a0, ax, ay = e / 2, W - e / 2, D - e / 2
    for z in (lo, hi):                                          # heavier edge frame
        wires += [bar(a0, a0, z, ax, a0, z, e), bar(a0, ay, z, ax, ay, z, e),
                  bar(a0, a0, z, a0, ay, z, e), bar(ax, a0, z, ax, ay, z, e)]
    for x, y in ((e / 2, e / 2), (W - e / 2, e / 2), (e / 2, D - e / 2), (W - e / 2, D - e / 2)):
        wires.append(bar(x, y, lo, x, y, hi, e))
    dx0, dx1, dz1 = 2.0 * s, W - 2.0 * s, H - 3.0 * s           # door outline + latch on the front
    for (a, b_, c, d_) in ((dx0, lo + 1.5 * s, dx0, dz1), (dx1, lo + 1.5 * s, dx1, dz1),
                           (dx0, dz1, dx1, dz1), (dx0, lo + 1.5 * s, dx1, lo + 1.5 * s)):
        wires.append(bar(a, -0.05 * s, b_, c, -0.05 * s, d_, e))
    wires.append(cube(dx1 - 1.2 * s, -0.3 * s, H / 2 - 0.6 * s, dx1 + 0.3 * s, 0.1 * s, H / 2 + 0.6 * s))
    hx0, hx1 = W / 2 - 2.5 * s, W / 2 + 2.5 * s                 # handle, folded flat on top
    wires.append(bar(hx0, D / 2, hi - e / 2, hx1, D / 2, hi - e / 2, e))
    tray = cube(e, e, 0.3 * s, W - e, D - e, 1.6 * s)
    return _parts(parts, [('wire', union(wires)), ('tray', tray)])


def _wheel_stand(f, s, C, flip=False):
    """ROCKBROS-style folding floor stand (carbon steel) around the wheel whose axle is at C, wheel in the x-z plane:
    an H base (two rails along the wheel, a foot bar across each end), red wheel chocks, and two arms rising in a V
    from a center hinge whose rubber knobs pinch the tire from both sides. Base 21.5 x 15.75 in (54.5 x 40 cm, as
    listed; arms adjust 53.5-81.5 cm). flip mirrors it along x (the tall arm goes to the other side)."""
    cx, R = C[0], C[2]
    L, W = 21.5 * s, 15.75 * s
    g = f['tire'] * s / 2 + 0.75 * s                         # rails, arms and knobs sit this far off the wheel plane
    sx = -1 if flip else 1
    frame = [cube(cx + e * L / 2 - 0.8 * s, -W / 2, 0, cx + e * L / 2 + 0.8 * s, W / 2, 1.1 * s) for e in (-1, 1)]
    frame += [cube(cx - L / 2, y - 0.4 * s, 0.5 * s, cx + L / 2, y + 0.4 * s, 1.4 * s) for y in (-g, g)]
    frame.append(cube(cx - 1.6 * s, -g - 0.5 * s, 0.5 * s, cx + 1.6 * s, g + 0.5 * s, 3.2 * s))      # hinge block
    knobs = []
    rt = R - f['tire'] * s / 2                                # mid-tire radius
    for hx, ang in ((-1.0, 205), (1.0, 42)):                  # short arm low on one side, tall arm high on the other
        a = math.radians(ang)
        top = (cx + sx * rt * math.cos(a), R + rt * math.sin(a))
        for y in (-g, g):
            frame.append(_tube([(cx + sx * hx * s, y, 2.4 * s), (top[0], y, top[1])], 0.42 * s))
            knobs.append(m3d.Manifold.sphere(1.0 * s, 16).translate([top[0], y + math.copysign(0.45 * s, y), top[1]]))
    red = [cube(cx + e * 5.6 * s - 1.5 * s, -g - 0.3 * s, 0.9 * s, cx + e * 5.6 * s + 1.5 * s, g + 0.3 * s, 2.0 * s)
           for e in (-1, 1)]
    return [('stand', union(frame + knobs)), ('red', union(red))]


def fluted_nightstand(f, s, parts=False):
    """Open-front carcass: side panels and back run f['gallery'] above the top shelf (a low rim, with the charging
    strip on the back), a base kick below, and stacked drawers whose fronts carry vertical flutes and a short gold bar
    pull near the top edge. Front at y = 0."""
    W, D, H, n = f['w'] * s, f['d'] * s, f['h'] * s, f['drawers']
    t, base, shelf = 0.6 * s, 1.8 * s, 0.7 * s
    zt = H - f['gallery'] * s                                  # top of the shelf
    body = union([cube(0, 0.5 * s, 0, t, D, H), cube(W - t, 0.5 * s, 0, W, D, H), cube(t, D - t, 0, W - t, D, H),
                  cube(t, 0.5 * s, zt - shelf, W - t, D - t, zt), cube(t, 0.5 * s, 0, W - t, D - t, base)])
    strip = cube(W / 2 - 2.4 * s, D - t - 0.8 * s, zt + 0.6 * s, W / 2 + 2.4 * s, D - t, zt + 1.9 * s)
    gap = 0.25 * s
    dh = (zt - shelf - base - gap * (n + 1)) / n
    fronts, flutes, pulls = [], [], []
    for i in range(n):
        z0 = base + gap + i * (dh + gap)
        fronts.append(cube(t + 0.2 * s, 0.15 * s, z0, W - t - 0.2 * s, 0.5 * s, z0 + dh))
        x = t + 0.6 * s
        while x + 0.35 * s <= W - t - 0.6 * s:
            flutes.append(cube(x, 0, z0 + 0.3 * s, x + 0.35 * s, 0.15 * s, z0 + dh - 0.3 * s))
            x += 0.95 * s
        pulls.append(cube(W / 2 - 2.3 * s, -0.45 * s, z0 + dh - 1.6 * s, W / 2 + 2.3 * s, 0, z0 + dh - 1.15 * s))
    return _parts(parts, [('body', body), ('drawers', union(fronts)), ('flutes', union(flutes)), ('pulls', union(pulls)),
                          ('strip', strip)])


def bike(f, s, vertical=False, stand=None, parts=False):
    """Road bike, drop bars. Length along x, bars across y. vertical=True: hung by the front wheel on a wall hook,
    tires against the wall (back, y = max), bars sticking out into the room. stand='flat': rear wheel in a floor
    stand; stand='up': stood up on its rear wheel in that stand (turned 90 deg about the rear axle, so the stand
    stays put: front wheel on top, saddle and bars swing back). With parts=True a 'pivot' marker at the stand
    lets the website keep the stand in place when it switches between the two."""
    r = f['wheel_d'] * s / 2
    tire = f['tire'] * s
    wb = f['wheelbase'] * s
    R0, F0 = np.array([r, 0, r]), np.array([r + wb, 0, r])
    bb = R0 + np.array([16.5 * s, 0, -2.8 * s])
    st_top = bb + f['seat_tube'] * s * np.array([-math.cos(math.radians(73.5)), 0, math.sin(math.radians(73.5))])
    ht_top = bb + np.array([f['reach'] * s, 0, f['stack'] * s])
    ht_bot = ht_top + 5.5 * s * np.array([math.cos(math.radians(72)), 0, -math.sin(math.radians(72))])
    saddle = np.array([st_top[0] - 2.5 * s, 0, f['saddle_z'] * s])
    bar = ht_top + np.array([3.8 * s, 0, 1.2 * s])
    P = lambda v: tuple(float(c) for c in v)
    frame = [_tube([P(st_top), P(ht_top)], 0.6 * s), _tube([P(bb), P(ht_bot)], 0.8 * s), _tube([P(bb), P(st_top)], 0.6 * s),
             _tube([P(ht_bot), P(ht_top)], 0.75 * s), _tube([P(ht_bot), P(F0)], 0.45 * s)]
    for sy in (-1, 1):
        o = np.array([0, sy * 1.6 * s, 0])
        frame += [_tube([P(R0 + o), P(bb)], 0.35 * s), _tube([P(R0 + o), P(st_top)], 0.35 * s)]
    tires = [_ring(r - tire / 2, tire / 2, 64).rotate([90, 0, 0]).translate(P(c)) for c in (R0, F0)]
    tires += [_ring(r - tire - 0.3 * s, 0.25 * s, 48).rotate([90, 0, 0]).translate(P(c)) for c in (R0, F0)]   # rims
    bw = f['bars'] * s / 2
    kit = [_tube([P(st_top), P(saddle - np.array([-2.5 * s, 0, 0.8 * s]))], 0.45 * s),
           cube(saddle[0] - 5.5 * s, -2.7 * s, saddle[2] - 0.8 * s, saddle[0] + 4.5 * s, 2.7 * s, saddle[2]),
           _tube([P(ht_top), P(bar)], 0.5 * s),
           _tube([(bar[0], -bw, bar[2]), (bar[0], bw, bar[2])], 0.45 * s)]
    for sy in (-1, 1):
        y = sy * bw
        kit.append(_tube([(bar[0], y, bar[2]), (bar[0] + 3.5 * s, y, bar[2] - 2 * s), (bar[0] + 1.5 * s, y, bar[2] - 5 * s),
                          (bar[0] - 1.0 * s, y, bar[2] - 5 * s)], 0.45 * s))
    kit.append(_disc(3.8 * s, 0.4 * s).rotate([90, 0, 0]).translate(P(bb + np.array([0, 2.2 * s, 0]))))
    kit += [_tube([P(c + np.array([0, -1.8 * s, 0])), P(c + np.array([0, 1.8 * s, 0]))], 0.5 * s) for c in (R0, F0)]
    out = [('frame', union(frame)), ('tires', union(tires)), ('kit', union(kit))]
    if stand:
        C = [float(c) for c in R0]
        if stand == 'up':
            out = [(k, m.translate([-c for c in C]).rotate([0, -90, 0]).translate(C)) for k, m in out]
        out += _wheel_stand(f, s, C, flip=stand == 'up')
        if parts:
            out.append(('pivot', cube(C[0] - 0.1, -0.1, 0, C[0] + 0.1, 0.1, 0.2)))
    if vertical:                                                    # length -> up, bike height -> out from the wall
        Hb = max(m.bounding_box()[5] for _, m in out)
        M = np.array([[0, -1, 0, 0], [0, 0, -1, Hb], [1, 0, 0, 4 * s]], float)
        out = [(k, m.transform(M)) for k, m in out]
    b = union([m for _, m in out]).bounding_box()
    return _parts(parts, [(k, m.translate([-b[0], -b[1], -b[2] + (4 * s if vertical else 0)])) for k, m in out])


def _ell(c, r, segs=20):
    """Ellipsoid, center c, semi-axes r (inches; callers scale the result)."""
    return m3d.Manifold.sphere(1.0, segs).scale(list(r)).translate(list(c))


def _hull(*ms):
    return m3d.Manifold.batch_hull(list(ms))


def _dog_head(ear_tip, eyes=True):
    """Head in its own frame, inches: skull center at the origin, looking along +y, z up. Black with tan brows,
    cheeks and muzzle, brown eyes; long ears hang to ear_tip (x is mirrored for the other ear)."""
    out = {'fur': [_ell((0, 0, 0), (2.0, 2.3, 1.85)),
                   _hull(_ell((0, 1.6, -0.35), (1.35, 1.0, 1.2)), _ell((0, 3.9, -0.75), (0.78, 0.6, 0.72))),
                   _ell((0, 4.35, -0.6), (0.5, 0.38, 0.42))],                                  # nose
           'tan': [_hull(_ell((0, 1.7, -0.78), (1.42, 1.0, 1.0)), _ell((0, 3.75, -1.08), (0.8, 0.6, 0.55))),
                   _ell((0, 2.4, -1.45), (0.85, 1.5, 0.5))],                                   # muzzle, chin
           'eye': []}
    for sx in (-1, 1):
        out['tan'] += [_ell((sx * 0.8, 1.72, 0.85), (0.3, 0.22, 0.2), 12),                     # brows
                       _ell((sx * 1.3, 1.2, -0.8), (0.6, 0.8, 0.6), 12)]                       # cheeks
        if eyes:
            out['eye'].append(_ell((sx * 0.95, 1.95, 0.3), (0.33, 0.3, 0.33), 12))
        ex, ey, ez = ear_tip
        out['fur'].append(_hull(_ell((sx * 1.8, -0.2, 0.5), (0.45, 1.1, 0.7)),
                                _ell((sx * ex, ey, ez), (0.5, 1.45, 1.1))))
    return out


def dog(f, s, curled=False, parts=False):
    """Nala, a long-haired black-and-tan dachshund. Standing: head toward the front (y = 0), tail to the back.
    curled=True: asleep, curled into a ring with the tail wrapped around the outside, sized to sit in the donut bed.
    Built in inches at her estimated size, then stretched to f['length'] / f['shoulder']."""
    roles = {'fur': [], 'tan': [], 'eye': [], 'white': [], 'tag': []}

    def add_head(d, rot_z, at):
        for k, ms in d.items():
            roles[k] += [m.rotate([0, 0, rot_z]).translate(list(at)) for m in ms]

    if not curled:                                       # built looking along +y, turned to face y = 0 at the end
        roles['fur'] += [_hull(_ell((0, 5.0, 5.7), (2.9, 3.0, 2.75)), _ell((0, 0, 6.4), (3.0, 3.0, 2.6)),
                               _ell((0, -6.2, 6.7), (2.8, 2.8, 2.6))),                         # sausage body
                         _hull(_ell((0, 3.5, 4.3), (2.2, 2.0, 1.0)), _ell((0, -3.0, 4.6), (2.0, 2.5, 0.9))),  # belly fringe
                         _hull(_ell((0, 6.5, 7.6), (2.1, 1.8, 2.0)), _ell((0, 8.6, 10.0), (1.6, 1.3, 1.6)))]   # neck
        add_head(_dog_head((2.15, 0.2, -3.6)), 0, (0, 9.6, 11.0))
        for sx in (-1, 1):
            roles['fur'] += [_hull(_ell((sx * 1.8, 6.2, 5.0), (1.0, 1.2, 1.3)), _ell((sx * 1.6, 6.9, 1.6), (0.62, 0.62, 0.7))),
                             _hull(_ell((sx * 2.0, -6.0, 5.6), (1.3, 1.9, 2.0)), _ell((sx * 1.85, -7.4, 2.3), (0.62, 0.62, 0.7)))]
            roles['tan'] += [_hull(_ell((sx * 1.6, 6.9, 2.2), (0.66, 0.66, 0.6)), _ell((sx * 1.65, 7.2, 0.45), (0.72, 0.95, 0.45))),
                             _hull(_ell((sx * 1.85, -7.4, 2.4), (0.6, 0.6, 0.5)), _ell((sx * 1.8, -6.9, 0.45), (0.7, 1.0, 0.45))),
                             _ell((sx * 1.2, 7.55, 6.0), (0.55, 0.4, 0.65), 12)]               # chest marks
        roles['white'].append(_ell((0, 7.95, 5.2), (0.55, 0.28, 0.6), 12))
        roles['tag'].append(m3d.Manifold.cylinder(0.12, 0.45, 0.45, 24).rotate([90, 0, 0]).translate([0, 8.75, 7.3]))
        tail = [((0, -8.6, 8.0), 0.85), ((0, -10.8, 8.0), 0.7), ((0, -12.8, 7.2), 0.55), ((0, -14.2, 6.2), 0.4)]
        feather = [_hull(_ell((0, -10.5, 7.3), (0.35, 1.6, 0.9)), _ell((0, -13.2, 6.2), (0.3, 1.1, 0.7)))]
        turn = 180
    else:                                                # ring around the origin, rump at -70 deg, shoulders 145
        R = 3.8
        P = lambda r, a, z: (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), z)
        ring = [_ell(P(R, a, 2.5), (2.55, 2.55, 2.4)) for a in np.linspace(-70, 145, 10)]
        roles['fur'] += [_hull(ring[i], ring[i + 1]) for i in range(len(ring) - 1)]
        roles['fur'] += [_hull(_ell(P(R, 160, 3.0), (2.1, 2.1, 2.0)), _ell(P(4.2, 188, 2.6), (1.6, 1.6, 1.6))),   # neck
                         _ell(P(4.4, -40, 4.3), (1.9, 2.3, 1.3)),                              # upper thigh
                         _hull(_ell(P(5.0, 165, 1.1), (0.8, 0.8, 0.8)), _ell(P(6.0, 215, 0.7), (0.6, 0.6, 0.6)))]   # foreleg
        add_head(_dog_head((2.6, -0.4, -1.75), eyes=False), 205, P(4.3, 205, 2.3))      # asleep: eyes shut
        roles['tan'] += [_ell(P(6.3, 228, 0.45), (0.75, 0.75, 0.45), 12),                       # front paw
                         _ell(P(5.8, -32, 0.5), (0.8, 0.8, 0.5), 12)]                           # hind paw
        tail = [(P(4.2, -80, 3.0), 0.9), (P(5.9, -98, 1.9), 0.8), (P(6.9, -122, 1.3), 0.7),
                (P(7.1, -145, 1.0), 0.55), (P(6.9, -165, 0.8), 0.42)]
        feather = [_hull(_ell(P(6.4, -110, 1.1), (1.0, 1.0, 0.7)), _ell(P(7.3, -150, 0.7), (0.8, 0.8, 0.5)))]
        turn = 0
    roles['fur'] += [_hull(_ell(a, (ra,) * 3, 14), _ell(b, (rb,) * 3, 14)) for (a, ra), (b, rb) in zip(tail, tail[1:])]
    roles['fur'] += feather
    k = f['length'] / 29.0
    out = [(r, union(ms).rotate([0, 0, turn]).scale([k * s, k * s, f['shoulder'] / 9.0 * s]))
           for r, ms in roles.items() if ms]
    b = union([m for _, m in out]).bounding_box()
    return _parts(parts, [(r, m.translate([-b[0], -b[1], -b[2]])) for r, m in out])


def _warp_fuzz(m, amp, seed=7):
    """Jitter every vertex a little: smooth-shaded, it reads as plush."""
    rng = np.random.default_rng(seed)

    def f(v):
        v = np.array(v, float)
        return v + rng.uniform(-amp, amp, v.shape)
    return m.warp_batch(f)


def dog_bed(f, s, parts=False):
    """Round plush donut bed: a fat rim (oval section) around a low cushion the dog lies on (top = f['deck'])."""
    R, H = f['dia'] / 2, f['h']
    rx, rz = 2.7, H / 2
    rim = m3d.Manifold.revolve(m3d.CrossSection.circle(1.0, 28).scale([rx, rz]).translate([R - rx, rz]), 96)
    cushion = _disc(R - rx + 0.5, f['deck'], 72)
    out = [('plush', _warp_fuzz(rim, 0.09).scale([s, s, s])), ('cushion', cushion.scale([s, s, s]))]
    return _parts(parts, [(r, m.translate([R * s, R * s, 0])) for r, m in out])


BUILDERS = {
    'sofa': sofa, 'coffee-table': coffee_table, 'yellow-loveseat': accent_chair, 'floor-lamp': arc_lamp,
    'plant': plant, 'white-dresser': door_cabinet, 'standing-desk': standing_desk,
    'tv-stand': tv_stand, 'tv-55': tv,
    'dining-round-36': pedestal_table, 'dining-round-42': pedestal_table, 'dining-oval-42x60': pedestal_table,
    'dining-rect-30x48': leg_table, 'dining-rect-36x60': leg_table, 'dining-rect-36x78': leg_table,
    'dining-chair': dining_chair, 'rug-6x9': rug, 'rug-8x10': rug,
    'queen-bed': queen_bed, 'dresser-guest': dresser, 'dresser-main': dresser, 'nightstand': nightstand,
    'sofa-bed-folded': lambda f, s, parts=False: sofa_bed(f, s, opened=False, parts=parts),
    'sofa-bed-open': lambda f, s, parts=False: sofa_bed(f, s, opened=True, parts=parts),
    'side-table': side_table,
    'drop-leaf-open': lambda f, s, parts=False: drop_leaf_table(f, s, folded=False, parts=parts),
    'drop-leaf-folded': lambda f, s, parts=False: drop_leaf_table(f, s, folded=True, parts=parts),
    'bar-cart': bar_cart, 'shoe-cabinet': shoe_cabinet, 'mirror-65': mirror_leaning, 'mirror-77': mirror_leaning,
    'bar-stool': bar_stool, 'office-chair': office_chair,
    'bike-warroad': lambda f, s, parts=False: bike(f, s, stand='flat', parts=parts),
    'bike-avail': lambda f, s, parts=False: bike(f, s, stand='flat', parts=parts),
    'bike-warroad-up': lambda f, s, parts=False: bike(f, s, stand='up', parts=parts),
    'bike-avail-up': lambda f, s, parts=False: bike(f, s, stand='up', parts=parts),
    'dog-crate': dog_crate, 'nightstand-fluted': fluted_nightstand, 'dresser-16': dresser,
    'storklinta': dresser, 'dog': dog, 'dog-curled': lambda f, s, parts=False: dog(f, s, curled=True, parts=parts),
    'dog-bed': dog_bed,
    'bike-on-wall-hook': lambda f, s, parts=False: bike(f, s, vertical=True, parts=parts),
}
WEB_ONLY = {'side-table', 'drop-leaf-open', 'drop-leaf-folded', 'bar-cart', 'shoe-cabinet', 'mirror-65', 'mirror-77',
            'bar-stool', 'office-chair', 'bike-warroad', 'bike-avail', 'bike-on-wall-hook', 'dog-crate', 'dresser-16',
            'storklinta', 'dog', 'dog-curled', 'dog-bed', 'bike-warroad-up', 'bike-avail-up',
            'nightstand-fluted'}   # not on print plates yet


GROUPS = {   # which plate each piece goes on; COUNT = copies per plate
    'living': ['sofa', 'sofa-recline-zone', 'coffee-table', 'yellow-loveseat', 'standing-desk', 'plant',
               'white-dresser', 'tv-stand', 'tv-55', 'rug-6x9', 'rug-8x10'],
    'dining': ['dining-round-36', 'dining-round-42', 'dining-oval-42x60', 'dining-rect-30x48', 'dining-rect-36x60',
               'dining-rect-36x78', 'dining-chair'],
    'bedrooms': ['queen-bed', 'dresser-main', 'dresser-guest', 'nightstand', 'sofa-bed-folded', 'sofa-bed-open'],
}
COUNT = {'nightstand': 2, 'dining-chair': 6}
NEEDS_SUPPORTS = {'floor-lamp'}       # printed on its own, with supports
# Two-printer split, pinned to what was printed 2026-10-15 (first balanced by estimated time; plate 2's printer
# also runs the lamp). Plate 2 = everything else. Pinned so later model tweaks don't reshuffle printed plates.
PLATE_1 = ['queen-bed', 'sofa-bed-folded', 'dresser-main', 'dresser-guest', 'dining-rect-30x48', 'yellow-loveseat',
           'coffee-table', 'dining-oval-42x60', 'dining-chair', 'dining-chair', 'dining-chair', 'tv-stand', 'nightstand',
           'sofa-recline-zone', 'plant']
# Second round (2026-10-16): what broke (oval table, TV stand, plant) plus the lamp, on two printers. The lamp shares
# only with the 12.7 mm table, so its rods (from 15.7 mm up) print with no other piece on the plate. The sofa reprints
# on its own (sofa_1to60.stl) on a third printer.
REPRINT_PLATES = {'a-lamp-table': ['floor-lamp', 'dining-oval-42x60'],    # supports ON (lamp shades)
                  'b-plant-tv': ['plant', 'tv-stand']}
SOFT = {'sofa', 'sofa-bed-open', 'sofa-bed-folded', 'yellow-loveseat', 'sofa-recline-zone', 'rug-6x9', 'rug-8x10'}


def build_all(scale):
    s = 25.4 / scale
    src = {'sofa-bed-folded': 'sofa-bed', 'sofa-bed-open': 'sofa-bed', 'tv-55': 'tv-stand',
           'drop-leaf-open': 'drop-leaf-table', 'drop-leaf-folded': 'drop-leaf-table', 'bike-on-wall-hook': 'bike-warroad',
           'dog-curled': 'dog', 'bike-warroad-up': 'bike-warroad', 'bike-avail-up': 'bike-avail'}
    pieces = {k: BUILDERS[k](FURNITURE[src.get(k, k)], s) for k in BUILDERS}
    pieces['sofa-recline-zone'] = sofa_recline_zone(FURNITURE['sofa-recline-zone'], s, FURNITURE['sofa'])
    return pieces


def to_mesh(man):
    m = man.to_mesh()
    return trimesh.Trimesh(np.asarray(m.vert_properties)[:, :3], np.asarray(m.tri_verts), process=True)


def plate(items, width=170.0, gap=4.0):
    """Shelf-pack (name, manifold) items onto one build plate, as oriented for printing."""
    order = sorted(items, key=lambda kv: -(kv[1].bounding_box()[4] - kv[1].bounding_box()[1]))
    x = y = row_h = 0.0
    placed = []
    for k, m in order:
        b = m.bounding_box()
        w, d = b[3] - b[0], b[4] - b[1]
        if x > 0 and x + w > width:
            x, y, row_h = 0.0, y + row_h + gap, 0.0
        placed.append(m.translate([x - b[0], y - b[1], -b[2]]))
        x += w + gap
        row_h = max(row_h, d)
    return union(placed)


LAYER_H = 0.15                          # mm, the 0.15 STRUCTURAL profile the furniture is meant for
TIME_CAL = 0.94                         # this estimator ran ~6% long vs PrusaSlicer on the apartment model
SUPPORT_FACTOR = 1.3                    # rough allowance for the lamp's supports


def print_seconds(man, lh=LAYER_H, skin=0.6, infill=0.15, perims=2):
    """Rough slicer-style time for one piece (no heat-up, no layer changes: those are per plate). Same speeds
    as the apartment estimate in build.py: perimeters, solid skin within `skin` mm of a top/bottom, sparse infill."""
    import shapely
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    def layer(z):
        rings = [np.asarray(r) for r in man.slice(z).to_polygons()]
        if not rings:
            return Polygon()
        ccw = [Polygon(r).exterior.is_ccw for r in rings]
        g = unary_union([Polygon(r).buffer(0) for r, c in zip(rings, ccw) if c])
        holes = [Polygon(r).buffer(0) for r, c in zip(rings, ccw) if not c]
        return g.difference(unary_union(holes)) if holes else g

    sp, w = build.SPEED, build.EXT_W
    top, zs, z = man.bounding_box()[5], [0.1], 0.2
    while z + lh <= top + 1e-6:
        zs.append(z + lh / 2)
        z += lh
    total = 0.0
    for i, z in enumerate(zs):
        g = layer(z)
        if g.is_empty:
            continue
        L, A = g.boundary.length, g.area
        inner = max(A - perims * w * L, 0)
        if i == 0:
            t = (perims * L + inner / w) / sp['first']
        else:
            core = min(layer(z + skin).intersection(layer(z - skin)).buffer(-perims * w).area, inner)
            t = L / sp['ext'] + (perims - 1) * L / sp['per'] + (inner - core) / w / sp['solid'] \
                + core * infill / w / sp['sparse']
        total += t + (len(g.geoms) if hasattr(g, 'geoms') else 1) * build.ISLAND_S
    return total


def plate_hours(item_secs, tallest_mm, lh=LAYER_H):
    return TIME_CAL * (build.START_S + tallest_mm / lh * build.LAYER_S + sum(item_secs)) / 3600


def preview(pieces, names, s, path, title):
    meshes, x = [], 0.0
    for k in names:
        if k == 'tv-55':
            continue
        man = pieces[k]
        if k == 'tv-stand':
            man = union([man, tv_on_stand(FURNITURE['tv-stand'], s)])
        if k == 'coffee-table':                                  # printed upside down (built as a mirror)
            man = man.mirror([0, 0, 1]).translate([0, 0, FURNITURE[k]['h'] * s])
        elif k.startswith('dining-') and k != 'dining-chair':  # printed upside down: turn it over
            man = man.rotate([180, 0, 0]).translate([0, 0, FURNITURE[k]['h'] * s])
        b = man.bounding_box()
        kind = 'rug' if k.startswith('rug') or k == 'sofa-recline-zone' else 'furniture'
        meshes.append((to_mesh(man.translate([x - b[0], -b[1], 0])), kind))
        x += (b[3] - b[0]) + 6
    build.render_preview(meshes, path, title, azim=-30, elev=35, width=1800)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scale', type=float, default=60)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.stl'):
            os.remove(os.path.join(OUT, f))
    s = 25.4 / a.scale
    pieces = build_all(a.scale)
    tag = f'1to{a.scale:g}'
    for k, man in pieces.items():
        if k in WEB_ONLY:
            continue
        t = to_mesh(man)
        assert t.is_watertight, k
        t.export(os.path.join(OUT, f'{k}_{tag}.stl'))
        e = t.extents
        print(f'{k:20s} {e[0]:5.1f} x {e[1]:5.1f} x {e[2]:5.1f} mm' + ('   (needs supports)' if k in NEEDS_SUPPORTS else ''))
    every = [(k, pieces[k]) for names in GROUPS.values() for k in names for _ in range(COUNT.get(k, 1))]
    pl = to_mesh(plate(every, width=240))                      # everything support-free, one 250 x 210 bed
    assert pl.is_watertight
    pl.export(os.path.join(OUT, f'furniture-plate-all_{tag}.stl'))
    print(f'plate all: {pl.extents[0]:.1f} x {pl.extents[1]:.1f} mm')
    for g, names in GROUPS.items():
        items = [(k, pieces[k]) for k in names for _ in range(COUNT.get(k, 1))]
        pl = to_mesh(plate(items))
        assert pl.is_watertight
        pl.export(os.path.join(OUT, f'furniture-plate-{g}_{tag}.stl'))
        print(f'plate {g}: {pl.extents[0]:.1f} x {pl.extents[1]:.1f} mm')
        shown = names + (['floor-lamp'] if g == 'living' else [])
        preview(pieces, shown, s, os.path.join(OUT, f'furniture-preview-{g}.png'),
                f'{g.capitalize()} furniture at 1:{a.scale:g}')
    build.render_preview([(to_mesh(pieces['floor-lamp']), 'furniture')], os.path.join(OUT, 'furniture-preview-lamp.png'),
                         'Brightech Trilage at 1:60 (36 mm tall; supports under the shades)', azim=0, elev=10, width=1000)

    # two printers: two support-free plates, balanced so the second printer can also run the lamp afterwards
    secs = {k: print_seconds(pieces[k]) for k in {k for k, _ in every} | NEEDS_SUPPORTS}
    rest = list(every)
    first = []
    for k in PLATE_1:
        first.append(rest.pop(next(i for i, it in enumerate(rest) if it[0] == k)))
    plates = [first, rest]
    lines = [f'# Furniture print plan (1:{a.scale:g}, {LAYER_H} mm layers)', '',
             'Estimated with the same model as the apartment report, scaled to match PrusaSlicer on the apartment '
             '(it ran ~6% long). Your slicer is the real number.', '',
             '| Printer | Job | Pieces | Estimate |', '|---|---|---|---|']
    for i, items in enumerate(plates):
        pl = to_mesh(plate(items, width=240))
        assert pl.is_watertight
        name = f'furniture-plate-{i + 1}of2_{tag}.stl'
        pl.export(os.path.join(OUT, name))
        hrs = plate_hours([secs[k] for k, _ in items], pl.extents[2])
        counts = {}
        for k, _ in items:
            counts[k] = counts.get(k, 0) + 1
        listed = ', '.join(f'{k} x{c}' if c > 1 else k for k, c in counts.items())
        lines.append(f'| {i + 1} | `{name}` ({pl.extents[0]:.0f} x {pl.extents[1]:.0f} mm, no supports) | {listed} '
                     f'| {int(hrs)}h{round(hrs % 1 * 60):02d} |')
        print(f'plate {i + 1}of2: {pl.extents[0]:.1f} x {pl.extents[1]:.1f} mm, ~{hrs:.2f} h')
    for k in sorted(NEEDS_SUPPORTS):
        hrs = TIME_CAL * (build.START_S + SUPPORT_FACTOR * secs[k]) / 3600
        lines.append(f'| 2, after plate 2 | `{k}_{tag}.stl` (organic supports) | {k} | {int(hrs)}h{round(hrs % 1 * 60):02d} |')
        print(f'{k}: ~{hrs:.2f} h with supports')
    # three printers: plate 1 as above; plate 2 split by kind (one filament color each): upholstery + rugs vs the rest
    lines += ['', '## Three printers', '', 'Plate 1 as above. Plate 2 splits in two by kind, so each can be its own color.',
              'The lamp goes on whichever printer frees up first.', '',
              '| Printer | Job | Pieces | Estimate |', '|---|---|---|---|']
    for j, (label, items) in enumerate([('sofas-rugs', [it for it in plates[1] if it[0] in SOFT]),
                                         ('tables-chairs', [it for it in plates[1] if it[0] not in SOFT])]):
        pl = to_mesh(plate(items, width=240))
        assert pl.is_watertight
        name = f'furniture-plate-2{"ab"[j]}-{label}_{tag}.stl'
        pl.export(os.path.join(OUT, name))
        hrs = plate_hours([secs[k] for k, _ in items], pl.extents[2])
        counts = {}
        for k, _ in items:
            counts[k] = counts.get(k, 0) + 1
        listed = ', '.join(f'{k} x{c}' if c > 1 else k for k, c in counts.items())
        lines.append(f'| {j + 2} | `{name}` ({pl.extents[0]:.0f} x {pl.extents[1]:.0f} mm, no supports) | {listed} '
                     f'| {int(hrs)}h{round(hrs % 1 * 60):02d} |')
        print(f'plate 2{"ab"[j]}: {pl.extents[0]:.1f} x {pl.extents[1]:.1f} mm, ~{hrs:.2f} h')
    lines += ['', '## Reprints', '', '| Printer | Job | Pieces | Estimate |', '|---|---|---|---|']
    for j, (label, names) in enumerate(REPRINT_PLATES.items()):
        items = [(k, pieces[k]) for k in names]
        pl = to_mesh(plate(items, width=240))
        assert pl.is_watertight
        name = f'furniture-plate-reprints-{label}_{tag}.stl'
        pl.export(os.path.join(OUT, name))
        hrs = plate_hours([print_seconds(m) * (SUPPORT_FACTOR if k in NEEDS_SUPPORTS else 1) for k, m in items],
                          pl.extents[2])
        sup = 'supports on' if NEEDS_SUPPORTS & set(names) else 'no supports'
        lines.append(f'| {j + 1} | `{name}` ({pl.extents[0]:.0f} x {pl.extents[1]:.0f} mm, {sup}) | {", ".join(names)} '
                     f'| {int(hrs)}h{round(hrs % 1 * 60):02d} |')
        print(f'plate reprints-{label}: {pl.extents[0]:.1f} x {pl.extents[1]:.1f} mm, ~{hrs:.2f} h')
    one = plate_hours([secs[k] for k, _ in every], max(m.bounding_box()[5] for _, m in every))
    lines += ['', f'One printer instead: `furniture-plate-all_{tag}.stl`, about {int(one)}h{round(one % 1 * 60):02d}, '
              'then the lamp.', '']
    with open(os.path.join(OUT, 'print-plan.md'), 'w') as fh:
        fh.write('\n'.join(lines))


if __name__ == '__main__':
    main()
