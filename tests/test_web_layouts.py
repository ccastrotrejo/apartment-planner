import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from web import export_web  # noqa: E402
import build  # noqa: E402
import furniture  # noqa: E402
from web.layout_check import piece_rects  # noqa: E402


class WalkCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = build.Plan()
        cls.furniture = export_web.furniture_meshes()
        cls.checker = export_web.WalkCheck(
            cls.plan,
            export_web.plan_data(cls.plan),
            cls.furniture,
        )

    def assert_layout_is_walkable(self, items):
        problems = self.checker.problems(items)
        self.assertEqual([], problems, '\n'.join(problems))

    def test_standard_and_published_alternatives_are_walkable(self):
        self.assert_layout_is_walkable(export_web.EXAMPLE)
        self.assert_layout_is_walkable(export_web.idea_items(export_web.GUEST))
        for name, _, moves in export_web.IDEAS:
            with self.subTest(layout=name):
                self.assert_layout_is_walkable(export_web.idea_items(moves))

    def test_blocks_layout_that_puts_the_tv_at_the_foot_of_the_bed(self):
        bad_layout = export_web.idea_items({
            'tv-stand': [(141.7, 60, 90)],
        })
        self.assertTrue(self.checker.problems(bad_layout))

    def test_red_wall_bike_is_removed_from_the_planner(self):
        self.assertNotIn('bike-red-wall', furniture.FURNITURE)
        self.assertNotIn('bike-red-wall', furniture.BUILDERS)
        self.assertNotIn('bike-red-wall', furniture.WEB_ONLY)
        self.assertNotIn('bike-red-wall', export_web.PIECES)
        self.assertNotIn('bike-red-wall', {item[0] for item in export_web.EXAMPLE})
        for _, _, moves in export_web.IDEAS:
            self.assertNotIn('bike-red-wall', moves)
        old_layout = [['bike-red-wall', 116.25, 310, -90], ['bike-black', 48, 182, 180]]
        self.assertEqual([['bike-black', 232.6, 62.9, -90]], export_web.current_layout_items(old_layout))

    def test_default_wall_mount_placements_are_migrated_without_resetting_other_items(self):
        items = [['tv-stand', 121, 104, -90], ['bike-black', 48, 182, 180],
                 ['nightstand', 233.85, 22.2, -90], ['bike-black', 200, 100, 180]]
        self.assertEqual(
            [['tv-stand', 127.2, 104, -90], ['bike-black', 232.6, 62.9, -90], *items[2:]],
            export_web.current_layout_items(items),
        )

    def test_tv_is_wall_mounted_in_web_but_printable_stand_is_retained(self):
        scale = 25.4 / export_web.SCALE
        spec = furniture.FURNITURE['tv-stand']
        print_stand = furniture.BUILDERS['tv-stand'](spec, scale, parts=False)
        web_tv = furniture.BUILDERS['tv-stand'](spec, scale, parts=True)
        self.assertAlmostEqual(0, print_stand.bounding_box()[2])
        self.assertEqual(['tv', 'metal'], [part for part, _ in web_tv])
        for _, mesh in web_tv:
            self.assertEqual('NoError', str(mesh.status()).rsplit('.', 1)[-1])
            self.assertGreater(mesh.bounding_box()[2] / scale, 24)
        self.assertEqual([57.1, 3.4, 60.4], self.furniture['tv-stand']['size'])

    def test_bedroom_bike_clears_the_bed_and_stays_inside_the_wall(self):
        bike = self.furniture['bike-black']
        bed = self.furniture['queen-bed']
        self.assertGreater(bike['minY'], bed['size'][2])
        placement = next(item for item in export_web.EXAMPLE if item[0] == 'bike-black')
        for rect in piece_rects(self.furniture, *placement):
            self.assertLessEqual(rect.bounds[2], self.plan.X['bed_E'])
            self.assertGreaterEqual(rect.bounds[1], self.plan.Y['cap_bot'])
            self.assertLessEqual(rect.bounds[3], self.plan.Y['bed_S'])

    def test_black_bike_is_wall_mounted_only_in_the_web_view(self):
        scale = 25.4 / export_web.SCALE
        spec = furniture.FURNITURE['bike-black']
        print_bike = furniture.BUILDERS['bike-black'](spec, scale, parts=False)
        web_bike = furniture.BUILDERS['bike-black'](spec, scale, parts=True)

        self.assertEqual('NoError', str(print_bike.status()).rsplit('.', 1)[-1])
        self.assertAlmostEqual(0, print_bike.bounding_box()[2])
        self.assertIn('rack', [part for part, _ in web_bike])


if __name__ == '__main__':
    unittest.main()
