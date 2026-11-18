"""Build the apartment scale model: STL(s), a dimensioned 2D plan, a 3D preview, and a report.

    python3 build.py                     # 1:60 (1 cm ~ 2 ft), 4' walls, sills at 1/3 of the wall, 2- and 3-piece splits
    python3 build.py --scale 48 --wall-height 36 --sill 18

Needs: pip install manifold3d trimesh shapely matplotlib numpy networkx scipy
"""
import argparse
import math
import os

import manifold3d as m3d
import matplotlib
import numpy as np
import shapely.affinity as saff
import trimesh
from shapely.geometry import LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

import floorplan as fp

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'output')


def fmt(inches):
    """Inches -> 9'3" style, nearest 1/2 inch."""
    v = round(inches * 2) / 2
    f, i = int(v // 12), v - 12 * int(v // 12)
    ins = f'{int(i)}' + ('½' if i % 1 else '')
    return f'{ins}"' if f == 0 else f"{f}'{ins}\""


# ------------------------------------------------------------------------------------------
# Geometry in real inches (y down, like the brochure)
# ------------------------------------------------------------------------------------------
class Plan:
    def __init__(self):
        self.X, self.Y, self.how, self.bridge = fp.solve()

    def rect(self, r, frame=None):
        X, Y = self.X, self.Y
        if frame is None:
            x0, x1, y0, y1 = (X[r[0]], X[r[1]], Y[r[2]], Y[r[3]])
        else:   # px rect mapped proportionally inside the frame's walls
            fx0, fx1, fy0, fy1 = frame

            def mx(p):
                return X[fx0] + (X[fx1] - X[fx0]) * fp.nx(fp.PX_X[fx0], p) / fp.nx(fp.PX_X[fx0], fp.PX_X[fx1])

            def my(p):
                return Y[fy0] + (Y[fy1] - Y[fy0]) * (p - fp.PX_Y[fy0]) / (fp.PX_Y[fy1] - fp.PX_Y[fy0])
            x0, x1, y0, y1 = mx(r[0]), mx(r[1]), my(r[2]), my(r[3])
        return min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)

    def pt(self, p):
        return np.array([self.X[p[0]], self.Y[p[1]]])

    def walls(self):
        return [box(*_xyxy(self.rect(r))) for r in fp.WALLS]

    def windows(self):
        """(window dict, polygon) pairs; window['kind'] is 'sill' or 'full' (floor-to-ceiling)."""
        return [(w, box(*_xyxy(self.rect(w['rect'])))) for w in fp.WINDOWS]

    def footprint(self):
        u = unary_union(self.walls() + [g for _, g in self.windows()] + [box(*_xyxy(self.rect(fp.ENTRY_OPENING)))])
        u = max(u.geoms, key=lambda g: g.area) if u.geom_type == 'MultiPolygon' else u
        return Polygon(u.exterior)

    def fixtures(self):
        out = []
        for f in fp.FIXTURES:
            x0, x1, y0, y1 = self.rect(f['rect'], f.get('frame'))
            if f.get('shape') == 'oval':
                g = saff.scale(Point(0, 0).buffer(1, 64), (x1 - x0) / 2, (y1 - y0) / 2).buffer(0)
                g = saff.translate(g, (x0 + x1) / 2, (y0 + y1) / 2)
            else:
                g = box(x0, y0, x1, y1)
            out.append((f, g))
        return out

    def doors(self):
        """(door, hinge, closed tip, open tip, radius) for each hinged door."""
        out = []
        for d in fp.DOORS:
            h, t = self.pt(d['hinge']), self.pt(d['tip'])
            r = float(np.linalg.norm(t - h))
            o = h + r * np.array(d['swing'], float)
            out.append((d, h, t, o, r))
        return out

    def door_paths(self):
        """Polylines for door swings: leaf (open) + quarter arc."""
        paths = []
        for d, h, t, o, r in self.doors():
            a0 = math.atan2(*(t - h)[::-1])
            a1 = math.atan2(*(o - h)[::-1])
            da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
            arc = [h + r * np.array([math.cos(a0 + da * k / 48), math.sin(a0 + da * k / 48)]) for k in range(49)]
            paths.append([h, o])
            paths.append(arc)
        return paths

    def slider_paths(self):
        paths = []
        for s in fp.SLIDERS:
            xa, xb = self.X[s['x'][0]], self.X[s['x'][1]]
            ya, yb = self.Y[s['y'][0]], self.Y[s['y'][1]]
            if abs(xb - xa) < abs(yb - ya):     # opening runs along y
                xm = (xa + xb) / 2
                paths.append([np.array([xm, ya]), np.array([xm, yb])])
            else:
                ym = (ya + yb) / 2
                paths.append([np.array([xa, ym]), np.array([xb, ym])])
        return paths


def _xyxy(r):
    x0, x1, y0, y1 = r
    return x0, y0, x1, y1


# ------------------------------------------------------------------------------------------
# Built-in details (engraved so they read at 1:60 without overhangs)
# ------------------------------------------------------------------------------------------
FACE_GROOVE_MM = (0.8, 0.5)     # width, depth of grooves on vertical faces
TOP_GROOVE_MM = (0.6, 0.6)      # width, depth of grooves on top faces


def _face_band(rect, face, a0, a1, dep, out):
    """Thin band hugging one face of a fixture rect (plan inches, y down). a0..a1 run along the face."""
    x0, x1, y0, y1 = rect
    return {'E': box(x1 - dep, a0, x1 + out, a1), 'W': box(x0 - out, a0, x0 + dep, a1),
            'S': box(a0, y1 - dep, a1, y1 + out), 'N': box(a0, y0 - out, a1, y0 + dep)}[face]


def _face_span(rect, face):
    x0, x1, y0, y1 = rect
    return (y0, y1) if face in 'EW' else (x0, x1)


def overhang_zone(rect, ov, out=0.0):
    """Plan box under a countertop overhang: the strip `ov['inches']` deep along face `ov['face']` of rect."""
    x0, x1, y0, y1 = rect
    d = ov['inches']
    return {'E': box(x1 - d, y0 - out, x1 + out, y1 + out), 'W': box(x0 - out, y0 - out, x0 + d, y1 + out),
            'S': box(x0 - out, y1 - d, x1 + out, y1 + out), 'N': box(x0 - out, y0 - out, x1 + out, y0 + d)}[ov['face']]


