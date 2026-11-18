"""Residence A4 (Loden, Brooklyn; 1 bed / 1 bath): floor-plan data for the 3D model.

How the geometry is derived
---------------------------
Every wall face is a named LINE and gets its real position in one of two ways:

  measured  from a dimension in MEAS (the room sizes printed on the brochure plan), or
  drawing   from the brochure image (PX_X / PX_Y pixels), scaled with the drawing's own
            px-per-inch, which is calibrated from those dimensions.

Unmeasured lines are interpolated between the nearest measured lines on the same axis, so a
dimension that stretches the drawing stretches the surrounding unmeasured parts in proportion.
To refine the model (say, after a tape-measure visit), add or correct an entry in MEAS.

Units are real-world INCHES. x runs east (right on the plan), y runs south (down on the plan).
The window wall at the top of the brochure is called "north" here, whatever the compass says.
build.py flips y so the printed model reads like the brochure.
"""


def ft(f, i=0.0):
    return 12 * f + i


# --------------------------------------------------------------------------------------------
# Dimensions. a -> b along the axis, value in inches.
#   use: 'used'  -> places geometry
#        'check' -> not used to place anything; reported against the model as a cross-check
# The brochure prints room sizes only; they're nominal ("all dimensions are approximate").
# --------------------------------------------------------------------------------------------
MEAS = {
    'liv_w':  dict(axis='x', a='W_in', b='part_W', inches=ft(10, 9), use='used',
                   note="Living area width, west wall to the bedroom partition (brochure 10'9\")"),
    'liv_d':  dict(axis='y', a='N_in', b='liv_S', inches=ft(15, 11), use='used',
                   note="Living area depth, windows to the south wall (brochure 15'11\")"),
    'bed_w':  dict(axis='x', a='bed_W', b='bed_E', inches=ft(9), use='used',
                   note="Primary bedroom width, partition to east wall (brochure 9'0\")"),
    'bed_d':  dict(axis='y', a='cap_bot', b='bed_S', inches=ft(10), use='used',
                   note="Primary bedroom depth, north piers to south wall (brochure 10'0\")"),
}

TOTAL_SF = 546             # marketed area (owner, 2026-11-18); build.py reports the model against it

# --------------------------------------------------------------------------------------------
# Line positions read off the brochure image (pixels; 2000 x 1447 px export of the plan).
# --------------------------------------------------------------------------------------------
PX_X = {
    'wwin_out': 577, 'W_out': 584, 'wwin_in': 594, 'W_in': 606, 'pier_E': 614,
    'kit_W_out': 687, 'kit_W_in': 709, 'counter': 776, 'block_E': 779, 'range_front': 781, 'fridge': 793,
    'entry_L': 837, 'col_W': 892, 'entry_R': 942, 'core_W': 951, 'part_W': 962, 'core_W_in': 965,
    'bed_W': 975, 'bwin_L': 1031, 'cl_E_in': 1034, 'cl_E_out': 1055, 'wd_E': 1068, 'bcl_W': 1095,
    'bcl_W_in': 1110, 'tub_E': 1135, 'bath_E_in': 1153, 'tubchase_E': 1156, 'chase_E': 1174,
    'bcl_E_in': 1192, 'bcl_E_out': 1213, 'bed_E': 1275, 'bwin_R': 1293, 'bedE_out': 1297, 'NE_out': 1314,
}
PX_Y = {
    'N_out': 190, 'N_in': 207, 'cap_bot': 223, 'ne_bot': 245, 'col_bot': 307, 'pier_top': 309,
    'pier_bot': 358, 'bed_S': 552, 'bed_S_out': 572, 'door_top': 614, 'door_bot': 702,
    'bcl_door_bot': 711, 'alc_S': 718, 'liv_S': 737, 'alc_S_out': 740, 'wd_door_top': 741,
    'liv_S_out': 758, 'wd_door_bot': 823, 'wd_S': 832, 'bath_N': 859, 'bath_door_top': 879,
    'bath_door_bot': 966, 'range_top': 984, 'tub_N': 1048, 'range_bot': 1067, 'bath_E_bot': 1069,
    'fridge_top': 1098, 'bath_S': 1136, 'cl_N': 1149, 'bath_S_out': 1157, 'cl_door_top': 1163,
    'fridge_bot': 1181, 'cl_door_mid': 1213, 'cl_door_bot': 1263, 'S_in': 1268, 'S_out': 1289,
}
ORIGIN = {'x': 'W_in', 'y': 'N_in'}


