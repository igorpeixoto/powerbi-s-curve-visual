#!/usr/bin/env python3
"""Generate the sample data for the Physical Progress S-Curve visual.

The data describes a fictional EPC (engineering, procurement and construction) project: weekly planned and actual
man-hours per discipline. Every number is made up by the model below; none comes from a real project.

The model
---------
Planned values. Each discipline has a budget of hours and a window of the project in which it works. Its planned
progress follows a logistic S-curve over that window, F(x) = 1 / (1 + exp(-k * (x - 0.5))) for x from 0 to 1, rescaled
so it runs exactly from 0 to 1. Disciplines overlap, starting with Civil and ending with Instrumentation, so the total
is also S-shaped. Cumulative hours are rounded before taking differences, so each discipline's weekly hours add up to
exactly its budget.

Actual values. Each discipline's actual hours in a week are what it planned a little earlier (its lag), multiplied by
random noise, so actuals trail the plan. Over the last few reported weeks a taper reduces them further, so the
cumulative actual curve flattens as it reaches the status week. Weeks from the status week on have not been reported
yet: their actual hours are empty, not zero.

Output
------
A CSV with one row per week and discipline, and these columns:

    WeekStart     Monday of the week, as YYYY-MM-DD
    Discipline    Civil, Mechanical, Electrical or Instrumentation
    PlannedHours  planned man-hours in that week
    ActualHours   actual man-hours in that week; empty if not reported yet

The same arguments and seed always produce the same file. samples/data/epc_progress.csv is the output with the defaults.

Usage
-----
    python tools/generate_sample_data.py
    python tools/generate_sample_data.py --seed 7 --weeks 26 --status-week 18 --output my_project.csv
"""

import argparse
import csv
import datetime as dt
import math
import pathlib
import random
import sys
from typing import NamedTuple, Optional, TextIO

DEFAULT_OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "samples" / "data" / "epc_progress.csv"
COLUMNS = ("WeekStart", "Discipline", "PlannedHours", "ActualHours")
STEEPNESS = 8.0
NOISE = 0.12
# Multiplies actual hours in the last reported weeks, from the third-to-last to the last.
TAPER = (0.7, 0.45, 0.25)


class Discipline(NamedTuple):
    name: str
    budget_hours: int
    # The part of the project this discipline works in, as fractions of its duration.
    window_start: float
    window_end: float
    lag_weeks: int


DISCIPLINES = (
    Discipline("Civil", 12000, 0.00, 0.60, 1),
    Discipline("Mechanical", 16000, 0.20, 0.80, 2),
    Discipline("Electrical", 9000, 0.40, 0.90, 1),
    Discipline("Instrumentation", 5000, 0.55, 1.00, 2),
)


def logistic_progress(x: float) -> float:
    """Share of the work done at x, the share of the window elapsed: exactly 0 at x <= 0 and 1 at x >= 1."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    raw = lambda value: 1 / (1 + math.exp(-STEEPNESS * (value - 0.5)))
    return (raw(x) - raw(0)) / (raw(1) - raw(0))


def planned_hours(discipline: Discipline, weeks: int) -> list[int]:
    """Planned hours per week. They add up to the budget exactly."""
    start = discipline.window_start * weeks
    length = (discipline.window_end - discipline.window_start) * weeks
    cumulative = [round(discipline.budget_hours * logistic_progress((week - start) / length)) for week in range(weeks + 1)]
    return [cumulative[week + 1] - cumulative[week] for week in range(weeks)]


def actual_hours(discipline: Discipline, planned: list[int], status_week: int, rng: random.Random) -> list[Optional[int]]:
    """Actual hours per week: lagged plan, noise and taper. None from the status week on."""
    actual: list[Optional[int]] = []
    for week in range(len(planned)):
        if week >= status_week:
            actual.append(None)
            continue
        lagged = planned[week - discipline.lag_weeks] if week >= discipline.lag_weeks else 0
        # Always draw, so a discipline's noise doesn't depend on how many weeks it has been idle.
        noise = rng.uniform(1 - NOISE, 1 + NOISE)
        weeks_before_status = status_week - week
        taper = TAPER[-weeks_before_status] if weeks_before_status <= len(TAPER) else 1.0
        actual.append(round(lagged * noise * taper))
    return actual


def generate_rows(seed: int, weeks: int, status_week: int, start: dt.date) -> list[tuple[str, str, int, Optional[int]]]:
    """All rows, by week and then discipline."""
    rng = random.Random(seed)
    by_discipline = []
    for discipline in DISCIPLINES:
        planned = planned_hours(discipline, weeks)
        by_discipline.append((discipline.name, planned, actual_hours(discipline, planned, status_week, rng)))
    return [
        ((start + dt.timedelta(weeks=week)).isoformat(), name, planned[week], actual[week])
        for week in range(weeks)
        for name, planned, actual in by_discipline
    ]


def write_csv(rows: list[tuple[str, str, int, Optional[int]]], stream: TextIO) -> None:
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(COLUMNS)
    for week_start, name, planned, actual in rows:
        writer.writerow((week_start, name, planned, "" if actual is None else actual))


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate weekly planned and actual man-hours for a fictional EPC project.")
    parser.add_argument("--seed", type=int, default=42, help="random seed for the noise in actuals (default: %(default)s)")
    parser.add_argument("--weeks", type=int, default=20, help="project length in weeks (default: %(default)s)")
    parser.add_argument("--status-week", type=int, default=14, help="number of weeks with actuals reported (default: %(default)s)")
    parser.add_argument("--start", type=dt.date.fromisoformat, default=dt.date(2026, 1, 5), help="first week's Monday, as YYYY-MM-DD (default: %(default)s)")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="file to write, or - for standard output (default: samples/data/epc_progress.csv)")
    args = parser.parse_args(argv)
    if args.weeks < 2:
        parser.error("--weeks must be at least 2")
    if not 0 <= args.status_week <= args.weeks:
        parser.error("--status-week must be between 0 and --weeks")
    if args.start.weekday() != 0:
        parser.error("--start must be a Monday")
    return args


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    rows = generate_rows(args.seed, args.weeks, args.status_week, args.start)
    if args.output == "-":
        write_csv(rows, sys.stdout)
        return 0
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as stream:
        write_csv(rows, stream)
    print(f"Wrote {len(rows)} rows to {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
