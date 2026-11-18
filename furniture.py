"""Printable furniture for the A4 apartment model, at the same scale as the apartment (1:60 by default).

    python3 furniture.py              # -> output/furniture/*.stl, a one-plate STL, a preview sheet
    python3 furniture.py --scale 48

Dimensions are REAL inches. They come from a walkthrough video of the owner's current apartment (2026-11-18),
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

# Everything below was read off the owner's walkthrough video (2026-11-18): sizes are estimates unless noted.
FURNITURE = {
    # Living room
    'sectional': dict(w=100, d=38, chaise_w=33, chaise_d=64, h=33, seat_h=18, back_t=8, arm_w=6, arm_h=24, leg_h=4,
                      note='cream button-tufted sectional: chaise on the left as you face it, track arm and bolster '
                           'on the right, short wood legs (estimated)'),
    'coffee-table': dict(w=42, d=21, h=18.5, leg_h=5, top_t=1.2, lift_h=25, lift_fwd=8,
                         note='walnut lift-top coffee table with storage, on splayed legs; the top lifts to about '
                              '25 in and comes about 8 in forward (estimated)'),
    'tv-stand': dict(base_w=24, base_d=16, base_h=2.5, caster_h=2.0, pole_w=2.6, pole_d=1.8, pole_h=52, mount_z=44,
                     mount_off=3.0, tv_w=57.1, tv_h=32.7, tv_t=2.4,
                     note='65 in TV on a white rolling stand with a wood base; TV center about 44 in (estimated)'),
    'tier-shelf': dict(w=16, d=12, h=28, shelves=[3, 14.5, 27.4], post=1.0,
                       note='small 3-tier dark wood side shelf (estimated)'),
    'torchiere-lamp': dict(base_dia=11, base_t=1.2, h=70, pole_dia=0.9, shade_dia=15, shade_bot_dia=5, shade_h=6,
                           note='silver torchiere floor lamp with a white bowl shade (estimated)'),
    'rug-6x9': dict(w=108, d=72, label='6×9', note='light grey 6 x 9 ft rug (size estimated); printed 0.8 mm thick'),
    'plant-monstera': dict(pot_dia=10, pot_h=10, saucer_dia=11, stem_mm=1.5, leaf_t_mm=1.0,
                           leaves=[dict(dir=0, tilt=25, stem=16, len=12, w=10), dict(dir=70, tilt=35, stem=13, len=12, w=10),
                                   dict(dir=140, tilt=20, stem=18, len=13, w=11), dict(dir=210, tilt=40, stem=11, len=11, w=9),
                                   dict(dir=280, tilt=30, stem=15, len=12, w=10), dict(dir=325, tilt=12, stem=20, len=11, w=9)],
                           note='leafy plant (monstera-style) in a grey pot: about 36 in tall (estimated)'),
    'plant-zz': dict(pot_dia=8, pot_h=7, saucer_dia=9, stem_mm=1.2, leaf_t_mm=0.8,
                     leaves=[dict(dir=a, tilt=t, stem=4, len=17, w=3.5)
                             for a, t in ((0, 8), (45, 22), (95, 12), (140, 25), (185, 6), (230, 20), (275, 14), (320, 24))],
                     note='ZZ plant in a terracotta pot: about 28 in tall (estimated)'),
    # Office & kitchen
    'standing-desk': dict(w=55, d=28, h=29, top_t=1.0, leg_w=2.4, foot_d=24,
                          monitors=[dict(dx=-13.5, w=24, h=14), dict(dx=13.5, w=27, h=15.5)],
                          note='motorized standing desk, walnut-grey top on black T-legs, two monitors; modeled at '
                               'sitting height (29 in); 55 x 28 top estimated'),
    'office-chair': dict(w=27, d=26, h=42, seat_h=18, note='Herman Miller Aeron, size B assumed: about 27 W x 26 D, '
                                                           '41-45 in tall'),
    'counter-stool': dict(w=18, d=18, seat_h=25, back_h=8, foot_z=8,
                          note='white molded shell counter stool on splayed wood legs with a black footrest: 25 in '
                               'seat (standard counter height, estimated)'),
    # Entry & storage
    'coat-rack': dict(base=14, base_t=1.5, h=68, pole=1.75, hook_len=6,
                      hooks=[(40, 0), (40, 180), (50, 90), (50, 270), (58, 45), (58, 225), (64, 135), (64, 315)],
                      note='wood coat tree with eight pegs on a square base (estimated)'),
    'shoe-cabinet': dict(w=31.5, d=9.5, h=47, leg_h=4, doors=3,
                         note='slim walnut shoe cabinet, three tilt-out doors faced in cane, black metal legs '
                              '(estimated)'),
    'arched-mirror': dict(w=22, h=65, t=1.2, frame=0.8, lean=5,
                          note='arched full-length floor mirror with a thin dark frame, leaning on a wall: 22 x 65 '
                               'assumed (a common size); 5 deg lean, so the bottom sits about 6 in out'),
    'hall-cabinet': dict(w=31.5, d=15.7, h=31.5, r=3,
                         note='dark walnut 2-door cabinet with rounded corners and brass pulls (estimated)'),
    'bike-black': dict(wheelbase=39.6, wheel_d=27.2, tire=1.25, bars=16.5, seat_tube=21, stack=21.8, reach=15.2,
                       saddle_z=37.5, lift=30, note='black road bike, hung on the web plan and printable as a floor model: '
                                           'about 67 x 17 x 40 in (estimated from '
                                           'typical 54 cm geometry)'),
    'bike-red-wall': dict(wheelbase=39.2, wheel_d=27.0, tire=1.0, bars=16.0, seat_tube=21.5, stack=21.0, reach=15.0,
                          saddle_z=37.0, lift=30,
                          note='red road bike hung level on a wood wall rack, wheels about 30 in off the floor '
                               '(estimated)'),
    # Bedroom
    'queen-bed': dict(frame_w=61, frame_l=81, frame_h=14, mattress_w=60, mattress_l=80, mattress_t=10, throw_w=22,
                      note='queen mattress on a low platform frame (no headboard), white duvet, knit throw; mattress '
                           'top at 24 in (estimated)'),
    'nightstand': dict(w=19.7, d=15.7, h=24, drawers=2, shelf=7, shelf_top=True, leg_h=1.5,
                       note='walnut nightstand, open cubby on top over two drawers (estimated)'),
    'tripod-lamp': dict(h=60, spread=18, shade_dia=16, shade_h=11,
                        note='black tripod floor lamp with a cream drum shade (estimated)'),
}

GROOVE_W, GROOVE_D = 0.6, 0.5          # mm, engraved detail lines
MIN_POST = 1.6                          # mm, thinnest printable leg/pole
TALL_POST = 2.4                         # mm, legs/poles taller than ~10 mm: 1.6-2 mm ones snapped mid-print
LABEL_FONT = FontProperties(family='DejaVu Sans', weight='bold')
LABEL_D = 0.4                           # mm, depth of the engraved size labels (rugs)
RUG_LABEL_H = 6.0                       # mm, digit height
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


# Each builder works in model mm with x = width, y = depth (front face at y = 0), z = up.
def sectional(f, s, parts=False):
    """L-sectional: a sofa with a chaise on the left as you face it (x = 0) reaching forward to y = 0, a track arm
    with a round bolster on the right, tufted seats (web only), cushion seams, short wood legs. Back at y = max.
    The print stands on an inset plinth instead (the recess reads as the legs), so nothing floats."""
    W, H, sh = f['w'] * s, f['h'] * s, f['seat_h'] * s
    D, cw, cd = f['d'] * s, f['chaise_w'] * s, f['chaise_d'] * s
    bt, aw, ah, lh = f['back_t'] * s, f['arm_w'] * s, f['arm_h'] * s, f['leg_h'] * s
    y0 = cd - D                                                  # front of the sofa section
    body = union([cube(0, y0, lh, W - aw + 0.1, cd, sh), cube(0, 0, lh, cw, y0 + 0.1, sh),
                  cube(0, cd - bt, lh, W, cd, H), cube(W - aw, y0, lh, W, cd, ah)])
    if not parts:                                                # L-shaped plinth, inset 0.8 mm all round
        foot = m3d.CrossSection.square([W, D]).translate([0, y0]) + m3d.CrossSection.square([cw, cd])
        body = union([body, foot.offset(-0.8, m3d.JoinType.Miter).extrude(lh + 0.05)])
    cuts = []
    for x in (cw, cw + (W - aw - cw) / 2):                       # seat cushion seams
        cuts.append(cube(x - GROOVE_W / 2, y0 - 0.1, sh - GROOVE_D, x + GROOVE_W / 2, cd - bt, sh + 1))
    for i in (1, 2):                                             # three back cushions
        x = (W - aw) * i / 3
        cuts.append(cube(x - GROOVE_W / 2, cd - bt - 0.1, sh, x + GROOVE_W / 2, cd - bt + GROOVE_D, H + 1))
    if parts:                                                    # button tufts on the seats
        t, step = 0.8 * s, 7.5 * s
        for x in np.arange(step / 2, W - aw - step / 3, step):
            for y in np.arange(step / 2, cd - bt - step / 3, step):
                if y >= y0 + step / 3 or x <= cw - step / 3:
                    cuts.append(cube(x - t / 2, y - t / 2, sh - 0.3 * s, x + t / 2, y + t / 2, sh + 0.1))
    rb = 4 * s                                                   # bolster sunk a little into the arm, back and seat
    bolster = m3d.Manifold.cylinder(20 * s, rb, rb, 32).rotate([90, 0, 0]).translate([W - aw - rb + 0.3 * s, cd - bt + 0.1,
                                                                                       sh + rb - 0.3 * s])
    upholstery = union([body - union(cuts), bolster])
    if not parts:
        return upholstery
    lw, i = 1.4 * s, 1.0 * s
    legs = [cube(x, y, 0, x + lw, y + lw, lh + 0.05)
            for x, y in ((i, cd - i - lw), (W - i - lw, cd - i - lw), (W - i - lw, y0 + i), (i, i), (cw - i - lw, i))]
    return [('upholstery', upholstery), ('legs', union(legs))]


def lift_top_table(f, s, lifted=False, parts=False):
    """Lift-top coffee table: a storage box on four splayed legs. Closed, the top sits on the box; lifted, it rises on
    two hinge arms and comes forward (toward the sofa, y = 0), opening the storage well. The print (closed) stands on
    its whole base instead, with a recessed band for the legs, so nothing floats."""
    W, D, H, lh, t = f['w'] * s, f['d'] * s, f['h'] * s, f['leg_h'] * s, f['top_t'] * s
    box = cube(0, 0, lh if parts else 0.0, W, D, H - t + 0.05)
    zt, dy = (f['lift_h'] * s, f['lift_fwd'] * s) if lifted else (H, 0)
    top = [cube(0, -dy, zt - t, W, D - dy, zt)]
    if lifted:
        box = box - cube(1.0 * s, 1.0 * s, lh + 2.0 * s, W - 1.0 * s, D - 1.0 * s, H)      # the storage well
        for x in (0.9 * s, W - 1.5 * s):                         # against the well's side walls
            top.append(m3d.Manifold.batch_hull([cube(x, D * 0.55, H - t - 2 * s, x + 0.6 * s, D * 0.55 + 1.5 * s, H - t),
                                                cube(x, D * 0.55 - dy, zt - t - 0.5 * s, x + 0.6 * s, D * 0.55 - dy + 1.5 * s, zt - t + 0.05)]))
    if not parts:
        return union([box - union(_recessed_base(W, D, lh))] + top)
    lw, ins, out = 1.5 * s, 1.5 * s, 1.0 * s
    legs = []
    for sx in (0, 1):
        for sy in (0, 1):
            x = ins if not sx else W - ins - lw
            y = ins if not sy else D - ins - lw
            ox, oy = (-out if not sx else out), (-out if not sy else out)
            legs.append(m3d.Manifold.batch_hull([cube(x, y, lh - 0.2, x + lw, y + lw, lh + 0.05),
                                                 cube(x + ox, y + oy, 0, x + ox + lw * 0.7, y + oy + lw * 0.7, 0.2)]))
    return [('top', union(top)), ('body', union([box] + legs))]


def plant(f, s, parts=False):
    """Potted plant: a floor pot on a saucer, a clump of stems fanning out, a paddle leaf at the end of each. The
    leaves face outward and taper from the stem, so no edge leans more than ~40 deg from vertical: no supports."""
    rp, ph = f['pot_dia'] * s / 2, f['pot_h'] * s
    rs = f['saucer_dia'] * s / 2
    pot = [m3d.Manifold.cylinder(0.6, rs, rs, 48), m3d.Manifold.cylinder(ph, rp, rp, 48)]
    leaves = []
    th = f['leaf_t_mm']
    for lf in f['leaves']:
        phi, al = math.radians(lf['dir']), math.radians(lf['tilt'])
        ux, uy = math.cos(phi), math.sin(phi)
        a = np.array([math.sin(al) * ux, math.sin(al) * uy, math.cos(al)])     # stem/leaf axis
        t = np.array([-uy, ux, 0.0])                                            # across the leaf
        n = np.cross(t, a)                                                      # leaf faces outward
        p0 = np.array([0.3 * rp * ux, 0.3 * rp * uy, ph - 0.5])
        p1 = p0 + lf['stem'] * s * a
        leaves.append(_tube([p0, p1], f['stem_mm'] / 2))
        L, hw = lf['len'] * s, lf['w'] * s / 2
        us = np.linspace(0, L, 25)                                              # widest at 60%, pointed tips
        half = np.where(us < 0.6 * L, np.sin(np.pi / 2 * us / (0.6 * L)), np.cos(np.pi / 2 * (us - 0.6 * L) / (0.4 * L)))
        half = np.maximum(hw * half, 0.05)
        outline = np.array([(h, u) for u, h in zip(us, half)] + [(-h, u) for u, h in zip(us[::-1], half[::-1])])
        blade = m3d.CrossSection([outline], m3d.FillRule.NonZero).extrude(th).translate([0, 0, -th / 2])
        origin = p1 - 0.3 * a
        leaves.append(blade.transform(np.column_stack([t, a, n, origin])))
    out = [('pot', union(pot)), ('leaf', union(leaves))]
    return _parts(parts, [(k, m.translate([rs, rs, 0])) for k, m in out])


def standing_desk(f, s, parts=False):
    """Standing desk at sitting height: top on two T-legs (foot along the depth, column, bracket under the top) and a
    crossbar. With parts=True the monitors (f['monitors']) stand on it too; the print model leaves them off."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    t, lw, fd = f['top_t'] * s, max(MIN_POST, f['leg_w'] * s), f['foot_d'] * s
    frame = []
    for x in (4 * s, W - 4 * s - lw):
        frame += [cube(x, D / 2 - fd / 2, 0, x + lw, D / 2 + fd / 2, 1.2 * s),
                  cube(x, D / 2 - lw * 0.8, 0, x + lw, D / 2 + lw * 0.8, H - t + 0.05),
                  cube(x, 2 * s, H - t - 1.5 * s, x + lw, D - 2 * s, H - t + 0.05)]
    frame.append(cube(4 * s, D / 2 - 0.6 * s, H - t - 2.0 * s, W - 4 * s, D / 2 + 0.6 * s, H - t + 0.05))
    out = [('top', cube(0, 0, H - t, W, D, H)), ('frame', union(frame))]
    if parts and f.get('monitors'):
        screens, by = [], D - 7 * s
        for m in f['monitors']:
            cx, w, h = W / 2 + m['dx'] * s, m['w'] * s, m['h'] * s
            screens += [cube(cx - 4 * s, by - 3 * s, H - 0.01, cx + 4 * s, by + 3 * s, H + 0.6 * s),
                        cube(cx - 0.8 * s, by + 1.0 * s, H, cx + 0.8 * s, by + 2.2 * s, H + 6 * s),
                        cube(cx - w / 2, by, H + 4.5 * s, cx + w / 2, by + 1.0 * s, H + 4.5 * s + h)]
        out.append(('screens', union(screens)))
    return _parts(parts, out)