def _scales():
    """Drawing px-per-inch per axis, calibrated from the 'used' dimensions."""
    sums = {'x': [0, 0], 'y': [0, 0]}
    for m in MEAS.values():
        if m['use'] != 'used':
            continue
        px = PX_X if m['axis'] == 'x' else PX_Y
        sums[m['axis']][0] += abs(px[m['b']] - px[m['a']])
        sums[m['axis']][1] += m['inches']
    return {k: p / i for k, (p, i) in sums.items()}


SCALE = _scales()


def nx(pa, pb):
    """Nominal inches between two x pixels."""
    return (pb - pa) / SCALE['x']


# --------------------------------------------------------------------------------------------
# Solver: real position (inches) of every line, plus how it was obtained.
# --------------------------------------------------------------------------------------------
def _solve_axis(axis, how):
    P = PX_X if axis == 'x' else PX_Y
    s = SCALE[axis]
    D = {ORIGIN[axis]: 0.0}
    how[axis, ORIGIN[axis]] = 'origin'
    meas = [m for m in MEAS.values() if m['axis'] == axis and m['use'] == 'used']
    while True:
        progress = False
        for m in meas:                  # place the unknown end of a dimension
            a, b = m['a'], m['b']
            if a in D and b not in D:
                D[b], how[axis, b], progress = D[a] + m['inches'], 'measured', True
            elif b in D and a not in D:
                D[a], how[axis, a], progress = D[b] - m['inches'], 'measured', True
        pending = [n for m in meas for n in (m['a'], m['b']) if n not in D]
        if not pending:
            break
        if not progress:                # disconnected dimension: bridge it from the nearest placed line
            n, ref = min(((n, r) for n in pending for r in D), key=lambda t: abs(P[t[0]] - P[t[1]]))
            D[n] = D[ref] + (P[n] - P[ref]) / s
            how[axis, n] = 'drawing'
    anchors = sorted(D, key=P.get)
    for n in P:                         # the rest: drawing proportions between the nearest anchors
        if n in D:
            continue
        lo = [k for k in anchors if P[k] <= P[n]]
        hi = [k for k in anchors if P[k] >= P[n]]
        if lo and hi and P[hi[0]] != P[lo[-1]]:
            a, b = lo[-1], hi[0]
            D[n] = D[a] + (P[n] - P[a]) / (P[b] - P[a]) * (D[b] - D[a])
        elif lo:
            D[n] = D[lo[-1]] + (P[n] - P[lo[-1]]) / s
        else:
            D[n] = D[hi[0]] - (P[hi[0]] - P[n]) / s
        how[axis, n] = 'drawing'
    return D


def solve():
    how = {}
    return _solve_axis('x', how), _solve_axis('y', how), how


