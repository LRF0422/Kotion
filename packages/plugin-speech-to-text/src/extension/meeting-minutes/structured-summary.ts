export interface StructuredActionItem {
    task: string;
    owner?: string;
    dueDate?: string;
}

export interface StructuredMeetingNoteSection {
    heading: string;
    details: string[];
}

export interface StructuredMeetingSummary {
    title?: string;
    overview: string;
    keyPoints: string[];
    decisions: string[];
    actionItems: StructuredActionItem[];
}

export interface StructuredMeetingMinutes extends StructuredMeetingSummary {
    notes: StructuredMeetingNoteSection[];
}

export interface SummarySectionLabels {
    overview: string;
    keyPoints: string;
    decisions: string;
    actionItems: string;
    owner: string;
    dueDate: string;
}

export interface TiptapContentNode {
    type: string;
    attrs?: Record<string, unknown>;
    text?: string;
    content?: TiptapContentNode[];
}

const DEFAULT_LABELS: SummarySectionLabels = {
    overview: 'Overview',
    keyPoints: 'Key points',
    decisions: 'Decisions',
    actionItems: 'Action items',
    owner: 'Owner',
    dueDate: 'Due',
};

const asTrimmedString = (value: unknown, maxLength = 10_000): string => (
    typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const asStringList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => asTrimmedString(item, 2_000))
        .filter(Boolean)
        .slice(0, 50);
};

const findFirstJsonObject = (value: string): string => {
    const firstBrace = value.indexOf('{');
    if (firstBrace < 0) throw new Error('Meeting-minutes response did not contain a JSON object');

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = firstBrace; index < value.length; index += 1) {
        const char = value[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) return value.slice(firstBrace, index + 1);
        }
    }
    throw new Error('Meeting-minutes response contained incomplete JSON');
};

const parseJsonResponse = (response: string): unknown => {
    const normalized = response
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
    return JSON.parse(findFirstJsonObject(normalized));
};

export const normalizeStructuredMeetingSummary = (value: unknown): StructuredMeetingSummary => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Summary response must be a JSON object');
    }
    const record = value as Record<string, unknown>;
    const actionItems = Array.isArray(record.actionItems)
        ? record.actionItems.map((item): StructuredActionItem | null => {
            if (typeof item === 'string') {
                const task = asTrimmedString(item, 2_000);
                return task ? { task } : null;
            }
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const action = item as Record<string, unknown>;
            const task = asTrimmedString(action.task, 2_000);
            if (!task) return null;
            const owner = asTrimmedString(action.owner, 300);
            const dueDate = asTrimmedString(action.dueDate, 300);
            return {
                task,
                ...(owner ? { owner } : {}),
                ...(dueDate ? { dueDate } : {}),
            };
        }).filter((item): item is StructuredActionItem => item !== null).slice(0, 50)
        : [];

    const result: StructuredMeetingSummary = {
        title: asTrimmedString(record.title, 500) || undefined,
        overview: asTrimmedString(record.overview, 10_000),
        keyPoints: asStringList(record.keyPoints),
        decisions: asStringList(record.decisions),
        actionItems,
    };

    if (!result.overview && !result.keyPoints.length && !result.decisions.length && !result.actionItems.length) {
        throw new Error('Summary response did not contain any supported content');
    }
    return result;
};