def tv_stand(f, s, parts=False):
    """Rolling TV stand: base plate on 4 casters (shown as a recessed band so it prints solid), one pole, and a mount
    block with a 45-degree underside (no supports). For printing, the TV is a separate flat slab (`tv`) glued onto
    the mount block's front face; with parts=True the TV comes on the stand. Front (TV side) at y = 0."""
    W, D = f['base_w'] * s, f['base_d'] * s
    bh, ch = f['base_h'] * s, f['caster_h'] * s
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
    stand = union([pole, collar, m3d.Manifold.batch_hull([lower, upper])])
    if not parts:
        return union([base, stand])
    return [('base', base), ('stand', stand), ('tv', tv_on_stand(f, s))]


def queen_bed(f, s, parts=False):
    """Platform bed: frame (wrapped in its skirt), mattress under a duvet, two pillows across the head, a knit throw
    over the foot hanging down both sides, optional headboard (headboard_h). Foot at y = 0, head at the back."""
    W, L = f['frame_w'] * s, f['frame_l'] * s
    fh, mt = f['frame_h'] * s, f['mattress_t'] * s
    mw, ml = f['mattress_w'] * s, f['mattress_l'] * s
    hb_h, hb_t = f.get('headboard_h', 0) * s, f.get('headboard_t', 0) * s
    mx0, my1 = (W - mw) / 2, L - hb_t - 0.5 * s
    my0, top = my1 - ml, fh + mt
    frame = [cube(0, 0, 0, W, L - hb_t, fh)]
    if hb_h:
        frame.append(cube(0, L - hb_t, 0, W, L, hb_h))
    bedding = cube(mx0, my0, fh - 0.1, mx0 + mw, my1, top)
    pw, pd, ph = 26 * s, 18 * s, 5 * s
    gap = (mw - 2 * pw) / 3
    pillows = [cube(mx0 + gap + i * (pw + gap), my1 - 2 * s - pd, top - 0.1, mx0 + gap + i * (pw + gap) + pw, my1 - 2 * s,
                    top + ph) for i in range(2)]
    ty0, ty1, tt = my0 + 4 * s, my0 + 4 * s + f['throw_w'] * s, 0.8 * s
    throw = [cube(mx0 - tt, ty0, top - 0.1, mx0 + mw + tt, ty1, top + tt),
             cube(mx0 - tt, ty0, top - 7 * s, mx0 + 0.05, ty1, top + tt),
             cube(mx0 + mw - 0.05, ty0, top - 7 * s, mx0 + mw + tt, ty1, top + tt)]
    fr = union(frame)
    if f.get('leg_h'):
        fr = fr - union(_recessed_base(W, L - hb_t, f['leg_h'] * s, sides='FLR'))
    return _parts(parts, [('frame', fr), ('bedding', bedding), ('pillows', union(pillows)), ('throw', union(throw))])


