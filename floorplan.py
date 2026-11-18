"""Residence B7: floor-plan data for the 3D model.

How the geometry is derived
---------------------------
The brochure plan isn't to scale (its living-room column, for example, is drawn about twice
as wide as it really is), so every wall face is a named LINE and gets its real position in
one of two ways:

  measured  from a tape measurement in MEAS (the numbers handwritten on the plan), or
  drawing   from the perspective-corrected photo of the plan (PX_X / PX_Y pixels), scaled with
            the drawing's own px-per-inch, which is calibrated from the measurements.

Unmeasured lines are interpolated between the nearest measured lines in the same band of the
plan, so a measurement that stretches the drawing stretches the surrounding unmeasured parts
in proportion. To refine the model, add or correct an entry in MEAS and wire it into solve().

Units are real-world INCHES. x runs east (right on the plan), y runs south (down on the plan).
build.py flips y so the printed model reads like the brochure.
"""

# --------------------------------------------------------------------------------------------
# Tape measurements (handwritten on the brochure). a -> b along the axis, value in inches.
#   use: 'used'  -> places geometry
#        'check' -> not used to place anything; reported against the model as a cross-check
# --------------------------------------------------------------------------------------------
def ft(f, i=0.0):
    return 12 * f + i


MEAS = {
    # Bedroom 1 + foyer (left page)
    'bed1_w':        dict(axis='x', a='W_in', b='bed1_E', inches=ft(9, 3), use='used',
                          note="Bedroom 1 width, west wall to column/closet face (written along the window wall)"),
    'bed1_col':      dict(axis='y', a='N_in', b='cl1_stub1_bot', inches=ft(3, 11), use='used',
                          note="Bedroom 1 east wall, window wall to where the closet opening starts"),
    'bed1_d':        dict(axis='y', a='N_in', b='bed1_S_in', inches=ft(10, 2), use='used',
                          note="Bedroom 1 depth, window wall to south wall"),
    'bed1_s_wall':   dict(axis='x', a='W_in', b='bed1_S_end', inches=ft(5, 10), use='used',
                          note="Bedroom 1 south wall, bedroom side, west wall to door jamb"),
    'hall_n_wall':   dict(axis='x', a='W_in', b='stub_L', inches=ft(5, 4), use='used',
                          note="Same wall, foyer side, west wall to door-jamb return"),
    'door_return':   dict(axis='y', a='bed1_S_out', b='stub_bot', inches=10, use='used',
                          note="Bedroom 1 door-jamb return projecting into the hall"),
    'foyer_jamb':    dict(axis='y', a='bed1_S_out', b='entry_top', inches=ft(1, 5), use='used',
                          note="Foyer: bedroom 1 wall to entry-door opening"),
    'foyer_d':       dict(axis='y', a='bed1_S_out', b='hall_S', inches=ft(4, 9), use='used',
                          note="Foyer depth, bedroom 1 wall to foyer south wall"),
    'hall_w':        dict(axis='y', a='stub_bot', b='hall_S', inches=ft(3, 11), use='check',
                          note="Hall width, door-jamb return to W/D closet (= 4'9\" - 10\", so it's a cross-check)"),
    'closet_len':    dict(axis='y', a='closet_top', b='hall_S', inches=ft(3, 11), use='used',
                          note="Hall-facing side of the closet between the two baths"),
    # Living room (right page)
    'liv_win_w':     dict(axis='x', a='pen_E', b='col_L', inches=ft(8, 1.5), use='used',
                          note="Window wall: peninsula to column"),
    'liv_col':       dict(axis='x', a='col_L', b='col_R', inches=ft(2, 3.5), use='used',
                          note="Window-wall column width"),
    'liv_win_e':     dict(axis='x', a='col_R', b='E_in', inches=ft(5, 4), use='used',
                          note="Window wall: column to east windows"),
    'liv_e_win':     dict(axis='y', a='N_in', b='bump_N', inches=ft(8, 5), use='used',
                          note="East windows: north wall to the corner pier"),
    'liv_bump_d':    dict(axis='y', a='bump_N', b='liv_S', inches=ft(2, 2), use='used',
                          note="Corner pier depth"),
    'liv_bump_w':    dict(axis='x', a='bump_W', b='E_in', inches=ft(2, 8), use='used',
                          note="Corner pier width"),
    'liv_s_wall':    dict(axis='x', a='step_W', b='bump_W', inches=ft(9, 3), use='used',
                          note="Living-room south wall, corner to corner pier"),
    # Bedroom 2
    'bed2_w':        dict(axis='x', a='bed2_W_in', b='block_W', inches=ft(10, 4), use='used',
                          note="Bedroom 2 width, west wall to the SE pier"),
    'bed2_block_w':  dict(axis='x', a='block_W', b='E_in', inches=ft(1, 2), use='used',
                          note="Bedroom 2 SE pier projection"),
    'bed2_d':        dict(axis='y', a='bed2_N', b='bed2_S_in', inches=ft(9, 3), use='used',
                          note="Bedroom 2 depth"),
    'bed2_e_win':    dict(axis='y', a='bed2_N', b='block_top', inches=ft(7), use='used',
                          note="Bedroom 2 east wall: north wall to the SE pier"),
}
PENINSULA_HEIGHT = ft(3)   # measured ("3' tall")

