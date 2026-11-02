// Every UI string goes through one keyed lookup: the host's localization manager first (stringResources,
// Phase 6), then these en-US defaults.

export const defaultStrings = {
    landingTitle: "Physical Progress S-Curve",
    landingBody: "Add a Date or Category field and at least one measure to Column values, Line values or Table-only values.",
    missingBuckets: "Add a Date or Category field to draw the time axis.",
    missingMeasures: "Add at least one measure to Column values, Line values or Table-only values.",
    noRows: "No data for the current filters.",
    dateHierarchy: "Use the date field itself, not its Date Hierarchy: in the Date well, open the field's menu and choose the field's name.",
    tooSmall: "Make the visual larger to see the chart.",
    matrixHidden: "Matrix hidden: not enough space.",
    cumulativeSuffix: " (cumulative)",
    totalsLabel: "Total",
    blank: "(Blank)",
    weekPrefix: "W",
    warningTitle: "Not all data is shown as bound",
    warningReduced: "Power BI sent a reduced dataset, so not all data is shown.",
    warningExcludedDates: "{0} rows with an empty or non-date value in the Date field were excluded.",
    warningEmptyWeeks: "The date range spans more than 1000 weeks, so empty weeks were not inserted.",
    warningPercentBaseline: "The % baseline is zero or empty, so lines show values instead of percentages.",
} as const;

export type StringKey = keyof typeof defaultStrings;
export type Strings = (key: StringKey, ...args: (string | number)[]) => string;

export interface LocalizationManagerLike {
    getDisplayName(key: string): string;
}

/** Resource keys are `Visual_<key>` in stringResources/<locale>/resources.resjson. */
export function createStrings(manager?: LocalizationManagerLike): Strings {
    return (key, ...args) => {
        const resourceKey = `Visual_${key}`;
        let text: string = defaultStrings[key];
        try {
            const localized = manager?.getDisplayName(resourceKey);
            if (localized && localized !== resourceKey) text = localized;
        } catch {
            // A host without localization support falls back to en-US.
        }
        return args.reduce<string>((result, arg, i) => result.replace(`{${i}}`, String(arg)), text);
    };
}