def shell_stool(f, s, parts=False):
    """Counter stool: a molded shell seat whose low back wraps round the sides, on four splayed wood legs with a
    square black footrest. Front at y = 0."""
    W, D, SH = f['w'] * s, f['d'] * s, f['seat_h'] * s
    cx, cy, st, bh = W / 2, D / 2, 1.5 * s, f['back_h'] * s
    ell = lambda h, rx, ry: m3d.Manifold.cylinder(h, 1, 1, 48).scale([rx, ry, 1])
    seat = ell(st, W / 2, D / 2).translate([cx, cy, SH - st])
    wall = ell(bh, W / 2, D / 2) - ell(bh + 1, W / 2 - 0.8 * s, D / 2 - 0.8 * s).translate([0, 0, -0.5])
    wall = (wall - cube(-W, -D, -1, W, -D * 0.05, bh + 1)).translate([cx, cy, SH - 0.2 * s])
    top_z, legs, ring = SH - st + 0.1, [], []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        p0 = np.array([cx + sx * 0.3 * W, cy + sy * 0.3 * D, top_z])
        p1 = np.array([cx + sx * 0.46 * W, cy + sy * 0.46 * D, 0.6 * s])
        legs.append(_tube([p0, p1], 0.6 * s))
        ring.append(p1 + (p0 - p1) * (f['foot_z'] * s - p1[2]) / (p0[2] - p1[2]))
    foot = _tube([tuple(p) for p in ring + ring[:1]], 0.35 * s)
    return _parts(parts, [('shell', union([seat, wall])), ('wood', union(legs)), ('metal', foot)])