# --------------------------------------------------------------------------------------------
# Line positions read off the perspective-corrected photo (pixels). FOLD = brochure crease;
# the right page photographs about 6% narrower horizontally, so x uses a scale per page.
# --------------------------------------------------------------------------------------------
FOLD = 1256
PX_X = {
    'W_out': 355, 'W_in': 389, 'wd_L_out': 542, 'bed1_win_L': 550, 'wd_L_in': 575, 'wd_door_L': 583,
    'stub_L': 652, 'bed1_S_end': 673, 'stub_R': 695, 'wd_door_R': 711, 'wd_R_in': 719,
    'bath1_W_out': 727, 'bath1_W_in': 760, 'bath1_door_L': 794, 'cl2_stub_L': 823, 'bed1_E': 849,
    'cl1_W_in': 870, 'cl2_door_L': 889, 'bath1_door_R': 922, 'cl1_E_in': 960, 'col_E': 980,
    'cl2_door_R': 1015, 'tub_L': 1027, 'cl2_E_in': 1063, 'counter': 1075, 'range_front': 1083, 'cl2_E_out': 1084,
    'fridge': 1100, 'kitwin_L': 1132, 'div_L': 1153, 'div_R': 1185, 'closet_W_out': 1244,
    'kitwin_R': 1248, 'pen_W': 1252, 'closet_W_in': 1263, 'shower_R': 1312, 'chase_R': 1320,
    'closet_E_in': 1379, 'closet_E_out': 1400, 'pen_E': 1415, 'hinge': 1422, 'livwin_L': 1473,
    'nub_L': 1545, 'step_W': 1565, 'bed2_W_out': 1572, 'step_E': 1586, 'bed2_W_in': 1593,
    'bath_E_out': 1605, 'livwin_R': 1665, 'col_L': 1711, 'col_R': 1923, 'livwin2_L': 1969, 'bump_W': 2002, 'block_W': 2062,
    'E_in': 2128, 'E_out': 2160,
}
PX_Y = {
    'N_out': 437, 'N_in': 466, 'range_top': 527, 'range_bot': 643, 'cl1_top': 631, 'cl1_stub1_bot': 661, 'fridge_top': 723,
    'pier_top': 813, 'fridge_bot': 840, 'pen_bot': 845, 'cl1_stub2_top': 856, 'bump_N': 878,
    'cl1_bot': 881, 'cl2_in_top': 902, 'bed1_S_in': 962, 'liv_S': 970, 'bed1_S_out': 981,
    'bed2_N': 990, 'dline_top': 996, 'stub_bot': 1017, 'closet_top': 1018, 'bed2_win_top': 1027,
    'vest_wall_bot': 1036, 'entry_top': 1047, 'closet_stub1_bot': 1062, 'closet_stub2_top': 1187,
    'entry_bot': 1195, 'hall_S': 1209.5, 'bath_top_in': 1229, 'foyer_S_out': 1242,
    'bed2_win_bot': 1312, 'block_top': 1329, 'wd_in_bot': 1374, 'wd_out_bot': 1407,
    'bed2_S_in': 1439, 'bed2_S_out': 1473, 'tub_end': 1473.5, 'bath_S_in': 1498.5, 'bath_S_out': 1530,
    'liv_col_bot': 530,
}
RIGHT_PAGE_N_IN = 473   # the north wall sits ~7px lower on the right page (crease distortion)


