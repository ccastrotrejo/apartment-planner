import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from web import export_web  # noqa: E402
import build  # noqa: E402
import furniture  # noqa: E402


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
            'bike-red-wall': [(116.3, 100, -90)],
        })
        self.assertTrue(self.checker.problems(bad_layout))

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