def coat_rack(f, s):
    """Coat tree: square base, round pole, pegs angled upward round the pole."""
    B, H, rp, L = f['base'] * s, f['h'] * s, f['pole'] * s / 2, f['hook_len'] * s
    parts = [cube(0, 0, 0, B, B, f['base_t'] * s), m3d.Manifold.cylinder(H, rp, rp, 24).translate([B / 2, B / 2, 0])]
    for z, a in f['hooks']:
        ux, uy = math.cos(math.radians(a)), math.sin(math.radians(a))
        parts.append(_tube([(B / 2, B / 2, z * s), (B / 2 + ux * L * 0.87, B / 2 + uy * L * 0.87, z * s + L * 0.5)], 0.45 * s))
    return union(parts)


def cane_shoe_cabinet(f, s, parts=False):
    """Slim shoe cabinet: wood case, three stacked tilt-out doors faced in cane, on four black metal legs. The print
    stands on its whole base instead, with a recessed band for the legs, so nothing floats."""
    W, D, H, lh, n = f['w'] * s, f['d'] * s, f['h'] * s, f['leg_h'] * s, f['doors']
    t, gap, zb = 0.75 * s, 0.2 * s, lh if parts else 0.0
    case = [cube(0, 0.6 * s, zb, W, D, H), cube(0, 0, zb, t, 0.65 * s, H), cube(W - t, 0, zb, W, 0.65 * s, H),
            cube(0, 0, H - t, W, 0.65 * s, H), cube(0, 0, zb, W, 0.65 * s, lh + t)]
    dh = (H - lh - 2 * t - gap * (n + 1)) / n
    cane = []
    for i in range(n):
        z0 = lh + t + gap + i * (dh + gap)
        case.append(cube(t + gap, 0.1 * s, z0, W - t - gap, 0.65 * s, z0 + dh))
        cane.append(cube(t + 1.6 * s, 0, z0 + 1.4 * s, W - t - 1.6 * s, 0.15 * s, z0 + dh - 1.4 * s))
    if not parts:
        return union(case + cane) - union(_recessed_base(W, D, lh))
    lw = 0.8 * s
    legs = [cube(x, y, 0, x + lw, y + lw, lh + 0.05) for x in (0.4 * s, W - 0.4 * s - lw) for y in (0.6 * s, D - 0.4 * s - lw)]
    return [('wood', union(case)), ('cane', union(cane)), ('metal', union(legs))]