export const normalizeStructuredMeetingMinutes = (value: unknown): StructuredMeetingMinutes => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Meeting-minutes response must be a JSON object');
    }
    const record = value as Record<string, unknown>;
    const validStringArray = (input: unknown): input is string[] => (
        Array.isArray(input) && input.every((item) => typeof item === 'string')
    );
    const validActionItems = Array.isArray(record.actionItems) && record.actionItems.every((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const action = item as Record<string, unknown>;
        return typeof action.task === 'string'
            && !!action.task.trim()
            && (action.owner === undefined || typeof action.owner === 'string')
            && (action.dueDate === undefined || typeof action.dueDate === 'string');
    });
    const validNotes = Array.isArray(record.notes) && record.notes.length > 0 && record.notes.every((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const section = item as Record<string, unknown>;
        return typeof section.heading === 'string'
            && !!section.heading.trim()
            && validStringArray(section.details)
            && section.details.length > 0
            && section.details.every((detail) => !!detail.trim());
    });

    if (
        (record.title !== undefined && typeof record.title !== 'string')
        || typeof record.overview !== 'string'
        || !validStringArray(record.keyPoints)
        || !validStringArray(record.decisions)
        || !validActionItems
        || !validNotes
    ) {
        throw new Error('Meeting-minutes response did not match the required schema');
    }

    const notes = (record.notes as Array<Record<string, unknown>>).slice(0, 50).map((section) => {
        return {
            heading: asTrimmedString(section.heading, 500),
            details: asStringList(section.details),
        };
    });

    return {
        ...normalizeStructuredMeetingSummary(value),
        notes,
    };
};

export const parseStructuredMeetingSummary = (response: string): StructuredMeetingSummary => (
    normalizeStructuredMeetingSummary(parseJsonResponse(response))
);

export const parseStructuredMeetingMinutes = (response: string): StructuredMeetingMinutes => (
    normalizeStructuredMeetingMinutes(parseJsonResponse(response))
);

const textNode = (text: string): TiptapContentNode => ({ type: 'text', text });
const paragraphNode = (text = ''): TiptapContentNode => ({
    type: 'paragraph',
    ...(text ? { content: [textNode(text)] } : {}),
});
const headingNode = (text: string, level: number): TiptapContentNode => ({
    type: 'heading',
    attrs: { level },
    content: [textNode(text)],
});
const bulletListNode = (items: string[]): TiptapContentNode => ({
    type: 'bulletList',
    content: items.map((item) => ({
        type: 'listItem',
        content: [paragraphNode(item)],
    })),
});

export const plainTextToTiptapNodes = (text: string): TiptapContentNode[] => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const nodes = lines.map((line) => paragraphNode(line));
    return nodes.length ? nodes : [paragraphNode()];
};

export const structuredNotesToTiptapNodes = (notes: StructuredMeetingNoteSection[]): TiptapContentNode[] => {
    const nodes = notes.flatMap((section) => [
        headingNode(section.heading, 3),
        bulletListNode(section.details),
    ]);
    return nodes.length ? nodes : [paragraphNode()];
};

export const structuredSummaryToTiptapNodes = (
    summary: StructuredMeetingSummary,
    labels: Partial<SummarySectionLabels> = {},
): TiptapContentNode[] => {
    const resolved = { ...DEFAULT_LABELS, ...labels };
    const nodes: TiptapContentNode[] = [];

    if (summary.title) nodes.push(headingNode(summary.title, 2));
    if (summary.overview) {
        nodes.push(headingNode(resolved.overview, 3), ...plainTextToTiptapNodes(summary.overview));
    }
    if (summary.keyPoints.length) {
        nodes.push(headingNode(resolved.keyPoints, 3), bulletListNode(summary.keyPoints));
    }
    if (summary.decisions.length) {
        nodes.push(headingNode(resolved.decisions, 3), bulletListNode(summary.decisions));
    }
    if (summary.actionItems.length) {
        const items = summary.actionItems.map((item) => {
            const metadata = [
                item.owner ? `${resolved.owner}: ${item.owner}` : '',
                item.dueDate ? `${resolved.dueDate}: ${item.dueDate}` : '',
            ].filter(Boolean);
            return metadata.length ? `${item.task} (${metadata.join(' · ')})` : item.task;
        });
        nodes.push(headingNode(resolved.actionItems, 3), bulletListNode(items));
    }

    return nodes.length ? nodes : [paragraphNode()];
};

const stableSerialize = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'undefined';
};

export const createMeetingContentFingerprint = (value: unknown): string => {
    const serialized = stableSerialize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < serialized.length; index += 1) {
        hash ^= serialized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
