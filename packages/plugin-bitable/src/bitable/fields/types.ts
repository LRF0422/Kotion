import { Editor } from "@kn/editor";
import { FieldConfig } from "../../types";

/** Props for read-only field renderers (cell display). */
export interface FieldRendererProps {
    value: any;
    field: FieldConfig;
}

/** Props for field editors (cell edit mode). */
export interface FieldEditorProps {
    value: any;
    field: FieldConfig;
    onChange: (value: any) => void;
    editor?: Editor;
    onCommit?: () => void;
    /** Persist directly to the record (used by Popover editors). */
    onSave?: (value: any) => void;
}
