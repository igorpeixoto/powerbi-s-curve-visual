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

/**
 * The reference rounded down to a power of ten. Every auto unit boundary is one (K from 1e3, M from 1e5, bn from
 * 1e8, T from 1e11), so the unit chosen is the same, and a matrix abbreviating each cell by its own value doesn't
 * add a formatter per distinct value.
 */
export function autoUnitReference(reference: number): number {
    const magnitude = Math.abs(reference);
    if (!Number.isFinite(magnitude) || magnitude < 1) return 0;
    let exponent = Math.floor(Math.log10(magnitude));
    // log10 can land just off an exact power of ten.
    if (10 ** exponent > magnitude) exponent -= 1;
    else if (10 ** (exponent + 1) <= magnitude) exponent += 1;
    // The formatter counts a value within three significant digits of a boundary as on it (999.9999 shows as 1K).
    if (10 ** (exponent + 1) - magnitude < 10 ** (exponent - 3)) exponent += 1;
    return 10 ** exponent;
}

export class Formatters {
    private readonly cache = new Map<string, NumberFormatter>();

    constructor(private readonly locale: string) {}

    number(format: string | undefined, units: UnitOptions): NumberFormatter {
        const reference = units.displayUnits === 0 ? autoUnitReference(units.reference ?? 0) : undefined;
        const cacheKey = `${format}|${units.displayUnits}|${units.precision}|${reference}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
        const formatter = valueFormatter.create({
            format: format ?? "#,0.##",
            value: reference ?? (units.displayUnits === 1 ? 0 : units.displayUnits),
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
