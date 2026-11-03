import { describe, expect, it, vi } from "vitest";

// The real library can't load under Node (extensionless ES module imports), so record what each formatter is built for.
const created = vi.hoisted(() => [] as { value?: number }[]);
vi.mock("powerbi-visuals-utils-formattingutils", () => ({
    valueFormatter: {
        create: (options: { value?: number }) => {
            created.push(options);
            return { format: (value: number) => String(value) };
        },
    },
}));

import { autoUnitReference, Formatters } from "../format";

describe("Formatters", () => {
    it("rounds an auto-unit reference down to a power of ten, the only places the unit changes (K 1e3, M 1e5, bn 1e8, T 1e11)", () => {
        expect([0, 0.5, 1, 999, 1000, 99_000, 100_000, 150_000, 98_000_000, 1e8, 1e11, -2500].map(autoUnitReference))
            .toEqual([0, 0, 1, 100, 1000, 10_000, 100_000, 100_000, 10_000_000, 1e8, 1e11, 1000]);
    });

    it("counts a value within three significant digits below a boundary as on it, as the formatter does", () => {
        expect([999.9999, 99_999, 99_999_999].map(autoUnitReference)).toEqual([1000, 100_000, 1e8]);
    });

    it("builds one auto-unit formatter per magnitude, not per value", () => {
        created.length = 0;
        const formatters = new Formatters("en-US");
        for (let value = 1; value < 5000; value += 1) formatters.number("#,0", { displayUnits: 0, reference: value * 137 });
        expect(created.length).toBeLessThanOrEqual(8);
        expect(created.every((options) => options.value === autoUnitReference(options.value ?? 0))).toBe(true);
    });

    it("keeps fixed units and no units as before", () => {
        created.length = 0;
        const formatters = new Formatters("en-US");
        formatters.number("#,0", { displayUnits: 1, reference: 123_456 });
        formatters.number("#,0", { displayUnits: 1e6, reference: 42 });
        expect(created.map((options) => options.value)).toEqual([0, 1e6]);
    });
});
