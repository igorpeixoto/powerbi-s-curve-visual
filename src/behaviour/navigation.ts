// Keyboard navigation over a grid of focus rows × buckets (SPEC §7.4): chart rows first (bars, then lines),
// then the matrix rows, so ↓ past the last chart row moves into the matrix.

export type FocusRow =
    | { kind: "bar"; measureKey: string; seriesIndex: number | null }
    | { kind: "point"; measureKey: string; seriesIndex: number | null }
    | { kind: "cell"; matrixRow: number };

export interface Focus {
    row: number;
    bucket: number;
}

export interface FocusRowInput {
    columnMeasureKeys: string[];
    seriesCount: number;
    hasSeries: boolean;
    lines: { measureKey: string; seriesIndex: number | null }[];
    matrixRowCount: number;
}

export function buildFocusRows(input: FocusRowInput): FocusRow[] {
    const rows: FocusRow[] = [];
    for (const measureKey of input.columnMeasureKeys) {
        if (input.hasSeries) {
            for (let s = 0; s < input.seriesCount; s++) rows.push({ kind: "bar", measureKey, seriesIndex: s });
        } else {
            rows.push({ kind: "bar", measureKey, seriesIndex: null });
        }
    }
    for (const line of input.lines) rows.push({ kind: "point", measureKey: line.measureKey, seriesIndex: line.seriesIndex });
    for (let i = 0; i < input.matrixRowCount; i++) rows.push({ kind: "cell", matrixRow: i });
    return rows;
}

export type NavigationKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/** Moves the focus, clamped to the grid; the first key press lands on the first row and bucket. */
export function moveFocus(focus: Focus | null, key: NavigationKey, rowCount: number, bucketCount: number): Focus | null {
    if (rowCount === 0 || bucketCount === 0) return null;
    if (!focus) return { row: 0, bucket: 0 };
    const clamp = (value: number, max: number) => Math.max(0, Math.min(max - 1, value));
    const row = clamp(focus.row, rowCount);
    const bucket = clamp(focus.bucket, bucketCount);
    switch (key) {
        case "ArrowLeft":
            return { row, bucket: clamp(bucket - 1, bucketCount) };
        case "ArrowRight":
            return { row, bucket: clamp(bucket + 1, bucketCount) };
        case "ArrowUp":
            return { row: clamp(row - 1, rowCount), bucket };
        case "ArrowDown":
            return { row: clamp(row + 1, rowCount), bucket };
        case "Home":
            return { row, bucket: 0 };
        case "End":
            return { row, bucket: bucketCount - 1 };
    }
}
