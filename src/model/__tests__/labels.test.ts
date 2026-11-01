import { describe, expect, it } from "vitest";

import { bucketLabel } from "../labels";
import type { Bucket } from "../types";
import { d } from "./fixtures";

const week = (start: Date): Bucket => ({ key: "", kind: "week", weekStart: start, rowIndices: [], inserted: false });
const context = {
    formatDate: (date: Date) => `${date.getDate()}/${date.getMonth() + 1}`,
    weekPrefix: "W",
    blankLabel: "(Blank)",
};

describe("bucketLabel", () => {
    it("formats week buckets as the week start date (default)", () => {
        expect(bucketLabel(week(d(2026, 2, 2)), 0, "weekStart", context)).toBe("2/2");
    });

    it("formats week buckets as ISO weeks", () => {
        expect(bucketLabel(week(d(2026, 2, 2)), 0, "isoWeek", context)).toBe("2026-W06");
        expect(bucketLabel(week(d(2026, 12, 28)), 0, "isoWeek", context)).toBe("2026-W53");
    });

    it("formats week buckets as project weeks counted from the first bucket", () => {
        expect(bucketLabel(week(d(2026, 2, 2)), 0, "projectWeek", context)).toBe("W1");
        expect(bucketLabel(week(d(2026, 2, 23)), 3, "projectWeek", context)).toBe("W4");
    });

    it("shows text buckets as text, with a label for blanks", () => {
        const text = (value: unknown): Bucket => ({ key: String(value), kind: "text", value, rowIndices: [0], inserted: false });
        expect(bucketLabel(text("Week 7"), 0, "weekStart", context)).toBe("Week 7");
        expect(bucketLabel(text(12), 0, "weekStart", context)).toBe("12");
        expect(bucketLabel(text(null), 0, "weekStart", context)).toBe("(Blank)");
    });
});