# --------------------------------------------------------------------------------------------
# Geometry, by line name. Rectangles are (x0, x1, y0, y1).
# --------------------------------------------------------------------------------------------
WALLS = [
    ('col_W', 'bed_W', 'N_out', 'col_bot'),               # structural column, living | bedroom
    ('bed_W', 'bwin_L', 'N_out', 'cap_bot'),              # north pier, bedroom
    ('bwin_R', 'NE_out', 'N_out', 'ne_bot'),              # NE corner pier
    ('bed_E', 'bedE_out', 'N_in', 'bed_S_out'),           # bedroom east wall
    ('part_W', 'bed_W', 'col_bot', 'door_top'),           # living | bedroom partition
    ('part_W', 'bed_W', 'door_bot', 'alc_S'),             # bedroom door jamb
    ('bcl_W', 'bedE_out', 'bed_S', 'bed_S_out'),          # bedroom south wall
    ('bcl_W', 'bcl_W_in', 'bcl_door_bot', 'alc_S'),       # bedroom closet jamb
    ('bcl_E_in', 'bcl_E_out', 'bed_S_out', 'alc_S_out'),  # bedroom closet east wall
    ('core_W', 'bcl_E_out', 'alc_S', 'alc_S_out'),        # bedroom alcove south wall / W/D closet north wall
    ('wd_E', 'chase_E', 'alc_S', 'bath_N'),               # shaft behind the W/D closet
    ('core_W', 'core_W_in', 'alc_S', 'wd_door_top'),      # kitchen-side wall: jambs between the doors
    ('core_W', 'core_W_in', 'wd_door_bot', 'bath_door_top'),
    ('core_W', 'core_W_in', 'bath_door_bot', 'cl_door_top'),
    ('core_W', 'core_W_in', 'cl_door_bot', 'S_in'),
    ('core_W_in', 'wd_E', 'wd_S', 'bath_N'),              # W/D closet | bath
    ('bath_E_in', 'chase_E', 'bath_N', 'bath_E_bot'),     # bath east wall
    ('tub_E', 'tubchase_E', 'tub_N', 'bath_S'),           # wet wall at the tub's faucet end
    ('core_W_in', 'cl_E_in', 'bath_S', 'cl_N'),           # bath | hall closet
    ('cl_E_in', 'tubchase_E', 'bath_S', 'bath_S_out'),
    ('cl_E_in', 'cl_E_out', 'bath_S_out', 'S_out'),       # hall closet east wall
    ('entry_R', 'cl_E_out', 'S_in', 'S_out'),             # south wall, closet
    ('kit_W_out', 'entry_L', 'S_in', 'S_out'),            # south wall, kitchen
    ('kit_W_out', 'block_E', 'fridge_bot', 'S_in'),       # solid block past the fridge
    ('kit_W_out', 'kit_W_in', 'liv_S', 'S_in'),           # kitchen west wall
    ('W_out', 'kit_W_in', 'liv_S', 'liv_S_out'),          # living south wall
    ('W_out', 'W_in', 'pier_bot', 'liv_S'),               # living west wall
    ('wwin_out', 'pier_E', 'pier_top', 'pier_bot'),       # NW pier below the corner window
]

# kind 'sill': ordinary window, drawn with a sill (stylized at 1/3 of the cut wall height in the print).
# kind 'full': floor-to-ceiling glass, modeled as a thin curb marking the glass line.
# The walkthrough video shows a low wall under every window, so they're all 'sill'.
WINDOWS = [
    dict(rect=('wwin_out', 'col_W', 'N_out', 'N_in'), kind='sill', name='living, north'),
    dict(rect=('wwin_out', 'wwin_in', 'N_in', 'pier_top'), kind='sill', name='living, west (corner)'),
    dict(rect=('bwin_L', 'bwin_R', 'N_out', 'N_in'), kind='sill', name='bedroom, north'),
]

ENTRY_OPENING = ('entry_L', 'entry_R', 'S_in', 'S_out')