def _scales():
    """Drawing px-per-inch, calibrated from the 'used' measurements."""
    sums = {'xl': [0, 0], 'xr': [0, 0], 'y': [0, 0]}
    for m in MEAS.values():
        if m['use'] != 'used':
            continue
        px = PX_X if m['axis'] == 'x' else PX_Y
        pa, pb = px[m['a']], px[m['b']]
        if m['axis'] == 'y':
            k = 'y'
        else:
            k = 'xl' if max(pa, pb) <= FOLD else 'xr'
        sums[k][0] += abs(pb - pa)
        sums[k][1] += m['inches']
    return {k: p / i for k, (p, i) in sums.items()}


SCALE = _scales()


def nx(pa, pb):
    """Nominal inches between two x pixels, page-aware."""
    def cum(p):
        return p / SCALE['xl'] if p <= FOLD else FOLD / SCALE['xl'] + (p - FOLD) / SCALE['xr']
    return cum(pb) - cum(pa)


def ny(pa, pb):
    return (pb - pa) / SCALE['y']


# --------------------------------------------------------------------------------------------
# Solver: real position (inches) of every line, plus how it was obtained.
# --------------------------------------------------------------------------------------------
def solve():
    X, Y, how = {}, {}, {}
    m = {k: v['inches'] for k, v in MEAS.items()}

    def put(key):                       # place the unknown end of a measurement
        d = MEAS[key]
        D = X if d['axis'] == 'x' else Y
        a, b, v = d['a'], d['b'], d['inches']
        if a in D and b not in D:
            D[b] = D[a] + v
            how[d['axis'], b] = 'measured'
        elif b in D and a not in D:
            D[a] = D[b] - v
            how[d['axis'], a] = 'measured'
        else:
            raise ValueError(f'{key}: exactly one end must already be placed')

    def off(axis, name, ref, dpx=None):  # drawing offset from one placed line
        if axis == 'x':
            X[name] = X[ref] + nx(PX_X[ref], PX_X[name])
        else:
            Y[name] = Y[ref] + (ny(PX_Y[ref], PX_Y[name]) if dpx is None else dpx / SCALE['y'])
        how[axis, name] = 'drawing'

    def itp(axis, name, a, b):          # drawing proportions between two placed lines
        D, P, n = (X, PX_X, nx) if axis == 'x' else (Y, PX_Y, ny)
        t = n(P[a], P[name]) / n(P[a], P[b])
        D[name] = D[a] + t * (D[b] - D[a])
        how[axis, name] = 'drawing'

    # ---- X: left page, anchored at bedroom 1's west wall ----
    X['W_in'] = 0.0
    how['x', 'W_in'] = 'origin'
    for k in ('bed1_w', 'bed1_s_wall', 'hall_n_wall'):
        put(k)
    off('x', 'W_out', 'W_in')
    off('x', 'stub_R', 'bed1_S_end')

    # ---- X: east wall. Nothing measured spans the whole apartment, so the gap between the
    # bedroom-1 measurements and the living-room ones comes from the drawing, read along two
    # independent rows (window wall via the kitchen, and the hallway), then averaged.
    via_kitchen = X['bed1_E'] + nx(PX_X['bed1_E'], PX_X['pen_E']) + m['liv_win_w'] + m['liv_col'] + m['liv_win_e']
    via_hall = X['stub_L'] + nx(PX_X['stub_L'], PX_X['step_W']) + m['liv_s_wall'] + m['liv_bump_w']
    X['E_in'] = (via_kitchen + via_hall) / 2
    how['x', 'E_in'] = 'drawing (avg of 2 rows)'
    bridge = dict(via_kitchen=via_kitchen, via_hall=via_hall)
    for k in ('liv_win_e', 'liv_col', 'liv_win_w', 'liv_bump_w', 'liv_s_wall', 'bed2_block_w', 'bed2_w'):
        put(k)
    off('x', 'E_out', 'E_in')
    off('x', 'step_E', 'step_W')
    off('x', 'bed2_W_out', 'bed2_W_in')
    off('x', 'bath_E_out', 'bed2_W_in')

    # window-wall row (kitchen, closets, column): between bedroom 1 and the peninsula
    for n in ('cl1_W_in', 'cl1_E_in', 'col_E', 'cl2_door_L', 'cl2_door_R', 'cl2_E_in', 'counter',
              'range_front', 'cl2_E_out', 'fridge', 'kitwin_L', 'kitwin_R', 'pen_W'):
        itp('x', n, 'bed1_E', 'pen_E')
    itp('x', 'bed1_win_L', 'W_in', 'bed1_E')
    itp('x', 'livwin_L', 'pen_E', 'col_L')
    # photos (2026-10-15): the north windows stop short of the column; about 12" of wall each side (estimate)
    X['livwin_R'], X['livwin2_L'] = X['col_L'] - 12, X['col_R'] + 12
    how['x', 'livwin_R'] = how['x', 'livwin2_L'] = 'photo estimate'
    itp('x', 'cl2_stub_L', 'bed1_S_end', 'bed1_E')
    # hallway / bath row: between the foyer measurement and the living-room corner
    for n in ('wd_L_out', 'wd_L_in', 'wd_door_L'):
        itp('x', n, 'W_in', 'stub_L')
    for n in ('wd_door_R', 'wd_R_in', 'bath1_W_out', 'bath1_W_in', 'bath1_door_L', 'bath1_door_R',
              'tub_L', 'div_L', 'div_R', 'closet_W_out', 'closet_W_in', 'shower_R', 'chase_R',
              'closet_E_in', 'closet_E_out', 'hinge', 'nub_L'):
        itp('x', n, 'stub_L', 'step_W')

    # ---- Y: anchored at the north (window) wall ----
    Y['N_in'] = 0.0
    how['y', 'N_in'] = 'origin'
    off('y', 'N_out', 'N_in')
    put('bed1_d')
    off('y', 'bed1_S_out', 'bed1_S_in')
    for k in ('door_return', 'foyer_jamb', 'foyer_d', 'closet_len', 'liv_e_win', 'liv_bump_d'):
        put(k)
    off('y', 'bed2_N', 'liv_S')
    put('bed2_d')
    put('bed2_e_win')
    off('y', 'liv_col_bot', 'N_in', dpx=PX_Y['liv_col_bot'] - RIGHT_PAGE_N_IN)
    put('bed1_col')
    itp('y', 'cl1_top', 'N_in', 'cl1_stub1_bot')
    # range: centered where the brochure draws it, at a standard 30" width (photo: 30" slide-in range)
    itp('y', 'range_top', 'N_in', 'cl1_stub1_bot')
    itp('y', 'range_bot', 'N_in', 'cl1_stub1_bot')
    mid = (Y['range_top'] + Y['range_bot']) / 2
    Y['range_top'], Y['range_bot'] = mid - 15, mid + 15
    for n in ('fridge_top', 'fridge_bot', 'cl1_stub2_top', 'cl1_bot', 'cl2_in_top'):
        itp('y', n, 'cl1_stub1_bot', 'bed1_S_in')
    for n in ('pier_top', 'pen_bot'):
        itp('y', n, 'N_in', 'bump_N')
    itp('y', 'dline_top', 'bed1_S_out', 'stub_bot')
    itp('y', 'entry_bot', 'entry_top', 'hall_S')
    off('y', 'vest_wall_bot', 'closet_top')
    for n in ('closet_stub1_bot', 'closet_stub2_top'):
        itp('y', n, 'vest_wall_bot', 'hall_S')
    for n in ('bath_top_in', 'foyer_S_out', 'wd_in_bot', 'wd_out_bot'):
        off('y', n, 'hall_S')
    itp('y', 'bed2_win_top', 'bed2_N', 'block_top')
    off('y', 'bed2_win_bot', 'block_top')
    off('y', 'bed2_S_out', 'bed2_S_in')
    # bath depth isn't measured: average what the hall side and the bedroom-2 side imply
    Y['bath_S_in'] = (Y['hall_S'] + ny(PX_Y['hall_S'], PX_Y['bath_S_in'])
                      + Y['bed2_S_in'] + ny(PX_Y['bed2_S_in'], PX_Y['bath_S_in'])) / 2
    how['y', 'bath_S_in'] = 'drawing (avg of 2 sides)'
    off('y', 'bath_S_out', 'bath_S_in')
    off('y', 'tub_end', 'bath_S_in')

    missing = (set(PX_X) - set(X)) | (set(PX_Y) - set(Y))
    assert not missing, missing
    return X, Y, how, bridge


