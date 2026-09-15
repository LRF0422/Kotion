/**
 * Shared block-type presentation for the block picker and its preview pane:
 * a localised label and a matching glyph for each editor node type.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import type { ComponentType } from 'react';
import {
    Bookmark,
    Braces,
    ChevronDown,
    FileText,
    Film,
    Folder,
    Heading1,
    Image,
    List,
    ListOrdered,
    ListTodo,
    MessageSquare,
    Minus,
    Paperclip,
    Puzzle,
    Quote,
    Shapes,
    Sigma,
    Table2,
    Workflow,
} from '@kn/icon';

/** Editor node type -> key under `bidirectionalLink.blockTypes`. */
const TYPE_KEYS: Record<string, string> = {
    title: 'title',
    heading: 'heading',
    paragraph: 'paragraph',
    bulletList: 'bulletList',
    orderedList: 'orderedList',
    taskList: 'taskList',
    codeBlock: 'codeBlock',
    blockquote: 'blockquote',
    table: 'table',
    image: 'image',
    imageInline: 'image',
    imageGallery: 'imageGallery',
    video: 'video',
    mermaid: 'mermaid',
    drawio: 'drawio',
    drawnix: 'drawnix',
    logicflowDiagram: 'logicflowDiagram',
    bitable: 'bitable',
    math: 'math',
    inlineMath: 'math',
    bookmark: 'bookmark',
    figma: 'figma',
    attachment: 'attachment',
    attachmentInline: 'attachment',
    folder: 'folder',
    callout: 'callout',
    details: 'toggle',
    divider: 'divider',
    horizontalRule: 'divider',
};

const TYPE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
    title: Heading1,
    heading: Heading1,
    paragraph: FileText,
    bulletList: List,
    orderedList: ListOrdered,
    taskList: ListTodo,
    codeBlock: Braces,
    blockquote: Quote,
    table: Table2,
    image: Image,
    imageGallery: Image,
    video: Film,
    mermaid: Shapes,
    drawio: Shapes,
    drawnix: Shapes,
    logicflowDiagram: Workflow,
    bitable: Table2,
    math: Sigma,
    bookmark: Bookmark,
    attachment: Paperclip,
    folder: Folder,
    callout: MessageSquare,
    details: ChevronDown,
    divider: Minus,
    horizontalRule: Minus,
};

/** Localised human label for a block node type. */
export const getBlockTypeLabel = (t: (key: string) => string, type?: string | null): string =>
    t(`bidirectionalLink.blockTypes.${(type && TYPE_KEYS[type]) || 'unknown'}`);

/** Icon component for a block node type; falls back to a generic puzzle piece. */
export const getBlockTypeIcon = (type?: string | null): ComponentType<{ className?: string }> =>
    (type && TYPE_ICONS[type]) || Puzzle;