# Hinged doors: hinge point, closed-leaf tip, direction the door swings toward.
# Hinge sides and swings from the walkthrough video (2026-11-18): the brochure draws the bath, W/D and hall-closet
# doors as thin lines, but on site they're hinged (W/D: louvered, handle on the north side; hall closet: a pair).
DOORS = [
    dict(name='entry', hinge=('entry_R', 'S_in'), tip=('entry_L', 'S_in'), swing=(0, -1)),
    dict(name='bedroom', hinge=('bed_W', 'door_bot'), tip=('bed_W', 'door_top'), swing=(1, 0)),
    dict(name='bath', hinge=('core_W_in', 'bath_door_top'), tip=('core_W_in', 'bath_door_bot'), swing=(1, 0)),
    dict(name='W/D', hinge=('core_W', 'wd_door_bot'), tip=('core_W', 'wd_door_top'), swing=(-1, 0)),
    dict(name='hall closet, north leaf', hinge=('core_W', 'cl_door_top'), tip=('core_W', 'cl_door_mid'), swing=(-1, 0)),
    dict(name='hall closet, south leaf', hinge=('core_W', 'cl_door_bot'), tip=('core_W', 'cl_door_mid'), swing=(-1, 0)),
]

# Sliding / pocket / bifold doors: a line across the opening (axis, fixed lines, span).
SLIDERS = [
    dict(name='bedroom closet', x=('bcl_W', 'bcl_W_in'), y=('bed_S_out', 'bcl_door_bot')),
]

# Built-ins. Rect is in drawing px (or line names), mapped proportionally inside `frame`
# (x0, x1, y0, y1 line names). Heights are real inches (standard sizes; nothing here is measured).
BATH = ('core_W_in', 'bath_E_in', 'bath_N', 'bath_S')
FIXTURES = [
    # Kitchen: one wall of base cabinets facing east, sink and dishwasher, a range flush with the counter,
    # and a fridge proud of the counter at the south end. Uppers sit above the 4' cut, so they're not modeled.
    dict(name='counter', rect=('kit_W_in', 'counter', 'liv_S', 'range_top'), h=36, kind='cabinets', front='E',
         sink=(713, 772, 809, 898)),    # sink bowl in drawing px, mapped inside the counter
    dict(name='range', rect=('kit_W_in', 'range_front', 'range_top', 'range_bot'), h=36, kind='range', front='E'),
    dict(name='counter', rect=('kit_W_in', 'counter', 'range_bot', 'fridge_top'), h=36, kind='cabinets', front='E'),
    dict(name='fridge', rect=('kit_W_in', 'fridge', 'fridge_top', 'fridge_bot'), h=70, kind='fridge', front='E'),
    # Bath: alcove tub along the south wall (faucet at the east end), vanity and toilet on the east wall.
    dict(name='tub', rect=('core_W_in', 'tub_E', 'tub_N', 'bath_S'), h=20, kind='tub', front='N'),
    dict(name='vanity', rect=(1090, 1153, 974, 1048), frame=BATH, h=34, kind='vanity', front='W'),
    dict(name='toilet tank', rect=(1133, 1153, 887, 937), frame=BATH, h=29),
    dict(name='toilet bowl', rect=(1078, 1133, 892, 933), frame=BATH, h=15, shape='oval', kind='toilet'),
    dict(name='washer/dryer', rect=(985, 1048, 750, 813), frame=('core_W_in', 'wd_E', 'alc_S_out', 'wd_S'), h=76,
         kind='appliance'),
]

# Room labels for the 2D plan: label point (px) + the lines its headline size is taken from.
# The web page drops new furniture at the third non-closet room (LIVING AREA) when the view is off the plan.
ROOMS = [
    dict(name='PRIMARY BEDROOM', at=(1125, 385), size=('bed_W', 'bed_E', 'cap_bot', 'bed_S')),
    dict(name='KITCHEN', at=(865, 940), size=None),
    dict(name='LIVING AREA', at=(785, 450), size=('W_in', 'part_W', 'N_in', 'liv_S')),
    dict(name='BATH', at=(1028, 955), size=BATH),
    dict(name='CL', at=(1170, 643), size=('bcl_W_in', 'bcl_E_in', 'bed_S_out', 'alc_S')),
    dict(name='CL', at=(1012, 1208), size=('core_W_in', 'cl_E_in', 'cl_N', 'S_in')),
]