def _arch(w, h, segs=48):
    """Outline of an arch-topped panel w wide and h tall (x across, y up), bottom-left corner at the origin."""
    r = w / 2
    return m3d.CrossSection.square([w, h - r]) + m3d.CrossSection.circle(r, segs).translate([r, h - r])


def arched_mirror(f, s, parts=False):
    """Arch-topped floor mirror leaning back against a wall: thin frame + glass face, tilted `lean` degrees
    (front at y = 0)."""
    W, H, T, b = f['w'] * s, f['h'] * s, f['t'] * s, f['frame'] * s

    def slab(cs, y0, y1):                                      # outline in x-z, y0..y1 thick
        return cs.extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0])
    frame = slab(_arch(W, H), 0.1 * s, T)
    glass = slab(_arch(W - 2 * b, H - 2 * b).translate([b, b]), 0, 0.15 * s)
    a = f['lean']
    lift = T * math.sin(math.radians(a))
    return _parts(parts, [(k, m.rotate([-a, 0, 0]).translate([0, 0, lift])) for k, m in (('frame', frame), ('glass', glass))])


def round_cabinet(f, s, parts=False):
    """Two-door cabinet with rounded vertical corners: door seam, a reveal under the top and above the plinth, and
    two short brass bar pulls. Front at y = 0."""
    W, D, H, r = f['w'] * s, f['d'] * s, f['h'] * s, f['r'] * s
    body = m3d.CrossSection.square([W - 2 * r, D - 2 * r]).translate([r, r]).offset(r, m3d.JoinType.Round,
                                                                                     circular_segments=48).extrude(H)
    zb, zt = 1.5 * s, H - 1.0 * s
    cuts = [cube(r, -0.1, z - GROOVE_W / 2, W - r, GROOVE_D, z + GROOVE_W / 2) for z in (zb, zt)]
    cuts.append(cube(W / 2 - GROOVE_W / 2, -0.1, zb, W / 2 + GROOVE_W / 2, GROOVE_D, zt))
    pulls = [cube(x - 0.25 * s, -0.6 * s, H * 0.55, x + 0.25 * s, 0.1 * s, H * 0.75) for x in (W / 2 - 1.5 * s, W / 2 + 1.5 * s)]
    return _parts(parts, [('wood', body - union(cuts)), ('pulls', union(pulls))])


