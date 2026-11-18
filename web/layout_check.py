"""Validate that built-in furniture layouts leave useful walking and working space."""

import math

from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union


WALK_WIDTH = 30.0
ACCESS_WIDTH = 24.0
FIXTURE_CLEARANCE = {
    'cabinets': 30.0,
    'range': 30.0,
    'fridge': 33.0,
    'vanity': 21.0,
    'toilet': 21.0,
    'tub': 21.0,
    'appliance': 30.0,
}
ACCESS_SIDES = {
    'queen-bed': ('left', 'right'),
    'sectional': ('front',),
    'standing-desk': ('front',),
    'shoe-cabinet': ('front',),
    'hall-cabinet': ('front',),
    'arched-mirror': ('front',),
    'tier-shelf': ('front',),
    'coat-rack': ('around',),
}


def front_from(center, toward):
    """Return the compass side of ``center`` that faces ``toward``."""
    dx, dz = toward[0] - center[0], toward[1] - center[1]
    if abs(dx) >= abs(dz):
        return 'E' if dx > 0 else 'W'
    return 'S' if dz > 0 else 'N'


def piece_rects(furniture, piece, x, z, rotation):
    """Return each placed footprint rectangle as a world-space polygon."""
    spec = furniture[piece]
    angle = math.radians(rotation)
    cosine, sine = math.cos(angle), math.sin(angle)
    rectangles = spec.get('hits') or [spec['hit']]
    return [
        Polygon([
            (x + local_x * cosine + local_z * sine, z - local_x * sine + local_z * cosine)
            for local_x, local_z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))
        ])
        for x0, x1, z0, z1 in rectangles
    ]


def placed_rect(x, z, rotation, rectangle):
    """Place a local access rectangle in world coordinates."""
    angle = math.radians(rotation)
    cosine, sine = math.cos(angle), math.sin(angle)
    x0, x1, z0, z1 = rectangle
    return Polygon([
        (x + local_x * cosine + local_z * sine, z - local_x * sine + local_z * cosine)
        for local_x, local_z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))
    ])


def door_swing(door):
    """Build a polygon covering the complete hinged door sweep."""
    hinge_x, hinge_z = door['hinge']
    start = math.atan2(door['closed'][1] - hinge_z, door['closed'][0] - hinge_x)
    delta = math.atan2(door['open'][1] - hinge_z, door['open'][0] - hinge_x) - start
    delta = (delta + math.pi) % (2 * math.pi) - math.pi
    return Polygon(
        [(hinge_x, hinge_z)]
        + [
            (
                hinge_x + door['r'] * math.cos(start + delta * step / 16),
                hinge_z + door['r'] * math.sin(start + delta * step / 16),
            )
            for step in range(17)
        ]
    )