def fixture_details(plan, a, s):
    """Returns (cuts, marks, glass). cuts: (plan polygon in inches, z0 mm, z1 mm) to subtract from the
    built-ins. marks: plan polygons to outline on the 2D drawing (burners, sinks, tub basin).
    glass: (plan polygon, z0 mm, z1 mm) solids added as glass (shower screen)."""
    fl = a.floor_mm
    fw, fd = FACE_GROOVE_MM[0] / s, FACE_GROOVE_MM[1] / s
    tw, td = TOP_GROOVE_MM[0] / s, TOP_GROOVE_MM[1]
    out = 0.3 / s
    cuts, marks, glass = [], [], []

    def z(inches):
        return fl + inches * s

    def hline(rect, face, at_in, a0=None, a1=None):           # horizontal groove at a height
        lo, hi = _face_span(rect, face)
        cuts.append((_face_band(rect, face, lo if a0 is None else a0, hi if a1 is None else a1, fd, out),
                     z(at_in) - FACE_GROOVE_MM[0] / 2, z(at_in) + FACE_GROOVE_MM[0] / 2))

    def vline(rect, face, pos, z0_in, z1_in):                  # vertical groove at a position along the face
        cuts.append((_face_band(rect, face, pos - fw / 2, pos + fw / 2, fd, out), z(z0_in), z(z1_in)))

    def doors(rect, face, h, every=16.0):                      # cabinet door splits + toe kick + counter edge
        lo, hi = _face_span(rect, face)
        n = max(1, round((hi - lo) / every))
        for i in range(1, n):
            vline(rect, face, lo + (hi - lo) * i / n, 4, h - 1.5 - 0.5)
        hline(rect, face, 4)
        hline(rect, face, h - 1.5)

    for f, g in plan.fixtures():
        kind = f.get('kind')
        if kind is None:
            continue
        rect = g.bounds[0], g.bounds[2], g.bounds[1], g.bounds[3]
        x0, x1, y0, y1 = rect
        h = min(f['h'], a.wall_height)
        top = z(h)
        if kind == 'cabinets':
            doors(rect, f['front'], h)
        elif kind == 'range':
            d, w = x1 - x0, y1 - y0                                # depth runs back (x0, wall) to front (x1)
            for cu in (0.33, 0.72):
                for cv in (0.27, 0.73):
                    c = Point(x0 + cu * d, y0 + cv * w)
                    ring = c.buffer(3.6, 48).difference(c.buffer(3.6 - tw, 48))
                    cuts.append((ring, top - td, top + 1))
                    marks.append(c.buffer(3.6, 48))
            for yy in (y0, y1):                                    # seams where the range meets the counter
                cuts.append((box(x0, yy - tw / 2, x1 + out, yy + tw / 2), top - td, top + 1))
            hline(rect, f['front'], h - 4)                         # control panel / oven door
            hline(rect, f['front'], 6)                             # bottom drawer
        elif kind == 'fridge':
            hline(rect, f['front'], 28)                            # freezer drawer
            lo, hi = _face_span(rect, f['front'])
            vline(rect, f['front'], (lo + hi) / 2, 28, h + 1)      # French-door split
        elif kind == 'peninsula':
            doors(rect, f['front'], h)                             # cabinets on the kitchen side
            faces = ('S', 'E')
            ov = f.get('overhang')
            if ov:                                                 # countertop overhang: block set back under it
                cuts.append((overhang_zone(rect, ov, out), z(0) - 1, z(h - 1.5)))
                faces = tuple(fc for fc in faces if fc != ov['face'])
            for face in faces:                                     # white panels: countertop edge only
                hline(rect, face, h - 1.5)
            sx0, sx1, sy0, sy1 = plan.rect(f['sink'], frame=f['rect'])
            sink = box(sx0, sy0, sx1, sy1)
            cuts.append((sink, top - min(7 * s, h * s - 1.0), top + 1))   # 7" deep bowl
            marks.append(sink)
        elif kind == 'vanity':                                     # floating vanity on thin legs
            face = f['front']
            hline(rect, face, h - 1.25)                            # quartz top edge
            hline(rect, face, 6 + (h - 1.25 - 6) / 2)              # two drawers
            lo, hi = _face_span(rect, face)                        # open base between the legs, shown as
            cuts.append((_face_band(rect, face, lo, hi, 0.8 / s, out), fl - 0.05, z(6)))   # a 0.8 mm recess
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2                   # undermount sink, 17" x 12", toward the front
            off = {'N': (0, -2), 'S': (0, 2), 'E': (2, 0), 'W': (-2, 0)}[face]
            sw, sd = (17, 12) if face in 'NS' else (12, 17)
            sink = box(cx + off[0] - sw / 2, cy + off[1] - sd / 2, cx + off[0] + sw / 2, cy + off[1] + sd / 2)
            cuts.append((sink, top - min(6 * s, h * s - 1.0), top + 1))
            marks.append(sink)
        elif kind == 'tub':                                        # alcove tub: basin with rounded corners
            rim = 3.5
            basin = box(x0 + rim, y0 + rim, x1 - rim, y1 - rim).buffer(-5, join_style=1).buffer(5, join_style=1)
            cuts.append((basin, top - min(14 * s, h * s - 1.0), top + 1))
            marks.append(basin)
        elif kind == 'shower':                                     # pan + drain; glass screen on the open side
            c = Point((x0 + x1) / 2, (y0 + y1) / 2)
            cuts.append((c.buffer(2.0, 32).difference(c.buffer(2.0 - tw, 32)), top - min(td, h * s * 0.6), top + 1))
            gt = 1.0 / s                                           # 1 mm thick screen
            screen = _face_band(rect, f['glass'], *_face_span(rect, f['glass']), gt, 0)
            glass.append((screen, z(0) - 0.01, top + a.glass_curb_mm))
        elif kind == 'toilet':                                     # seat outline on the bowl
            seat = g.buffer(-1.0)
            cuts.append((seat.difference(seat.buffer(-tw)), top - min(0.5, h * s * 0.3), top + 1))
    return cuts, marks, glass