def tier_shelf(f, s):
    """Open shelf: four corner posts and three shelves."""
    W, D, H, p = f['w'] * s, f['d'] * s, f['h'] * s, max(MIN_POST, f['post'] * s)
    parts = [cube(x, y, 0, x + p, y + p, H) for x in (0, W - p) for y in (0, D - p)]
    parts += [cube(0, 0, z * s - 0.6 * s, W, D, z * s) for z in f['shelves']]
    return union(parts)


def torchiere(f, s, parts=False):
    """Torchiere: base disc, thin pole, an open bowl shade on top."""
    rb, H, sh = f['base_dia'] * s / 2, f['h'] * s, f['shade_h'] * s
    rp = max(MIN_POST / 2, f['pole_dia'] * s / 2)
    r0, r1, w = f['shade_bot_dia'] * s / 2, f['shade_dia'] * s / 2, 0.3 * s
    metal = union([_disc(rb, f['base_t'] * s), m3d.Manifold.cylinder(H - sh + 0.1, rp, rp, 24)])
    shade = (m3d.Manifold.cylinder(sh, r0, r1, 48) - m3d.Manifold.cylinder(sh, r0 - w, r1 - w, 48).translate([0, 0, 0.4 * s]))
    return _parts(parts, [('metal', metal), ('shade', shade.translate([0, 0, H - sh]))])


def tripod_lamp(f, s, parts=False):
    """Tripod floor lamp: three splayed legs meeting under an open drum shade."""
    H, sp = f['h'] * s, f['spread'] * s / 2
    rd, hd, r = f['shade_dia'] * s / 2, f['shade_h'] * s, 0.4 * s
    apex = H - hd * 0.75
    legs = [_tube([(sp * math.cos(math.radians(a)), sp * math.sin(math.radians(a)), r), (0, 0, apex)], r)
            for a in (90, 210, 330)]
    shade = _disc(rd, hd).translate([0, 0, H - hd]) - _disc(rd - 0.25 * s, hd + 1).translate([0, 0, H - hd - 0.5])
    return _parts(parts, [('legs', union(legs)), ('shade', shade)])


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


def rug(f, s):
    W, D = f['w'] * s, f['d'] * s
    label = _label(f['label'], RUG_LABEL_H).extrude(LABEL_D + 0.1).translate([W / 2, D / 2, RUG_T - LABEL_D])
    return cube(0, 0, 0, W, D, RUG_T) - label


def _label(text, cap_h, mirror=False):
    """Outline of `text` as a CrossSection centered on the origin, digits cap_h mm tall. mirror=True flips it
    front-to-back, for a face printed against the bed: it reads right once the piece is turned over."""
    k = cap_h / TextPath((0, 0), '0', size=1, prop=LABEL_FONT).get_extents().height
    polys = [p * [k, -k if mirror else k] for p in TextPath((0, 0), text, size=1, prop=LABEL_FONT).to_polygons()]
    lo, hi = np.min([p.min(axis=0) for p in polys], axis=0), np.max([p.max(axis=0) for p in polys], axis=0)
    return m3d.CrossSection([p - (lo + hi) / 2 for p in polys], m3d.FillRule.NonZero)


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