# --------------------------------------------------------------------------------------------
# Geometry, by line name. Rectangles are (x0, x1, y0, y1).
# --------------------------------------------------------------------------------------------
WALLS = [
    ('W_out', 'bed1_win_L', 'N_out', 'N_in'),            # north wall, bedroom 1
    ('bed1_E', 'col_E', 'N_out', 'cl1_top'),             # structural column, bedroom 1 | kitchen
    ('col_E', 'kitwin_L', 'N_out', 'N_in'),              # north wall, kitchen
    ('kitwin_R', 'livwin_L', 'N_out', 'N_in'),           # north wall, peninsula
    ('col_L', 'col_R', 'N_out', 'liv_col_bot'),          # living-room window-wall column
    ('livwin_R', 'col_L', 'N_out', 'N_in'),              # wall between the windows and the column (photos)
    ('col_R', 'livwin2_L', 'N_out', 'N_in'),
    ('W_out', 'W_in', 'N_in', 'entry_top'),              # west wall
    ('W_out', 'W_in', 'entry_bot', 'hall_S'),            # entry-door jamb
    ('W_in', 'bed1_S_end', 'bed1_S_in', 'bed1_S_out'),   # bedroom 1 south wall
    ('stub_L', 'bed1_S_end', 'bed1_S_out', 'stub_bot'),  # bedroom 1 door-jamb return
    ('bed1_S_end', 'stub_R', 'dline_top', 'stub_bot'),
    ('bed1_E', 'cl1_W_in', 'cl1_top', 'cl1_stub1_bot'),  # bedroom 1 closet jambs
    ('bed1_E', 'cl1_W_in', 'cl1_stub2_top', 'cl1_bot'),
    ('cl1_E_in', 'col_E', 'cl1_top', 'fridge_bot'),      # closet | kitchen wall
    ('cl1_E_in', 'cl2_E_out', 'fridge_bot', 'cl2_in_top'),
    ('bed1_E', 'cl2_E_out', 'cl1_bot', 'cl2_in_top'),    # hall closet
    ('bed1_E', 'cl1_W_in', 'cl2_in_top', 'dline_top'),
    ('cl2_E_in', 'cl2_E_out', 'cl2_in_top', 'dline_top'),
    ('cl2_stub_L', 'cl2_door_L', 'dline_top', 'stub_bot'),
    ('cl2_door_R', 'cl2_E_out', 'dline_top', 'stub_bot'),
    ('closet_W_out', 'hinge', 'closet_top', 'vest_wall_bot'),     # closet between the baths
    ('closet_W_out', 'closet_W_in', 'vest_wall_bot', 'hall_S'),
    ('closet_E_in', 'closet_E_out', 'vest_wall_bot', 'closet_stub1_bot'),
    ('closet_E_in', 'closet_E_out', 'closet_stub2_top', 'hall_S'),
    ('nub_L', 'step_E', 'closet_top', 'vest_wall_bot'),   # bedroom-2 suite door jamb
    ('step_W', 'step_E', 'liv_S', 'closet_top'),
    ('step_W', 'E_in', 'liv_S', 'bed2_N'),                # living | bedroom 2
    ('bump_W', 'E_in', 'bump_N', 'liv_S'),                # living-room corner pier
    ('E_in', 'E_out', 'pier_top', 'bed2_win_top'),        # east wall pier
    ('W_out', 'wd_L_in', 'hall_S', 'foyer_S_out'),        # foyer south wall
    ('wd_L_in', 'wd_door_L', 'hall_S', 'bath_top_in'),
    ('wd_L_out', 'wd_L_in', 'foyer_S_out', 'wd_out_bot'), # W/D closet
    ('wd_L_out', 'bath1_W_in', 'wd_in_bot', 'wd_out_bot'),
    ('wd_R_in', 'bath1_W_in', 'hall_S', 'wd_in_bot'),
    ('wd_door_R', 'bath1_door_L', 'hall_S', 'bath_top_in'),
    ('bath1_W_out', 'bath1_W_in', 'wd_out_bot', 'bath_S_in'),     # bath 1 west wall
    ('bath1_door_R', 'hinge', 'hall_S', 'bath_top_in'),           # bath north wall
    ('nub_L', 'bed2_W_in', 'hall_S', 'bath_top_in'),
    ('bed2_W_out', 'bed2_W_in', 'bath_top_in', 'bed2_S_in'),      # bath 2 | bedroom 2
    ('div_L', 'div_R', 'bath_top_in', 'bath_S_in'),               # bath 1 | bath 2
    ('bath1_W_out', 'bath_E_out', 'bath_S_in', 'bath_S_out'),     # bath south wall
    ('bed2_W_out', 'E_out', 'bed2_S_in', 'bed2_S_out'),           # bedroom 2 south wall
    ('bed2_W_out', 'bath_E_out', 'bed2_S_out', 'bath_S_in'),
    ('tub_L', 'chase_R', 'tub_end', 'bath_S_in'),                 # wet wall behind tub + shower
    ('block_W', 'E_out', 'block_top', 'bed2_S_in'),               # bedroom 2 SE pier
    ('E_in', 'E_out', 'bed2_win_bot', 'block_top'),
]