class WalkCheck:
    """Check door swings, fixture clearances, 30-inch routes, and local furniture access."""

    def __init__(self, plan, plan_data, furniture):
        self.furniture = furniture
        self.base = plan.footprint().difference(unary_union(
            plan.walls() + [geometry for _, geometry in plan.fixtures()]
            + [geometry for _, geometry in plan.windows()]
        ))
        self.door_swings = [(door['name'], door_swing(door)) for door in plan_data['doors']]
        self.fixture_zones = []

        targets = []
        fixtures = list(plan.fixtures())
        tank = next((geometry.bounds for fixture, geometry in fixtures if 'tank' in fixture['name']), None)
        hinges = {door['name']: door['hinge'] for door in plan_data['doors']}
        for fixture, geometry in fixtures:
            kind = fixture.get('kind')
            if kind not in FIXTURE_CLEARANCE:
                continue

            x0, z0, x1, z1 = geometry.bounds
            center = ((x0 + x1) / 2, (z0 + z1) / 2)
            front = fixture.get('front')
            if kind == 'toilet' and tank:
                tank_center = ((tank[0] + tank[2]) / 2, (tank[1] + tank[3]) / 2)
                front = opposite(front_from(center, tank_center))
            if kind == 'appliance' and not front:
                front = front_from(center, hinges.get('W/D', center))

            clearance = FIXTURE_CLEARANCE[kind]
            zone = {
                'E': box(x1, z0, x1 + clearance, z1),
                'W': box(x0 - clearance, z0, x0, z1),
                'N': box(x0, z0 - clearance, x1, z0),
                'S': box(x0, z1, x1, z1 + clearance),
            }[front].intersection(self.base)
            self.fixture_zones.append((fixture['name'], zone))
            targets.append((f'the {fixture["name"]}', zone))

        for door in plan_data['doors']:
            add_door_targets(targets, door)
        for path in plan_data['sliders']:
            add_slider_targets(targets, path)

        entry = next(door for door in plan_data['doors'] if door['name'] == 'entry')
        self.entry = Point(entry['hinge'][0] - 19, entry['hinge'][1] - 20)
        empty_reach = self._reachable(self.base)
        self.targets = [(name, target) for name, target in targets
                        if empty_reach is not None and target.intersects(empty_reach)]

    def _reachable(self, free_space, radius=WALK_WIDTH / 2):
        core = free_space.buffer(-radius)
        parts = [core] if core.geom_type == 'Polygon' else list(getattr(core, 'geoms', []))
        near_entry = [part for part in parts if part.distance(self.entry) < radius]
        return min(near_entry, key=lambda part: part.distance(self.entry)) if near_entry else None

    def problems(self, items):
        """Return human-readable circulation problems for one furniture layout."""
        problems, solid_rectangles = [], []
        for piece, x, z, rotation in items:
            spec = self.furniture[piece]
            if spec.get('flat'):
                continue

            rectangles = piece_rects(self.furniture, piece, x, z, rotation)
            if not spec.get('seat'):
                solid_rectangles.extend(rectangles)

            for name, swing in self.door_swings:
                if any(rectangle.intersection(swing).area > 1.0 for rectangle in rectangles):
                    problems.append(f'{spec["name"]} blocks the {name} door swing')

            for name, zone in self.fixture_zones:
                if spec.get('seat') and name == 'counter':
                    continue
                if any(rectangle.intersection(zone).area > 1.0 for rectangle in rectangles):
                    problems.append(f'{spec["name"]} is in front of the {name}')

        free_space = (self.base.difference(unary_union(solid_rectangles))
                      if solid_rectangles else self.base)
        walkable = self._reachable(free_space)
        if walkable is None:
            return problems + [f'no {WALK_WIDTH:g}" path from the entry']

        for name, target in self.targets:
            if not target.intersects(walkable):
                problems.append(f'no {WALK_WIDTH:g}" path to {name}')

        local_access = self._reachable(free_space, ACCESS_WIDTH / 2)
        for piece, x, z, rotation in items:
            if piece not in ACCESS_SIDES:
                continue
            spec = self.furniture[piece]
            width, depth = spec['size'][:2]
            access = {
                'front': (-width * 0.35, width * 0.35, depth / 2 + 1,
                          depth / 2 + 1 + ACCESS_WIDTH),
                'left': (-width / 2 - 1 - ACCESS_WIDTH, -width / 2 - 1,
                         -depth * 0.25, depth * 0.25),
                'right': (width / 2 + 1, width / 2 + 1 + ACCESS_WIDTH,
                          -depth * 0.25, depth * 0.25),
                'around': (-width / 2 - ACCESS_WIDTH, width / 2 + ACCESS_WIDTH,
                           -depth / 2 - ACCESS_WIDTH, depth / 2 + ACCESS_WIDTH),
            }
            for side in ACCESS_SIDES[piece]:
                target = placed_rect(x, z, rotation, access[side])
                if local_access is None or not target.intersects(local_access):
                    location = spec['name'].lower()
                    problems.append(f'no {ACCESS_WIDTH:g}" access to {location}'
                                    if side == 'around'
                                    else f'no {ACCESS_WIDTH:g}" access to the {side} of {location}')

        return sorted(set(problems))


def opposite(side):
    """Return the compass side opposite ``side``."""
    return {'E': 'W', 'W': 'E', 'N': 'S', 'S': 'N'}[side]


def add_door_targets(targets, door):
    """Add points on both sides of a hinged door to the accessibility targets."""
    hinge_x, hinge_z = door['hinge']
    closed_x, closed_z = door['closed']
    length = math.hypot(closed_x - hinge_x, closed_z - hinge_z) or 1
    middle_x, middle_z = (hinge_x + closed_x) / 2, (hinge_z + closed_z) / 2
    normal_x, normal_z = -(closed_z - hinge_z) / length, (closed_x - hinge_x) / length
    for sign in (1, -1):
        target = Point(middle_x + sign * 20 * normal_x, middle_z + sign * 20 * normal_z).buffer(4)
        targets.append((f'the {door["name"]} door', target))


def add_slider_targets(targets, path):
    """Add points on both sides of a closet slider to the accessibility targets."""
    (start_x, start_z), (end_x, end_z) = path[0], path[-1]
    length = math.hypot(end_x - start_x, end_z - start_z) or 1
    middle_x, middle_z = (start_x + end_x) / 2, (start_z + end_z) / 2
    normal_x, normal_z = -(end_z - start_z) / length, (end_x - start_x) / length
    for sign in (1, -1):
        target = Point(middle_x + sign * 20 * normal_x, middle_z + sign * 20 * normal_z).buffer(4)
        targets.append(('the closet slider', target))