# ------------------------------------------------------------------------------------------
# 3D model (manifold3d)
# ------------------------------------------------------------------------------------------
def to_xsec(geom, T):
    polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    contours = []
    for p in polys:
        p = orient(saff.affine_transform(p, T), 1.0)    # exterior CCW, holes CW
        contours.append(np.asarray(p.exterior.coords)[:-1])
        contours += [np.asarray(h.coords)[:-1] for h in p.interiors]
    return m3d.CrossSection(contours, m3d.FillRule.EvenOdd)


APPLIANCES = ('range', 'fridge', 'appliance')


def build_model(plan, a):
    """Returns (components, union, T, s). Components are kept separate for the colored preview;
    upright parts start 0.01 mm inside the floor slab so the union is one solid."""
    s = 25.4 / a.scale                                  # mm per real inch
    fpoly = plan.footprint()
    minx, miny, maxx, maxy = fpoly.bounds
    T = [s, 0, 0, -s, -minx * s, maxy * s]              # inches (y down) -> mm (y up, origin 0,0)
    fl = a.floor_mm
    z0 = fl - 0.01
    wall_top = fl + a.wall_height * s

    def prism(geom, lo, hi):
        return to_xsec(geom, T).extrude(hi - lo).translate([0, 0, lo])

    def union(ms):
        return m3d.Manifold.batch_boolean(ms, m3d.OpType.Add)

    floor = prism(fpoly, 0, fl)
    gw_in = a.groove_mm / s                             # groove width, in real inches
    # keep grooves ~0.4 mm clear of walls/fixtures so nothing meets at a bare edge (non-manifold)
    keep_out = unary_union(plan.walls() + [g for _, g in plan.fixtures()]).buffer(0.4 / s, join_style=2)
    grooves = unary_union([LineString(p).buffer(gw_in / 2, cap_style=2, join_style=2)
                           for p in plan.door_paths() + plan.slider_paths()])
    grooves = grooves.intersection(fpoly.buffer(-0.4 / s)).difference(keep_out)
    if not grooves.is_empty:
        floor = floor - prism(grooves, fl - a.groove_depth_mm, fl + 1)

    comps = {
        'floor': floor,
        'wall': union([prism(w, z0, wall_top) for w in plan.walls()]),
        'sill': union([prism(g, z0, fl + a.sill * s) for w, g in plan.windows() if w['kind'] == 'sill']),
        'glass': union([prism(g, z0, fl + a.glass_curb_mm) for w, g in plan.windows() if w['kind'] == 'full']),
    }
    cuts, _, glass = fixture_details(plan, a, s)
    cut_m = union([prism(g, lo, hi) for g, lo, hi in cuts])
    comps['glass'] = union([comps['glass']] + [prism(g, lo, hi) for g, lo, hi in glass])
    for comp, kinds in (('fixture', lambda k: k not in APPLIANCES), ('appliance', lambda k: k in APPLIANCES)):
        solids = [prism(g, z0, fl + min(f['h'], a.wall_height) * s) for f, g in plan.fixtures() if kinds(f.get('kind'))]
        comps[comp] = union(solids) - cut_m
    return comps, union(list(comps.values())), T, s


def trim_x(man, xa=None, xb=None):
    """Part of a manifold with xa <= x <= xb (mm)."""
    if xa is not None:
        man = man.trim_by_plane([1, 0, 0], xa)
    if xb is not None:
        man = man.trim_by_plane([-1, 0, 0], -xb)
    return man


# Rough MK3 "0.30mm DRAFT" print-time model: slice into layers, time the perimeters and fills.
# Speeds are effective (acceleration-limited) guesses; use it to compare pieces, not as a promise.
EXT_W = 0.45
SPEED = dict(first=20, ext=30, per=40, solid=60, top=40, sparse=80)        # mm/s
ISLAND_S, LAYER_S, START_S = 0.6, 1.5, 5 * 60                             # travel per island, layer change, heat+MBL


def _layer_zs(h):
    zs, z = [0.1], 0.2
    while z + 0.3 <= h + 1e-6:
        zs.append(z + 0.15)
        z += 0.3
    return zs


def time_profile(man, floor_mm, bin_mm=1.0):
    """Seconds of printing per x-bin (mm), plus the fixed seconds every piece pays (heat-up, layer changes)."""
    import shapely
    bb = man.bounding_box()
    edges = np.arange(bb[0], bb[3] + bin_mm, bin_mm)
    boxes = shapely.box(edges[:-1], bb[1] - 1, edges[1:], bb[4] + 1)
    prof = np.zeros(len(boxes))
    zs = _layer_zs(bb[5])
    for i, z in enumerate(zs):
        rings = [np.asarray(r) for r in man.slice(z).to_polygons()]
        if not rings:
            continue
        outer = [Polygon(r) for r in rings if Polygon(r).exterior.is_ccw]
        holes = [Polygon(r) for r in rings if not Polygon(r).exterior.is_ccw]
        geom = unary_union(outer).difference(unary_union(holes)) if holes else unary_union(outer)
        L = shapely.length(shapely.intersection(geom.boundary, boxes))
        A = shapely.area(shapely.intersection(geom, boxes))
        inner = np.maximum(A - 2 * EXT_W * L, 0)
        if i == 0:
            t = (2 * L + inner / EXT_W) / SPEED['first']
        else:
            t = L / SPEED['ext'] + L / SPEED['per']
            if z < floor_mm:
                t = t + inner / EXT_W / (SPEED['top'] if z > floor_mm - 0.9 else SPEED['solid'])
            else:
                t = t + inner * 0.15 / EXT_W / SPEED['sparse']
        for g in (geom.geoms if geom.geom_type == 'MultiPolygon' else [geom]):
            t[min(np.searchsorted(edges, g.centroid.x) - 1, len(t) - 1)] += ISLAND_S
        prof += t
    return edges, prof, START_S + LAYER_S * len(zs)


def piece_hours(edges, prof, fixed, xa, xb):
    cum = np.concatenate([[0], np.cumsum(prof)])
    lo = 0 if xa is None else np.interp(xa, edges, cum)
    hi = cum[-1] if xb is None else np.interp(xb, edges, cum)
    return (hi - lo + fixed) / 3600