def nightstand(f, s):
    """Small bedside table: optional drawer(s), optional open shelf, optional legs."""
    W, D, H = f['w'] * s, f['d'] * s, f['h'] * s
    legs = f.get('leg_h', 0) * s
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


def _tube(points, r):
    """Round tube through 3D points (mm), as a union of capsules."""
    sph = [m3d.Manifold.sphere(r, 16).translate(list(p)) for p in points]
    return union([m3d.Manifold.batch_hull([sph[i], sph[i + 1]]) for i in range(len(sph) - 1)])


def _parts(parts, out):
    """New builders return [(role, manifold)] when parts=True (the website colors each role), else one solid."""
    return out if parts else union([m for _, m in out])


def _ring(R, r, segs=48):
    """Torus around the z axis: major radius R, tube radius r."""
    return m3d.Manifold.revolve(m3d.CrossSection.circle(r, 16).translate([R, 0]), segs)


def _disc(r, h, segs=48):
    return m3d.Manifold.cylinder(h, r, r, segs)


def office_chair(f, s, parts=False):
    """Aeron-style task chair: 5-star base on casters, column, seat pan, tall reclined back, arms. Front at y = 0."""
    W, D, H, SH = f['w'] * s, f['d'] * s, f['h'] * s, f['seat_h'] * s
    cx, cy = W / 2, D / 2
    base_r = min(W, D) / 2 - 1.3 * s
    frame = []
    for i in range(5):
        a = math.radians(90 + 72 * i)
        x, y = cx + base_r * math.cos(a), cy + base_r * math.sin(a)
        frame.append(_tube([(cx, cy, 3.0 * s), (x, y, 2.6 * s)], 0.7 * s))
        frame.append(m3d.Manifold.sphere(1.3 * s, 16).translate([x, y, 1.3 * s]))
    frame.append(m3d.Manifold.cylinder(SH - 5 * s, 1.2 * s, 1.2 * s, 24).translate([cx, cy, 3.0 * s]))
    sw, sd = 19.5 * s, 18.5 * s
    seat_frame = cube(cx - sw / 2, cy - sd / 2 - 1 * s, SH - 2.5 * s, cx + sw / 2, cy + sd / 2 - 1 * s, SH - 1.0 * s)
    mesh = [cube(cx - sw / 2 + 0.8 * s, cy - sd / 2 - 0.2 * s, SH - 1.2 * s, cx + sw / 2 - 0.8 * s, cy + sd / 2 - 1.8 * s, SH)]
    bw, bh = 18.5 * s, H - SH - 1.0 * s
    back = cube(-bw / 2, 0, 0, bw / 2, 1.2 * s, bh)
    back_mesh = cube(-bw / 2 + 1.2 * s, -0.2 * s, 1.2 * s, bw / 2 - 1.2 * s, 1.0 * s, bh - 1.2 * s)
    tilt = lambda m: m.rotate([-12, 0, 0]).translate([cx, cy + sd / 2 - 1.5 * s, SH + 0.5 * s])
    frame += [seat_frame, tilt(back - back_mesh), _tube([(cx, cy + sd / 2 - 3 * s, SH - 2 * s), (cx, cy + sd / 2 - 1 * s, SH + 1 * s)], 0.9 * s)]
    mesh.append(tilt(back_mesh))
    for sx in (-1, 1):                                              # arms: post + pad
        x = cx + sx * (W / 2 - 1.5 * s)
        frame.append(_tube([(x, cy + 3 * s, SH - 2 * s), (x, cy + 1 * s, SH + 8 * s)], 0.6 * s))
        frame.append(cube(x - 1.6 * s, cy - 4 * s, SH + 7.5 * s, x + 1.6 * s, cy + 5 * s, SH + 8.6 * s))
    return _parts(parts, [('frame', union(frame)), ('mesh', union(mesh))])


def bike(f, s, wall_rack=False, parts=False):
    """Road bike, drop bars. Length along x, bars across y. wall_rack=True: hung level on a wood wall rack (top tube
    resting in it), lifted f['lift'] off the floor, the rack against the wall behind (back, y = max)."""
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
    if wall_rack:
        mx = (st_top[0] + ht_top[0]) / 2
        z = (st_top[2] + ht_top[2]) / 2 - 0.6 * s                  # under the top tube, at mid length
        rack = [cube(mx - 5 * s, -2.5 * s, z - 3 * s, mx + 5 * s, bw + 1.0 * s, z),          # shelf to the wall
                cube(mx - 5 * s, -2.5 * s, z - 3 * s, mx + 5 * s, -1.6 * s, z + 1.5 * s),     # front lip
                cube(mx - 6 * s, bw + 0.2 * s, z - 8 * s, mx + 6 * s, bw + 1.0 * s, z + 2 * s)]  # wall plate
        out.append(('rack', union(rack)))
    b = union([m for _, m in out]).bounding_box()
    lift = f['lift'] * s if wall_rack else 0.0
    return _parts(parts, [(k, m.translate([-b[0], -b[1], lift - b[2]])) for k, m in out])


