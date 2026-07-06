import type { RecordData } from "../../../types";

/** Extended row type that supports group headers within DataGrid. */
export type GroupedRow = RecordData & {
    _isGroupHeader?: boolean;
    _groupKey?: string;
    _groupCount?: number;
};