# kind 'sill': ordinary window. The user reports these fill the top 2/3-3/4 of the wall, so the real sill is
#              1/4-1/3 of the ceiling height. The model draws it at 1/3 of the CUT wall height (stylized).
# kind 'full': floor-to-ceiling glass (user, 2026-10-15), modeled as a thin curb marking the glass line
WINDOWS = [
    dict(rect=('bed1_win_L', 'bed1_E', 'N_out', 'N_in'), kind='sill', name='bedroom 1, north'),
    dict(rect=('kitwin_L', 'kitwin_R', 'N_out', 'N_in'), kind='sill', name='kitchen, north'),
    dict(rect=('livwin_L', 'livwin_R', 'N_out', 'N_in'), kind='sill', name='living, north, west of column'),
    dict(rect=('livwin2_L', 'E_in', 'N_out', 'N_in'), kind='sill', name='living, north, east of column'),
    dict(rect=('E_in', 'E_out', 'N_out', 'pier_top'), kind='full', name='living, east wall'),
    dict(rect=('E_in', 'E_out', 'bed2_win_top', 'bed2_win_bot'), kind='full', name='bedroom 2, east wall'),
]

ENTRY_OPENING = ('W_out', 'W_in', 'entry_top', 'entry_bot')

# Hinged doors: hinge point, closed-leaf tip, direction the door swings toward.
DOORS = [
    dict(name='entry', hinge=('W_in', 'entry_bot'), tip=('W_in', 'entry_top'), swing=(1, 0)),
    dict(name='bedroom 1', hinge=('cl2_stub_L', 'dline_top'), tip=('stub_R', 'dline_top'), swing=(0, -1)),
    dict(name='bedroom 2 suite', hinge=('hinge', 'vest_wall_bot'), tip=('nub_L', 'vest_wall_bot'), swing=(0, 1)),
]