def choose_cuts(plan, a, s, n, model):
    """x positions (model mm) for n-1 straight cuts. A cut stays >= a.cut_clear_mm from the faces of every
    wall, window and built-in, or crosses one leaving enough on both sides (no slivers, no wall split
    lengthwise, small built-ins never cut). Among the allowed cuts, pick the set whose slowest piece
    prints fastest (estimated), so parallel printers finish together."""
    fpoly = plan.footprint()
    minx = fpoly.bounds[0]
    xs = np.arange(minx + 0.25, fpoly.bounds[2], 0.5)       # candidate cut positions, inches
    clear = a.cut_clear_mm / s
    walls = [g.bounds for g in plan.walls()] + [g.bounds for _, g in plan.windows()]
    fixtures = [g.bounds for _, g in plan.fixtures()]

    def crossing_ok(x, b, keep_mm):
        return not (b[0] - clear < x < b[2] + clear) or (b[0] + keep_mm / s <= x <= b[2] - keep_mm / s)

    def ok(x):
        # walls/columns: crossing is fine if >= wall_min_mm stays on each side (never split one lengthwise);
        # built-ins: only large ones (peninsula, tub) may be crossed, small ones (toilets, vanities) never
        return (all(crossing_ok(x, b, a.wall_min_mm) for b in walls) and
                all(crossing_ok(x, b, a.fixture_min_mm if (b[2] - b[0]) * s >= a.fixture_cuttable_mm else 1e9)
                    for b in fixtures))
    cand = [(x - minx) * s for x in xs if ok(x)]

    edges, prof, fixed = time_profile(model, a.floor_mm)
    import itertools
    best = None
    for combo in itertools.combinations(cand, n - 1):
        bounds = [None, *combo, None]
        hrs = [piece_hours(edges, prof, fixed, bounds[i], bounds[i + 1]) for i in range(n)]
        if best is None or max(hrs) < max(best[1]):
            best = (list(combo), hrs)
    return best


def to_trimesh(man):
    mesh = man.to_mesh()
    return trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3], faces=np.asarray(mesh.tri_verts), process=True)


# ------------------------------------------------------------------------------------------
# 2D dimensioned plan
# ------------------------------------------------------------------------------------------
INK, MEAS_C, EST_C, WIN_C, GLASS_C = '#1d1d1f', '#1f5fbf', '#c25400', '#8ecae6', '#4f8fd0'


def measured_between(axis, a, b):
    """True if a chain of 'used' tape measurements connects lines a and b on this axis."""
    adj = {}
    for m in fp.MEAS.values():
        if m['axis'] == axis and m['use'] == 'used':
            adj.setdefault(m['a'], set()).add(m['b'])
            adj.setdefault(m['b'], set()).add(m['a'])
    seen, todo = {a}, [a]
    while todo:
        n = todo.pop()
        for k in adj.get(n, ()):
            if k not in seen:
                seen.add(k)
                todo.append(k)
    return b in seen


def dim(ax, p0, p1, text, measured, side=1, fs=8):
    """Axis-aligned dimension line. Measured: solid blue. Estimated: dashed orange, 'est.' prefix."""
    (x0, y0), (x1, y1) = p0, p1
    color = MEAS_C if measured else EST_C
    label = text if measured else f'est. {text}'
    ax.plot([x0, x1], [y0, y1], color=color, lw=1.0, ls='-' if measured else (0, (4, 2)), zorder=6)
    horiz = abs(y1 - y0) < 1e-6
    for (x, y) in (p0, p1):
        if horiz:
            ax.plot([x, x], [y - 2, y + 2], color=color, lw=1.0, zorder=6)
        else:
            ax.plot([x - 2, x + 2], [y, y], color=color, lw=1.0, zorder=6)
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    style = dict(color=color, fontsize=fs, zorder=7, fontweight='bold' if measured else 'normal',
                 fontstyle='normal' if measured else 'italic', bbox=dict(fc='white', ec='none', pad=0.4, alpha=0.9))
    if horiz:
        ax.text(mx, my - 1.6 * side, label, ha='center', va='bottom' if side > 0 else 'top', **style)
    else:
        ax.text(mx + 1.6 * side, my, label, ha='left' if side > 0 else 'right', va='center', rotation=90, **style)


