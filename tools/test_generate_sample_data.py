"""Tests for generate_sample_data.py. Run with: python -m unittest discover -s tools -p "test_*.py"."""

import datetime as dt
import io
import pathlib
import random
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import generate_sample_data as sample  # noqa: E402

START = dt.date(2026, 1, 5)


def rows_for(seed=42, weeks=20, status_week=14):
    return sample.generate_rows(seed, weeks, status_week, START)


def csv_text(rows):
    stream = io.StringIO()
    sample.write_csv(rows, stream)
    return stream.getvalue()


def weekly_totals(rows, column):
    totals = {}
    for row in rows:
        if row[column] is not None:
            totals[row[0]] = totals.get(row[0], 0) + row[column]
    return [totals[week] for week in sorted(totals)]


class LogisticProgress(unittest.TestCase):
    def test_runs_from_zero_to_one(self):
        self.assertEqual(sample.logistic_progress(-1), 0)
        self.assertEqual(sample.logistic_progress(0), 0)
        self.assertEqual(sample.logistic_progress(1), 1)
        self.assertEqual(sample.logistic_progress(2), 1)
        self.assertAlmostEqual(sample.logistic_progress(0.5), 0.5)

    def test_is_s_shaped(self):
        steps = [sample.logistic_progress((i + 1) / 10) - sample.logistic_progress(i / 10) for i in range(10)]
        self.assertTrue(all(step > 0 for step in steps))
        self.assertGreater(steps[5], steps[1])
        self.assertGreater(steps[4], steps[8])


class PlannedHours(unittest.TestCase):
    def test_each_discipline_adds_up_to_its_budget_at_any_length(self):
        for weeks in (2, 13, 20, 52):
            for discipline in sample.DISCIPLINES:
                planned = sample.planned_hours(discipline, weeks)
                self.assertEqual(len(planned), weeks)
                self.assertEqual(sum(planned), discipline.budget_hours, (discipline.name, weeks))
                self.assertTrue(all(value >= 0 for value in planned))

    def test_the_total_is_s_shaped(self):
        totals = weekly_totals(rows_for(), 2)
        peak = totals.index(max(totals))
        self.assertTrue(5 <= peak <= 14, peak)
        self.assertLess(totals[0], max(totals) / 3)
        self.assertLess(totals[-1], max(totals) / 3)


class ActualHours(unittest.TestCase):
    def test_empty_from_the_status_week_on_and_reported_before(self):
        rows = rows_for(status_week=14)
        for row in rows:
            week = (dt.date.fromisoformat(row[0]) - START).days // 7
            if week >= 14:
                self.assertIsNone(row[3], row)
            else:
                self.assertIsNotNone(row[3], row)

    def test_lag_behind_the_plan_for_any_seed(self):
        for seed in range(25):
            rows = rows_for(seed=seed)
            planned = sum(weekly_totals(rows, 2)[:14])
            actual = sum(weekly_totals(rows, 3))
            self.assertLess(actual, planned, seed)

    def test_flatten_before_the_status_week_for_any_seed(self):
        for seed in range(25):
            actual = weekly_totals(rows_for(seed=seed), 3)
            self.assertLess(sum(actual[-3:]), sum(actual[-6:-3]), seed)

    def test_a_status_week_of_zero_reports_nothing(self):
        self.assertTrue(all(row[3] is None for row in rows_for(status_week=0)))

    def test_noise_is_applied(self):
        discipline = sample.DISCIPLINES[0]
        planned = sample.planned_hours(discipline, 20)
        first = sample.actual_hours(discipline, planned, 14, random.Random(1))
        second = sample.actual_hours(discipline, planned, 14, random.Random(2))
        self.assertNotEqual(first, second)


class Output(unittest.TestCase):
    def test_same_seed_same_file(self):
        self.assertEqual(csv_text(rows_for(seed=7)), csv_text(rows_for(seed=7)))

    def test_different_seed_different_file(self):
        self.assertNotEqual(csv_text(rows_for(seed=7)), csv_text(rows_for(seed=8)))

    def test_one_row_per_week_and_discipline_on_mondays(self):
        rows = rows_for()
        self.assertEqual(len(rows), 20 * len(sample.DISCIPLINES))
        self.assertEqual(len({(row[0], row[1]) for row in rows}), len(rows))
        self.assertEqual({row[1] for row in rows}, {"Civil", "Mechanical", "Electrical", "Instrumentation"})
        self.assertTrue(all(dt.date.fromisoformat(row[0]).weekday() == 0 for row in rows))

    def test_csv_has_english_columns_and_empty_unreported_actuals(self):
        lines = csv_text(rows_for()).splitlines()
        self.assertEqual(lines[0], "WeekStart,Discipline,PlannedHours,ActualHours")
        self.assertTrue(lines[1].startswith("2026-01-05,Civil,"))
        self.assertTrue(lines[-1].startswith("2026-05-18,Instrumentation,"))
        self.assertTrue(lines[-1].endswith(","))

    def test_committed_sample_matches_the_generator_defaults(self):
        committed = sample.DEFAULT_OUTPUT.read_text(encoding="utf-8")
        self.assertEqual(committed, csv_text(rows_for()))


class Arguments(unittest.TestCase):
    def test_rejects_bad_values(self):
        for argv in (["--weeks", "1"], ["--status-week", "21"], ["--status-week", "-1"], ["--start", "2026-01-06"]):
            with self.assertRaises(SystemExit, msg=argv):
                stderr, sys.stderr = sys.stderr, io.StringIO()
                try:
                    sample.parse_args(argv)
                finally:
                    sys.stderr = stderr

    def test_uses_the_documented_defaults(self):
        args = sample.parse_args([])
        self.assertEqual((args.seed, args.weeks, args.status_week, args.start), (42, 20, 14, START))


if __name__ == "__main__":
    unittest.main()