# Sliding / pocket / bifold doors: a line across the opening (axis, fixed lines, span).
SLIDERS = [
    dict(name='bedroom 1 closet', x=('bed1_E', 'cl1_W_in'), y=('cl1_stub1_bot', 'cl1_stub2_top')),
    dict(name='hall closet', x=('cl2_door_L', 'cl2_door_R'), y=('dline_top', 'stub_bot')),
    dict(name='suite closet', x=('closet_E_in', 'closet_E_out'), y=('closet_stub1_bot', 'closet_stub2_top')),
    dict(name='W/D', x=('wd_door_L', 'wd_door_R'), y=('hall_S', 'bath_top_in')),
    dict(name='bath 1', x=('bath1_door_L', 'bath1_door_R'), y=('hall_S', 'bath_top_in')),
    dict(name='bath 2', x=('hinge', 'nub_L'), y=('hall_S', 'bath_top_in')),
]

# Built-ins. Rect is in drawing px (or line names), mapped proportionally inside `frame`
# (x0, x1, y0, y1 line names). Heights are real inches.
FIXTURES = [
    # Kitchen (from photos, 2026-10-15): base cabinets with doors facing the aisle, a 30" slide-in range flush
    # with the counter, a French-door fridge proud of the counter, and a peninsula with an undermount sink,
    # wood cabinet doors on the kitchen side and flat white panels on the end and living-room side.
    # Uppers and the over-range microwave sit above the 4' cut, so they're not modeled.
    dict(name='counter', rect=('col_E', 'counter', 'N_in', 'range_top'), h=36, kind='cabinets', front='E'),
    dict(name='range', rect=('col_E', 'range_front', 'range_top', 'range_bot'), h=36, kind='range', front='E'),
    dict(name='counter', rect=('col_E', 'counter', 'range_bot', 'fridge_top'), h=36, kind='cabinets', front='E'),
    dict(name='fridge', rect=('col_E', 'fridge', 'fridge_top', 'fridge_bot'), h=70, kind='fridge', front='E'),
    # The drawn (and measured-to) living-room edge is the countertop; it overhangs the cabinet block on that side
    # so stools tuck under ("a few inches", owner 2026-10-17; 4" assumed until measured).
    dict(name='peninsula', rect=('pen_W', 'pen_E', 'N_in', 'pen_bot'), h=PENINSULA_HEIGHT, kind='peninsula',
         front='W', sink=(1268, 1332, 610, 712),    # sink bowl in drawing px, mapped inside the peninsula
         overhang=dict(face='E', inches=4)),
    # Baths (from photos, 2026-10-15): identical vanities in both (two drawers, thin metal legs, white top,
    # undermount sink), an alcove tub with a white apron in the guest bath (faucet at the south end), a
    # frameless glass shower in the main bath. Mirrors, niche and shower rod are above the 4' cut.
    dict(name='tub', rect=('tub_L', 'div_L', 'bath_top_in', 'tub_end'), h=20, kind='tub', front='W'),
    dict(name='shower pan', rect=('div_R', 'shower_R', 'bath_top_in', 'tub_end'), h=2, kind='shower', glass='E'),
    dict(name='toilet 1 tank', rect=(794, 871, 1468, 1498.5), frame=('bath1_W_in', 'div_L', 'bath_top_in', 'bath_S_in'), h=29),
    dict(name='toilet 1 bowl', rect=(803, 862, 1386, 1470), frame=('bath1_W_in', 'div_L', 'bath_top_in', 'bath_S_in'), h=15,
         shape='oval', kind='toilet'),
    dict(name='vanity 1', rect=(912, 1021, 1404, 1498.5), frame=('bath1_W_in', 'div_L', 'bath_top_in', 'bath_S_in'), h=34,
         kind='vanity', front='N'),
    dict(name='vanity 2', rect=(1326, 1430, 1404, 1498.5), frame=('div_R', 'bed2_W_out', 'bath_top_in', 'bath_S_in'), h=34,
         kind='vanity', front='N'),
    dict(name='toilet 2 tank', rect=(1466, 1544, 1468, 1498.5), frame=('div_R', 'bed2_W_out', 'bath_top_in', 'bath_S_in'), h=29),
    dict(name='toilet 2 bowl', rect=(1475, 1535, 1386, 1470), frame=('div_R', 'bed2_W_out', 'bath_top_in', 'bath_S_in'), h=15,
         shape='oval', kind='toilet'),
    dict(name='washer/dryer', rect=(600, 693, 1253, 1347), frame=('wd_L_in', 'wd_R_in', 'hall_S', 'wd_in_bot'), h=76,
         kind='appliance'),
]

