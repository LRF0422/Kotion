/**
 * Barrel re-export of all bitable type definitions.
 * Consumers should import from `../../types` or `../types`.
 */

// Fields — values (enum, const, function)
export {
    FieldType,
    READONLY_FIELD_TYPES,
    isReadonlyField,
} from "./fields";

// Fields — types
export type {
    SelectOption,
    SummaryMode,
    FieldConfig,
    FieldValue,
} from "./fields";

// Records — types
export type { Person, Attachment, RecordData } from "./records";

// Views — values (enums)
export {
    ViewType,
    ChartType,
    FilterOperator,
} from "./views";

// Views — types
export type {
    FilterConfig,
    SortConfig,
    GroupConfig,
    YAxisConfig,
    KanbanConfig,
    GalleryConfig,
    CalendarConfig,
    TimelineConfig,
    FormConfig,
    ChartConfig,
    ViewConfig,
    CellPosition,
    SelectionRange,
    EditMode,
    BitableInteractionConfig,
} from "./views";

// Bitable node attributes
import type { FieldConfig } from "./fields";
import type { ViewConfig } from "./views";
import type { RecordData } from "./records";

/** Bitable node attributes — stored in the ProseMirror node. */
export interface BitableAttrs {
    fields: FieldConfig[];
    views: ViewConfig[];
    currentView: string;
    records?: RecordData[];
    data: RecordData[];
}
