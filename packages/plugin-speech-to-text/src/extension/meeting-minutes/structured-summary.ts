export interface StructuredActionItem {
    task: string;
    owner?: string;
    dueDate?: string;
}

export interface StructuredMeetingSummary {
    title?: string;
    overview: string;
    keyPoints: string[];
    decisions: string[];
    actionItems: StructuredActionItem[];
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
    if (firstBrace < 0) throw new Error('Summary response did not contain a JSON object');

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
    throw new Error('Summary response contained incomplete JSON');
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

export const parseStructuredMeetingSummary = (response: string): StructuredMeetingSummary => {
    const normalized = response
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
    return normalizeStructuredMeetingSummary(JSON.parse(findFirstJsonObject(normalized)));
};

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
