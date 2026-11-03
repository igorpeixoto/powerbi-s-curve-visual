// Number and date formatting through Power BI's value formatter, in the host locale, with each measure's own
// format string (SPEC §10). Never hand-rolled separators.
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

export type NumberFormatter = (value: number | null) => string;

export interface UnitOptions {
    /** 0 = auto (units chosen from `reference`), 1 = none, otherwise the unit (1e3, 1e6, …). */
    displayUnits: number;
    precision?: number;
    /** Magnitude auto units are chosen for, e.g. the axis maximum. */
    reference?: number;
}

export class Formatters {
    private readonly cache = new Map<string, NumberFormatter>();

    constructor(private readonly locale: string) {}

    number(format: string | undefined, units: UnitOptions): NumberFormatter {
        const cacheKey = `${format}|${units.displayUnits}|${units.precision}|${units.reference}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
        const formatter = valueFormatter.create({
            format: format ?? "#,0.##",
            value: units.displayUnits === 0 ? Math.abs(units.reference ?? 0) : units.displayUnits === 1 ? 0 : units.displayUnits,
            precision: units.precision,
            cultureSelector: this.locale,
        });
        const fn: NumberFormatter = (value) => (value === null ? "" : formatter.format(value));
        this.cache.set(cacheKey, fn);
        return fn;
    }

    percent(precision = 0): NumberFormatter {
        return this.number(precision > 0 ? `0.${"0".repeat(precision)}%` : "0%", { displayUnits: 1 });
    }

    /**
     * A category or series value in its column's format; `blankLabel` when empty. Without a format, a number keeps all
     * its digits and no thousands separator, so a year stays a year, and a date is a short date.
     */
    value(value: unknown, format: string | undefined, blankLabel = ""): string {
        if (value === null || value === undefined) return blankLabel;
        if (typeof value === "number") return this.number(format ?? "0.##########", { displayUnits: 1 })(value);
        if (value instanceof Date) return valueFormatter.format(value, format ?? "d", false, this.locale);
        return String(value);
    }

    shortDate(date: Date): string {
        return valueFormatter.format(date, "d", false, this.locale);
    }
}