BUILDERS = {
    'sectional': sectional, 'coffee-table': lift_top_table,
    'coffee-table-open': lambda f, s, parts=False: lift_top_table(f, s, lifted=True, parts=parts),
    'tv-stand': tv_stand, 'tv-65': tv, 'tier-shelf': tier_shelf, 'torchiere-lamp': torchiere, 'rug-6x9': rug,
    'plant-monstera': plant, 'plant-zz': plant,
    'standing-desk': standing_desk, 'office-chair': office_chair, 'counter-stool': shell_stool,
    'coat-rack': coat_rack, 'shoe-cabinet': cane_shoe_cabinet, 'arched-mirror': arched_mirror,
    'hall-cabinet': round_cabinet,
    'bike-black': lambda f, s, parts=False: bike(f, s, wall_rack=parts, parts=parts),
    'bike-red-wall': lambda f, s, parts=False: bike(f, s, wall_rack=True, parts=parts),
    'queen-bed': queen_bed, 'nightstand': nightstand, 'tripod-lamp': tripod_lamp,
}
SRC = {'tv-65': 'tv-stand', 'coffee-table-open': 'coffee-table'}    # pieces built from another piece's sizes


def _pot(f):
    return [(0, f['saucer_dia'], 0, f['saucer_dia'])]


# Floor footprints for collisions where the bounding box is wrong: (x0, x1, y0, y1) rects in real inches, on the
# builder's axes (x from the left, y from the front). An L-shaped piece lists one rect per leg; a plant's leaves
# spread over other pieces, so only its pot counts.
FOOTPRINTS = {
    'sectional': lambda f: [(0, f['w'], f['chaise_d'] - f['d'], f['chaise_d']),        # seat run
                            (0, f['chaise_w'], 0, f['chaise_d'] - f['d'])],             # chaise, reaching forward
    'plant-monstera': _pot, 'plant-zz': _pot,
}
WEB_ONLY = {'coffee-table-open', 'tier-shelf', 'torchiere-lamp', 'plant-monstera', 'plant-zz', 'office-chair',
            'counter-stool', 'coat-rack', 'arched-mirror', 'bike-black', 'bike-red-wall', 'tripod-lamp'}   # not printed


GROUPS = {   # which plate each piece goes on; COUNT = copies per plate
    'living': ['sectional', 'coffee-table', 'tv-stand', 'tv-65', 'standing-desk', 'rug-6x9'],
    'bedroom-entry': ['queen-bed', 'nightstand', 'shoe-cabinet', 'hall-cabinet'],
}
COUNT = {'nightstand': 2}


def build_all(scale):
    s = 25.4 / scale
    return {k: BUILDERS[k](FURNITURE[SRC.get(k, k)], s) for k in BUILDERS}


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


def print_seconds(man, lh=LAYER_H, skin=0.6, infill=0.15, perims=2):
    """Rough slicer-style time for one piece (no heat-up, no layer changes: those are per plate). Same speeds
    as the apartment estimate in build.py: perimeters, solid skin within `skin` mm of a top/bottom, sparse infill."""
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
        if k == 'tv-65':
            continue
        man = pieces[k]
        if k == 'tv-stand':
            man = union([man, tv_on_stand(FURNITURE['tv-stand'], s)])
        b = man.bounding_box()
        kind = 'rug' if k.startswith('rug') else 'furniture'
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
        print(f'{k:20s} {e[0]:5.1f} x {e[1]:5.1f} x {e[2]:5.1f} mm')
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
        preview(pieces, names, s, os.path.join(OUT, f'furniture-preview-{g}.png'),
                f'{g.capitalize()} furniture at 1:{a.scale:g}')

    # two printers: longest piece first, each onto whichever plate has less estimated time so far
    secs = {k: print_seconds(pieces[k]) for k in {k for k, _ in every}}
    plates, busy = [[], []], [0.0, 0.0]
    for k, m in sorted(every, key=lambda it: -secs[it[0]]):
        i = busy.index(min(busy))
        plates[i].append((k, m))
        busy[i] += secs[k]
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
    one = plate_hours([secs[k] for k, _ in every], max(m.bounding_box()[5] for _, m in every))
    lines += ['', f'One printer instead: `furniture-plate-all_{tag}.stl`, about {int(one)}h{round(one % 1 * 60):02d}.',
              '', 'Not printed (website only): ' + ', '.join(sorted(WEB_ONLY)) + '.', '']
    with open(os.path.join(OUT, 'print-plan.md'), 'w') as fh:
        fh.write('\n'.join(lines))


if __name__ == '__main__':
    main()