def draw_plan(plan, a, path_png, path_svg):
    X, Y = plan.X, plan.Y
    fig, ax = plt.subplots(figsize=(20, 13.6))
    fpoly = plan.footprint()
    ax.fill(*fpoly.exterior.xy, color='#f6f4ef', zorder=0)
    for w in plan.walls():
        ax.fill(*w.exterior.xy, color=INK, lw=0, zorder=3)
    for w, g in plan.windows():
        if w['kind'] == 'full':
            ax.fill(*g.exterior.xy, color=GLASS_C, ec='#1d3557', lw=0.6, hatch='////', zorder=3)
        else:
            ax.fill(*g.exterior.xy, color=WIN_C, ec='#457b9d', lw=0.6, zorder=3)
    ax.text(X['E_out'] + 3, (Y['N_in'] + Y['pier_top']) / 2, 'floor-to-ceiling', rotation=-90, fontsize=7.5,
            color='#1d3557', ha='left', va='center', zorder=7)
    ax.text(X['E_out'] + 3, (Y['bed2_win_top'] + Y['bed2_win_bot']) / 2, 'floor-to-ceiling', rotation=-90,
            fontsize=7.5, color='#1d3557', ha='left', va='center', zorder=7)
    for f, g in plan.fixtures():
        ax.fill(*g.exterior.xy, color='#dedede', ec='#6b6b6b', lw=0.7, zorder=2)
        c = g.centroid
        if g.area > 400:
            x0, y0, x1, y1 = g.bounds
            txt = f"{f['name'].split(' ')[0]}\n{f['h']:.0f}\" tall" + (' (measured)' if f['name'] == 'peninsula' else '')
            ax.text(c.x, c.y, txt, fontsize=6.5, ha='center', va='center', color='#444', zorder=4)
    _, marks, glass = fixture_details(plan, a, 25.4 / a.scale)
    for g in marks:                                             # burners, sinks, tub basin
        ax.plot(*g.exterior.xy, color='#6b6b6b', lw=0.6, zorder=3)
    for g, _, _ in glass:                                       # shower screen
        ax.fill(*g.exterior.xy, color=GLASS_C, lw=0, zorder=4)
    for path in plan.door_paths():
        p = np.array(path)
        ax.plot(p[:, 0], p[:, 1], color='#555', lw=0.9 if len(p) == 2 else 0.6, zorder=2)
    for d, h, t, o, r in plan.doors():
        mid = h + 0.55 * (t - h) + 0.55 * (o - h)
        ax.text(*mid, f'est. {fmt(r)}\ndoor', fontsize=7, color=EST_C, fontstyle='italic', ha='center', va='center', zorder=5)
    for path in plan.slider_paths():
        p = np.array(path)
        ax.plot(p[:, 0], p[:, 1], color='#555', lw=0.8, ls='--', zorder=4)

    def lbl(px, py):    # label position from drawing px (labels only)
        kx = sorted(X, key=lambda k: fp.PX_X[k])
        ky = sorted(Y, key=lambda k: fp.PX_Y[k])
        return (np.interp(px, [fp.PX_X[k] for k in kx], [X[k] for k in kx]),
                np.interp(py, [fp.PX_Y[k] for k in ky], [Y[k] for k in ky]))

    for r in fp.ROOMS:
        x, y = lbl(*r['at'])
        small = r['name'] == 'CL'
        ax.text(x, y + (3 if r['size'] else 0) * (0 if small else 1), r['name'], fontsize=7.5 if small else 10.5,
                ha='center', va='bottom' if r['size'] else 'center', color=INK, fontweight='bold', zorder=5)
        if r['size']:
            x0n, x1n, y0n, y1n = r['size']
            mw, md = measured_between('x', x0n, x1n), measured_between('y', y0n, y1n)
            w, d = X[x1n] - X[x0n], Y[y1n] - Y[y0n]
            txt = f'{fmt(w)} × {fmt(d)}'
            measured = mw and md
            ax.text(x, y + (2 if small else 4), txt if measured else f'est. {txt}', fontsize=7 if small else 9.5,
                    ha='center', va='top', zorder=5, color=MEAS_C if measured else EST_C,
                    fontweight='bold' if measured else 'normal', fontstyle='normal' if measured else 'italic')

    def D(axis, a_, b_, at, side=1, fs=8, assumed=False):
        # assumed=True: the lines are tape-measured elsewhere, but that they apply HERE is read off the drawing
        p0, p1 = ((X[a_], at), (X[b_], at)) if axis == 'x' else ((at, Y[a_]), (at, Y[b_]))
        v = abs((X if axis == 'x' else Y)[b_] - (X if axis == 'x' else Y)[a_])
        dim(ax, p0, p1, fmt(v), measured_between(axis, a_, b_) and not assumed, side=side, fs=fs)

    # ---- your tape measurements (style is decided by measured_between, not by hand) ----
    D('x', 'W_in', 'bed1_E', 14)                                  # 9'3"
    D('y', 'N_in', 'bed1_S_in', 12)                               # 10'2"
    D('y', 'N_in', 'cl1_stub1_bot', X['bed1_E'] - 6, side=-1)     # 3'11" wall before closet
    D('x', 'W_in', 'bed1_S_end', Y['bed1_S_in'] - 6)              # 5'10"
    D('x', 'W_in', 'stub_L', Y['bed1_S_out'] + 5, side=-1)        # 5'4"
    D('y', 'bed1_S_out', 'stub_bot', X['stub_L'] - 3, side=-1)    # 10"
    D('y', 'bed1_S_out', 'entry_top', 6)                          # 1'5"
    D('y', 'bed1_S_out', 'hall_S', X['W_out'] - 12, side=-1)      # 4'9"
    D('y', 'stub_bot', 'hall_S', X['stub_R'] + 8)                 # 3'11" hall width
    D('y', 'closet_top', 'hall_S', X['closet_W_out'] - 4, side=-1)  # 3'11" closet side
    D('x', 'pen_E', 'col_L', 22)                                  # 8'1.5"
    D('x', 'col_L', 'col_R', Y['liv_col_bot'] + 5, side=-1)       # 2'3.5"
    D('x', 'col_R', 'E_in', 22)                                   # 5'4"
    D('x', 'livwin_R', 'col_L', 34, fs=7)                         # wall between window and column (photo est.)
    D('x', 'col_R', 'livwin2_L', 34, fs=7)
    D('y', 'N_in', 'bump_N', X['E_in'] - 8, side=-1)              # 8'5"
    D('y', 'bump_N', 'liv_S', X['bump_W'] - 4, side=-1)           # 2'2"
    D('x', 'bump_W', 'E_in', Y['bump_N'] - 5)                     # 2'8"
    D('x', 'step_W', 'bump_W', Y['liv_S'] - 6)                    # 9'3"
    D('x', 'bed2_W_in', 'block_W', Y['bed2_S_in'] - 8)            # 10'4"
    D('x', 'block_W', 'E_in', Y['block_top'] - 6)                 # 1'2"
    D('y', 'bed2_N', 'bed2_S_in', X['E_out'] + 16)                # 9'3"
    D('y', 'bed2_N', 'block_top', X['E_in'] - 8, side=-1)         # 7'
    D('x', 'pen_E', 'E_in', Y['N_out'] - 10)                      # 15'9" = sum of the three parts

    # ---- estimated from the drawing ----
    D('x', 'col_E', 'counter', Y['fridge_top'] - 14, fs=7)                      # counter depth
    D('x', 'counter', 'pen_W', 30)                                              # kitchen aisle
    D('y', 'N_in', 'fridge_top', X['counter'] + 5, fs=7)                        # counter run
    D('x', 'pen_W', 'pen_E', Y['pen_bot'] + 6, side=-1)                         # peninsula
    D('y', 'N_in', 'pen_bot', X['pen_W'] - 6, side=-1)
    D('y', 'pen_bot', 'closet_top', X['pen_W'] + 24)                            # peninsula end to suite wall
    D('y', 'N_in', 'liv_col_bot', X['col_R'] + 5, fs=7)                         # column depth
    D('y', 'stub_bot', 'hall_S', (X['cl2_door_L'] + X['cl2_door_R']) / 2, assumed=True)  # hall width at hall closet
    D('x', 'W_in', 'closet_W_out', Y['hall_S'] - 9, side=-1)                    # hall length
    D('x', 'bath1_W_in', 'div_L', Y['bath_top_in'] + 9)                         # bath 1
    D('y', 'bath_top_in', 'bath_S_in', X['bath1_W_in'] + 14)
    D('x', 'div_R', 'bed2_W_out', Y['bath_top_in'] + 9)                         # bath 2
    D('y', 'bath_top_in', 'bath_S_in', X['bed2_W_out'] - 7, side=-1)
    D('x', 'wd_L_in', 'wd_R_in', Y['wd_in_bot'] - 5, fs=7)                      # W/D closet
    D('y', 'bath_top_in', 'wd_in_bot', X['wd_L_in'] + 4, fs=7)
    D('x', 'closet_E_out', 'bed2_W_out', Y['hall_S'] - 6)                       # suite vestibule
    D('y', 'vest_wall_bot', 'hall_S', X['closet_E_out'] + 4)
    D('x', 'W_in', 'E_in', Y['bath_S_out'] + 14, side=-1)                       # overall inside, E-W
    ax.text((X['W_in'] + X['E_in']) / 2, Y['bath_S_out'] + 22, "bedroom 1 west wall to east windows (not measured; only matters for the hallway length)",
            fontsize=7, color=EST_C, fontstyle='italic', ha='center', va='top')
    fb = fpoly.bounds
    dim(ax, (fb[0] - 34, fb[1]), (fb[0] - 34, fb[3]), f'{fmt(fb[3] - fb[1])} overall, outside faces', False, side=-1)
    # bath / W/D door openings (sliding/pocket), estimated
    for name, xa, xb in (('bath 1', 'bath1_door_L', 'bath1_door_R'), ('bath 2', 'hinge', 'nub_L'), ('W/D', 'wd_door_L', 'wd_door_R')):
        ax.text((X[xa] + X[xb]) / 2, Y['bath_top_in'] + 2.5, f'est. {fmt(X[xb] - X[xa])} opening', fontsize=6.5,
                color=EST_C, fontstyle='italic', ha='center', va='top', zorder=7,
                bbox=dict(fc='white', ec='none', pad=0.3, alpha=0.9))

    ax.set_aspect('equal')
    ax.invert_yaxis()
    ax.axis('off')
    ax.set_xlim(fb[0] - 62, fb[2] + 40)
    ax.set_ylim(fb[3] + 44, fb[1] - 26)
    sx, sy = fb[0] + 330, fb[3] + 34          # scale bar
    for k in range(0, 61, 12):
        ax.plot([sx + k, sx + k], [sy - 1.5, sy + 1.5], color=INK, lw=0.8)
    ax.plot([sx, sx + 60], [sy, sy], color=INK, lw=0.8)
    ax.text(sx + 30, sy + 3, '0 – 5 ft', fontsize=7.5, ha='center', va='top')
    fig.text(0.012, 0.985, 'Residence B7: dimensions used in the 3D model',
             fontsize=14, fontweight='bold', va='top')
    fig.text(0.012, 0.958, "9'3\"  solid blue = your tape measurement (exact in the model)", color=MEAS_C,
             fontsize=10.5, fontweight='bold', va='top')
    fig.text(0.012, 0.938, "est. 3'6\"  dashed orange = estimated from the brochure drawing (re-measure at move-in)",
             color=EST_C, fontsize=10.5, fontstyle='italic', va='top')
    fig.text(0.012, 0.918, 'Interior faces unless noted. Interior walls est. 5" thick. Hatched windows (east wall) are '
             'floor-to-ceiling; light-blue windows are drawn with the sill at 1/3 of the cut wall (stylized). '
             'Built-ins show real height.',
             color='#555', fontsize=9, va='top')
    fig.subplots_adjust(left=0.01, right=0.99, bottom=0.01, top=0.9)
    fig.savefig(path_png, dpi=160)
    fig.savefig(path_svg)
    plt.close(fig)


