import React from "react";
import { FieldType } from "../../types";
import { FieldRendererProps, FieldEditorProps } from "./types";
import { TextRenderer, TextEditor, LongTextRenderer, LongTextEditor, NumberRenderer, NumberEditor, IDRenderer, IDEditor } from "./TextFields";
import { SelectRenderer, SelectEditor, MultiSelectRenderer, MultiSelectEditor } from "./SelectFields";
import { DateRenderer, DateEditor } from "./DateFields";
import { CheckboxRenderer, CheckboxEditor, ProgressRenderer, ProgressEditor, RatingRenderer, RatingEditor } from "./ToggleFields";
import { URLRenderer, URLEditor, EmailRenderer, EmailEditor, PhoneRenderer, PhoneEditor } from "./LinkFields";
import { ImageRenderer, ImageEditor, AttachmentRenderer, AttachmentEditor } from "./MediaFields";
import { PersonRenderer, PersonEditor, PersonReadonlyEditor } from "./PersonFields";

type RendererComponent = React.FC<FieldRendererProps>;
type EditorComponent = React.FC<FieldEditorProps>;

/**
 * Registry mapping each field type to its read-only renderer.
 * Replaces the giant switch statement that lived in FieldRenderers.tsx.
 */
const rendererRegistry: Partial<Record<FieldType, RendererComponent>> = {
    [FieldType.TEXT]: TextRenderer,
    [FieldType.LONG_TEXT]: LongTextRenderer,
    [FieldType.NUMBER]: NumberRenderer,
    [FieldType.SELECT]: SelectRenderer,
    [FieldType.MULTI_SELECT]: MultiSelectRenderer,
    [FieldType.DATE]: DateRenderer,
    [FieldType.CHECKBOX]: CheckboxRenderer,
    [FieldType.PROGRESS]: ProgressRenderer,
    [FieldType.RATING]: RatingRenderer,
    [FieldType.URL]: URLRenderer,
    [FieldType.EMAIL]: EmailRenderer,
    [FieldType.PHONE]: PhoneRenderer,
    [FieldType.IMAGE]: ImageRenderer,
    [FieldType.PERSON]: PersonRenderer,
    [FieldType.CREATED_BY]: PersonRenderer,
    [FieldType.UPDATED_BY]: PersonRenderer,
    [FieldType.ATTACHMENT]: AttachmentRenderer,
    [FieldType.ID]: IDRenderer,
    [FieldType.AUTO_NUMBER]: IDRenderer,
    [FieldType.CREATED_TIME]: DateRenderer,
    [FieldType.UPDATED_TIME]: DateRenderer,
};

/**
 * Registry mapping each field type to its editor component.
 */
const editorRegistry: Partial<Record<FieldType, EditorComponent>> = {
    [FieldType.TEXT]: TextEditor,
    [FieldType.LONG_TEXT]: LongTextEditor,
    [FieldType.NUMBER]: NumberEditor,
    [FieldType.SELECT]: SelectEditor,
    [FieldType.MULTI_SELECT]: MultiSelectEditor,
    [FieldType.DATE]: DateEditor,
    [FieldType.CHECKBOX]: CheckboxEditor,
    [FieldType.PROGRESS]: ProgressEditor,
    [FieldType.RATING]: RatingEditor,
    [FieldType.URL]: URLEditor,
    [FieldType.EMAIL]: EmailEditor,
    [FieldType.PHONE]: PhoneEditor,
    [FieldType.IMAGE]: ImageEditor,
    [FieldType.PERSON]: PersonEditor,
    [FieldType.ATTACHMENT]: AttachmentEditor,
    [FieldType.CREATED_BY]: PersonReadonlyEditor,
    [FieldType.UPDATED_BY]: PersonReadonlyEditor,
    [FieldType.ID]: IDEditor,
    [FieldType.AUTO_NUMBER]: IDEditor,
    [FieldType.CREATED_TIME]: IDEditor,
    [FieldType.UPDATED_TIME]: IDEditor,
};

export function getFieldRenderer(fieldType: FieldType): RendererComponent {
    return rendererRegistry[fieldType] ?? TextRenderer;
}

export function getFieldEditor(fieldType: FieldType): EditorComponent {
    return editorRegistry[fieldType] ?? TextEditor;
}