# Room labels for the 2D plan: label point (px) + the lines its headline size is taken from.
ROOMS = [
    dict(name='BEDROOM 1', at=(615, 715), size=('W_in', 'bed1_E', 'N_in', 'bed1_S_in')),
    dict(name='BEDROOM 2', at=(1830, 1200), size=('bed2_W_in', 'E_in', 'bed2_N', 'bed2_S_in')),
    dict(name='LIVING', at=(1760, 700), size=('pen_E', 'E_in', 'N_in', 'liv_S')),
    dict(name='KITCHEN', at=(1165, 700), size=None),
    dict(name='BATH 1', at=(905, 1300), size=('bath1_W_in', 'div_L', 'bath_top_in', 'bath_S_in')),
    dict(name='BATH 2', at=(1440, 1300), size=('div_R', 'bed2_W_out', 'bath_top_in', 'bath_S_in')),
    dict(name='FOYER', at=(560, 1080), size=None),
    dict(name='CL', at=(915, 730), size=('cl1_W_in', 'cl1_E_in', 'cl1_stub1_bot', 'cl1_stub2_top')),
    dict(name='CL', at=(967, 930), size=('cl1_W_in', 'cl2_E_in', 'cl2_in_top', 'dline_top')),
    dict(name='CL', at=(1320, 1100), size=('closet_W_in', 'closet_E_in', 'vest_wall_bot', 'hall_S')),
]