# ------------------------------------------------------------------------------------------
# Preview render: tiny numpy z-buffer rasterizer (orthographic), so no OpenGL is needed
# ------------------------------------------------------------------------------------------
PREVIEW_COLORS = {   # kind: (top face, side faces)
    'floor': ((0.95, 0.92, 0.86), (0.78, 0.75, 0.70)),
    'wall': ((0.23, 0.23, 0.25), (0.86, 0.87, 0.89)),
    'sill': ((0.56, 0.79, 0.90), (0.74, 0.86, 0.93)),
    'glass': ((0.16, 0.45, 0.78), (0.35, 0.60, 0.86)),
    'fixture': ((0.80, 0.80, 0.80), (0.92, 0.92, 0.92)),
    'appliance': ((0.55, 0.57, 0.60), (0.70, 0.72, 0.75)),
    'furniture': ((0.80, 0.70, 0.58), (0.68, 0.58, 0.47)),
    'rug': ((0.90, 0.88, 0.82), (0.75, 0.73, 0.68)),
}


def render_preview(meshes, path, title, azim=-35, elev=50, width=1800, ss=2):
    """meshes: list of (trimesh, kind). Flat-shaded orthographic z-buffer render."""
    tris, cols, tops, nrms = [], [], [], []
    for tm, kind in meshes:
        if tm is None or len(tm.faces) == 0:
            continue
        t = np.asarray(tm.vertices, float)[np.asarray(tm.faces)]
        nr = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        nr /= np.linalg.norm(nr, axis=1, keepdims=True) + 1e-12
        top = nr[:, 2] > 0.9
        topc, sidec = PREVIEW_COLORS[kind]
        cols.append(np.where(top[:, None], np.array(topc), np.array(sidec)))
        tris.append(t); tops.append(top); nrms.append(nr)
    tri, col, top, nrm = np.vstack(tris), np.vstack(cols), np.concatenate(tops), np.vstack(nrms)
    light = np.array([-0.35, -0.55, 0.76]); light /= np.linalg.norm(light)
    shade = np.where(top, 1.0, 0.55 + 0.45 * np.clip(nrm @ light, 0, 1))
    col = np.clip(col * shade[:, None], 0, 1)
    V = tri.reshape(-1, 3)
    F = np.arange(len(V)).reshape(-1, 3)

    # camera: rotate about z by azim, then tilt by elev; project orthographically
    c = V.mean(axis=0)
    a_, e_ = math.radians(azim), math.radians(elev)
    Rz = np.array([[math.cos(a_), -math.sin(a_), 0], [math.sin(a_), math.cos(a_), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, math.sin(e_), math.cos(e_)], [0, -math.cos(e_), math.sin(e_)]])
    P = (V - c) @ Rz.T @ Rx.T                       # x right, y up on screen, z toward viewer
    lo, hi = P[:, :2].min(axis=0), P[:, :2].max(axis=0)
    W = width * ss
    k = (W * 0.92) / (hi[0] - lo[0])
    H = int((hi[1] - lo[1]) * k / 0.86)
    sx = (P[:, 0] - lo[0]) * k + W * 0.04
    sy = (hi[1] - P[:, 1]) * k + H * 0.07
    sz = P[:, 2]
    img = np.ones((H, W, 3))
    zb = np.full((H, W), -np.inf)
    for i, (a, b, d) in enumerate(F):
        xs, ys = sx[[a, b, d]], sy[[a, b, d]]
        x0, x1 = max(int(xs.min()), 0), min(int(xs.max()) + 2, W)
        y0, y1 = max(int(ys.min()), 0), min(int(ys.max()) + 2, H)
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(den) < 1e-9:
            continue
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        z = w0 * sz[a] + w1 * sz[b] + w2 * sz[d]
        sub = zb[y0:y1, x0:x1]
        win = inside & (z > sub + 1e-4)
        sub[win] = z[win]
        img[y0:y1, x0:x1][win] = col[i]
    # outline where depth jumps (reads like a model photo)
    d = np.where(np.isfinite(zb), zb, zb[np.isfinite(zb)].min() - 50)
    edge = (np.abs(np.diff(d, axis=0, prepend=d[:1])) + np.abs(np.diff(d, axis=1, prepend=d[:, :1]))) > 0.6
    img[edge] *= 0.45
    img = img.reshape(H // ss, ss, W // ss, ss, 3).mean(axis=(1, 3)) if H % ss == 0 else \
        img[:H - H % ss].reshape(H // ss, ss, W // ss, ss, 3).mean(axis=(1, 3))
    fig = plt.figure(figsize=(img.shape[1] / 150, img.shape[0] / 150 + 0.4), dpi=150)
    ax = fig.add_axes([0, 0, 1, 1 - 0.4 / (img.shape[0] / 150 + 0.4)])
    ax.imshow(img)
    ax.axis('off')
    fig.suptitle(title, fontsize=11, y=0.995)
    fig.savefig(path, dpi=150)
    plt.close(fig)


# ------------------------------------------------------------------------------------------
def report(plan, a, tm, size_mm, parts):
    X, Y = plan.X, plan.Y
    L = []
    L.append(f'# Build report: scale 1:{a.scale:g}, walls {fmt(a.wall_height)} high\n')
    L.append(f'Model footprint: **{size_mm[0]:.1f} × {size_mm[1]:.1f} mm**, height {size_mm[2]:.1f} mm '
             f'(1 ft = {304.8 / a.scale:.2f} mm). Watertight: {tm.is_watertight}.\n')
    L.append(f'Windows: east wall (living room + bedroom 2) floor-to-ceiling, shown as a {a.glass_curb_mm:g} mm curb; '
             f'the rest have a {fmt(a.sill)} sill, i.e. {a.sill / a.wall_height:.0%} of the cut wall. That is stylized: '
             f'real sills sit at 1/4-1/3 of the ceiling height (about 27-36" if the ceilings are about 9\').\n')
    L.append('| File | Size (mm) | Est. print time, MK3 0.30mm DRAFT (rough) |')
    L.append('|---|---|---|')
    for name, (w, d, hrs) in parts.items():
        L.append(f'| `{name}` | {w:.1f} × {d:.1f} | ~{hrs:.1f} h |')
    L.append('\n## Your measurements vs. the model\n')
    L.append('| # | What | Yours | Model | Use |')
    L.append('|---|---|---|---|---|')
    for k, m in fp.MEAS.items():
        D = X if m['axis'] == 'x' else Y
        model = D[m['b']] - D[m['a']]
        flag = '' if abs(model - m['inches']) < 0.25 else f" **(off {model - m['inches']:+.1f}\")**"
        L.append(f"| `{k}` | {m['note']} | {fmt(m['inches'])} | {fmt(model)}{flag} | {m['use']} |")
    br = plan.bridge
    L.append(f"\n**East–west total isn't measured.** Read along the window wall (through the kitchen) the drawing puts "
             f"the east windows {fmt(br['via_kitchen'])} from bedroom 1's west wall; along the hallway it says "
             f"{fmt(br['via_hall'])}. The model uses the average ({fmt(X['E_in'])}), so unmeasured widths in the "
             f"middle of the plan (kitchen, baths, hall, closets) carry roughly ±{abs(br['via_kitchen'] - br['via_hall']) / 2:.0f}\" uncertainty.\n")
    L.append('## Inferred dimensions (from the drawing, NOT measured)\n')
    rows = [
        ('Kitchen aisle, counter edge to peninsula', X['pen_W'] - X['counter']),
        ('Kitchen counter depth', X['counter'] - X['col_E']),
        ('Kitchen counter run, north wall to fridge', Y['fridge_top'] - Y['N_in']),
        ('Peninsula, east-west', X['pen_E'] - X['pen_W']),
        ('Peninsula, north-south', Y['pen_bot'] - Y['N_in']),
        ('Bath 1 interior, east-west', X['div_L'] - X['bath1_W_in']),
        ('Bath 2 interior, east-west', X['bed2_W_out'] - X['div_R']),
        ('Baths interior, north-south', Y['bath_S_in'] - Y['bath_top_in']),
        ('Tub', None),
        ('W/D closet interior', None),
        ('Hall, bedroom-1 door wall to bath wall', Y['hall_S'] - Y['stub_bot']),
        ('Hall length, foyer west wall to suite closet', X['closet_W_out'] - X['W_in']),
        ('Suite vestibule, closet to bedroom 2 wall', X['bed2_W_out'] - X['closet_E_out']),
        ('Entry door opening', Y['entry_bot'] - Y['entry_top']),
        ('Bedroom 1 door opening', X['cl2_stub_L'] - X['stub_R']),
        ('Bedroom 2 suite door opening', X['nub_L'] - X['hinge']),
        ('Bedroom 1 closet (inside)', None),
        ('Living column depth (from window wall)', Y['liv_col_bot'] - Y['N_in']),
        ('Wall thickness, interior partitions', X['cl1_W_in'] - X['bed1_E']),
    ]
    for label, v in rows:
        if label == 'Tub':
            x0, x1, y0, y1 = plan.rect(fp.FIXTURES[3]['rect'])
            L.append(f'- {label}: {fmt(x1 - x0)} × {fmt(y1 - y0)}')
        elif label == 'W/D closet interior':
            L.append(f"- {label}: {fmt(X['wd_R_in'] - X['wd_L_in'])} × {fmt(Y['wd_in_bot'] - Y['bath_top_in'])}")
        elif label == 'Bedroom 1 closet (inside)':
            L.append(f"- {label}: {fmt(X['cl1_E_in'] - X['cl1_W_in'])} deep × {fmt(Y['cl1_bot'] - Y['cl1_top'])} long")
        else:
            L.append(f'- {label}: {fmt(v)}')
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scale', type=float, default=60, help='1:N (60 -> 1 cm on the model is about 2 ft)')
    ap.add_argument('--wall-height', type=float, default=48, help='wall cut height, real inches')
    ap.add_argument('--sill', type=float, default=None,
                    help='sill height of ordinary windows, real inches (default: --sill-frac of the wall height)')
    ap.add_argument('--sill-frac', type=float, default=1 / 3,
                    help='sill as a fraction of the cut wall height; stylized, so the windows read at a 3\' cut')
    ap.add_argument('--glass-curb-mm', type=float, default=1.2, help='height of the curb marking floor-to-ceiling glass')
    ap.add_argument('--floor-mm', type=float, default=2.0)
    ap.add_argument('--groove-mm', type=float, default=0.8, help='width of engraved door-swing lines')
    ap.add_argument('--groove-depth-mm', type=float, default=0.6)
    ap.add_argument('--cut-clear-mm', type=float, default=1.5, help='min distance from a cut to any wall face')
    ap.add_argument('--wall-min-mm', type=float, default=2.5, help='min piece of a wall left on each side of a cut')
    ap.add_argument('--fixture-min-mm', type=float, default=3.0, help='min piece of a built-in left on each side of a cut')
    ap.add_argument('--fixture-cuttable-mm', type=float, default=12.0,
                    help='built-ins narrower than this (toilets, vanities) are never cut')
    a = ap.parse_args()
    if a.sill is None:
        a.sill = a.sill_frac * a.wall_height
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):                       # drop STLs from earlier scales
        if f.endswith('.stl'):
            os.remove(os.path.join(OUT, f))

    plan = Plan()
    comps, model, T, s = build_model(plan, a)
    tag = f'apartment-b7_1to{a.scale:g}'
    tm = to_trimesh(model)
    tm.export(os.path.join(OUT, f'{tag}.stl'))
    size = tm.extents
    parts = {}

    names = {2: ['west', 'east'], 3: ['west', 'middle', 'east']}
    piece_sets = {}
    edges, prof, fixed = time_profile(model, a.floor_mm)
    parts[f'{tag}.stl'] = (size[0], size[1], piece_hours(edges, prof, fixed, None, None))
    for n in (2, 3):
        cuts, shares = choose_cuts(plan, a, s, n, model)
        bounds = [None, *cuts, None]
        piece_sets[n] = []
        for i in range(n):
            lo, hi = bounds[i], bounds[i + 1]
            piece = trim_x(model, lo, hi).translate([-(lo or 0), 0, 0])
            t = to_trimesh(piece)
            assert t.is_watertight, f'{n}-piece #{i + 1} not watertight'
            name = f'{tag}_{n}pc-{i + 1}of{n}-{names[n][i]}.stl'
            t.export(os.path.join(OUT, name))
            parts[name] = (t.extents[0], t.extents[1], shares[i])
            piece_sets[n].append((lo, hi))

    draw_plan(plan, a, os.path.join(OUT, 'plan-dimensions.png'), os.path.join(OUT, 'plan-dimensions.svg'))
    meshes = [(to_trimesh(m), k) for k, m in comps.items()]
    title = f'B7 at 1:{a.scale:g}: {size[0]:.0f} × {size[1]:.0f} mm, walls cut at {fmt(a.wall_height)}'
    render_preview(meshes, os.path.join(OUT, 'preview-3d.png'), title)
    render_preview(meshes, os.path.join(OUT, 'preview-3d-from-east.png'), title, azim=150, elev=42)
    gap = 10.0
    exploded = []
    for i, (lo, hi) in enumerate(piece_sets[3]):
        for k, m in comps.items():
            exploded.append((to_trimesh(trim_x(m, lo, hi).translate([i * gap, 0, 0])), k))
    render_preview(exploded, os.path.join(OUT, 'preview-3-pieces.png'),
                   '3-piece split: one piece per printer, glue the straight cut faces together')
    # close-ups
    X, Y = plan.X, plan.Y
    fminx, fmaxy = plan.footprint().bounds[0], plan.footprint().bounds[3]

    def closeup(fname, title, x0n, x1n, y0n, y1n, **view):
        kx0, kx1 = (X[x0n] - fminx) * s, (X[x1n] - fminx) * s
        ky0, ky1 = (fmaxy - Y[y1n]) * s, (fmaxy - Y[y0n]) * s
        part = []
        for k, m in comps.items():
            m = trim_x(m, kx0, kx1).trim_by_plane([0, 1, 0], ky0).trim_by_plane([0, -1, 0], -ky1)
            part.append((to_trimesh(m), k))
        render_preview(part, os.path.join(OUT, fname), title, width=1500, **view)
    closeup('preview-kitchen.png', 'Kitchen detail', 'bed1_E', 'livwin_L', 'N_out', 'stub_bot', azim=-60, elev=38)
    closeup('preview-baths.png', 'Baths seen from the hallway: main bath with shower (left), guest bath with tub (right)', 'wd_R_in', 'bath_E_out',
            'stub_bot', 'bath_S_out', azim=200, elev=48)
    rep = report(plan, a, tm, size, parts)
    with open(os.path.join(OUT, 'report.md'), 'w') as f:
        f.write(rep)
    print(rep)


if __name__ == '__main__':
    main()
