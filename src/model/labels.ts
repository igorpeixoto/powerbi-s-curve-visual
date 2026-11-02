import type { Bucket } from "./types";
import { addDays, isoWeek } from "./weeks";

export type WeekLabelFormat = "weekStart" | "isoWeek" | "projectWeek";

export interface LabelContext {
    /** Short date in the report locale (supplied by the host's value formatter). */
    formatDate: (date: Date) => string;
    /** Localised prefix for project weeks, e.g. "W". */
    weekPrefix: string;
    /** Localised label for a blank text bucket. */
    blankLabel: string;
}

export function bucketLabel(bucket: Bucket, index: number, format: WeekLabelFormat, context: LabelContext): string {
    if (bucket.kind === "text" || !bucket.weekStart) {
        return bucket.value === null || bucket.value === undefined || bucket.value === "" ? context.blankLabel : String(bucket.value);
    }
    switch (format) {
        case "weekStart":
            return context.formatDate(bucket.weekStart);
        case "isoWeek": {
            // The day after the week's start is always its Monday or Tuesday, so a Sunday-start week gets the ISO week of its other six days.
            const { year, week } = isoWeek(addDays(bucket.weekStart, 1));
            return `${year}-W${String(week).padStart(2, "0")}`;
        }
        case "projectWeek":
            return `${context.weekPrefix}${index + 1}`;
    }
}
