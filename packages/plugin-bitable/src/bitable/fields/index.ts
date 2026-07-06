// Barrel file — re-exports all field renderers, editors, and utilities.
// Importing from "../fields" (or "./fields") replaces the old
// "../fields/FieldRenderers" path.

// Types
export type { FieldRendererProps, FieldEditorProps } from "./types";

// Shared utilities
export {
    useDateLocale,
    IMAGE_FALLBACK,
    IMAGE_ERROR_FALLBACK_LARGE,
    toImageUrls,
    toPersonArray,
    toAttachmentArray,
    PersonChip,
} from "./shared";

// Text / Number / ID
export { TextRenderer, TextEditor, NumberRenderer, NumberEditor, IDRenderer, IDEditor } from "./TextFields";

// Select / MultiSelect
export {
    SelectRenderer,
    SelectEditor,
    MultiSelectRenderer,
    MultiSelectEditor,
} from "./SelectFields";

// Date
export { DateRenderer, DateEditor } from "./DateFields";

// Checkbox / Progress / Rating
export {
    CheckboxRenderer,
    CheckboxEditor,
    ProgressRenderer,
    ProgressEditor,
    RatingRenderer,
    RatingEditor,
} from "./ToggleFields";

// URL / Email / Phone
export {
    URLRenderer,
    URLEditor,
    EmailRenderer,
    EmailEditor,
    PhoneRenderer,
    PhoneEditor,
} from "./LinkFields";

// Image / Attachment
export { ImageRenderer, ImageEditor, AttachmentRenderer, AttachmentEditor } from "./MediaFields";

// Person / ReadonlyPerson
export { PersonRenderer, PersonEditor, PersonReadonlyEditor } from "./PersonFields";

// Icons & view utilities (consolidated)
export { getFieldTypeIcon, getViewIcon, getViewTypeName } from "./fieldIcons";

// Registry
export { getFieldRenderer, getFieldEditor } from "./registry";
