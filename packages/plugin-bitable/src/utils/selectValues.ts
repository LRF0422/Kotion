import { FieldConfig, FieldType, SelectOption } from "../types";
import { generateOptionId } from "./id";
import { OPTION_COLORS, toHex6 } from "./colors";

/**
 * Select / multi-select value normalisation for the data write path.
 *
 * Bitable stores select cells as option **ids**: the renderers resolve
 * `field.options.find(option => option.id === value)`, the cell editors emit
 * `option.id`, filters/groups/export assume ids. Callers that are not the cell
 * editor — the AI tools, Excel import, field-type conversion — naturally speak
 * in option **labels** instead. Every write path must therefore translate
 * labels back to ids, otherwise the written value has no matching option and
 * the cell renders as empty.
 *
 * This module is the single implementation of that translation, plus the
 * option-list hygiene (ids, colours) needed to keep `field.options` usable.
 */

/** Named colours accepted from tool input, mapped onto the tag palette. */
const NAMED_OPTION_COLORS: Record<string, string> = {
    gray: "#6b7280",
    grey: "#6b7280",
    blue: "#3b82f6",
    green: "#10b981",
    amber: "#f59e0b",
    yellow: "#f59e0b",
    red: "#ef4444",
    purple: "#8b5cf6",
    pink: "#ec4899",
    teal: "#14b8a6",
    orange: "#f97316",
};

/**
 * Resolve a caller-supplied option colour to a renderable CSS colour.
 * Accepts hex (`#3b82f6`, `#abc`, `#rrggbbaa`), named colours (`red`, `#blue`)
 * and falls back to the palette so a tag never receives an unrenderable value
 * such as `#red20` or `#abc20`.
 */
export function normalizeOptionColor(color: string | undefined | null, index = 0): string {
    const fallback = OPTION_COLORS[index % OPTION_COLORS.length] as string;
    if (!color) return fallback;
    const raw = String(color).trim();
    if (!raw) return fallback;
    const named = NAMED_OPTION_COLORS[raw.replace(/^#/, "").toLowerCase()];
    if (named) return named;
    return toHex6(raw) ?? fallback;
}

/**
 * Build a clean option list: trimmed labels, unique labels, ids preserved for
 * options that already exist (matched by label), colours normalised.
 *
 * Id precedence is existing-by-label > caller-supplied id > a fresh unique id;
 * keeping the id of an unchanged label is what keeps already-stored record
 * values visible. New options get a generated id (never an index like "1") so a
 * numeric-looking *label* can never be confused with another option's id.
 */
export function normalizeOptions(
    options: Array<Partial<SelectOption>> | undefined,
    existing: SelectOption[] = []
): SelectOption[] {
    const seenLabels = new Set<string>();
    const existingByLabel = new Map<string, SelectOption>();
    // First occurrence wins, matching `findOptionByLabel` used by the resolve
    // path: a duplicated label must not resolve and merge to different ids.
    existing.forEach((option) => {
        const key = option.label.trim().toLowerCase();
        if (!existingByLabel.has(key)) existingByLabel.set(key, option);
    });

    const planned: Array<{
        label: string;
        index: number;
        explicitId: string | null;
        color?: string;
        previous?: SelectOption;
    }> = [];

    (options || []).forEach((raw, index) => {
        const label = String(raw?.label ?? "").trim();
        if (!label) return;
        const labelKey = label.toLowerCase();
        if (seenLabels.has(labelKey)) return;
        seenLabels.add(labelKey);

        planned.push({
            label,
            index,
            explicitId: raw?.id != null && String(raw.id) !== "" ? String(raw.id) : null,
            color: raw?.color ?? undefined,
            previous: existingByLabel.get(labelKey),
        });
    });

    // Ids already referenced by stored record values win over anything the
    // caller proposes, so keeping a label always keeps its option id.
    const reservedIds = new Set<string>();
    planned.forEach((item) => {
        if (item.previous) reservedIds.add(String(item.previous.id));
    });
    const assignedIds = new Set<string>();

    return planned.map((item) => {
        let id: string;
        if (item.previous) {
            id = String(item.previous.id);
        } else if (item.explicitId && !reservedIds.has(item.explicitId) && !assignedIds.has(item.explicitId)) {
            id = item.explicitId;
        } else {
            id = generateOptionId();
        }
        assignedIds.add(id);

        const color = item.color
            ? normalizeOptionColor(item.color, item.index)
            : item.previous?.color
              ? normalizeOptionColor(item.previous.color, item.index)
              : normalizeOptionColor(undefined, item.index);

        return { id, label: item.label, color };
    });
}

function findOptionById(options: SelectOption[] | undefined, value: unknown): SelectOption | undefined {
    if (value == null) return undefined;
    return options?.find((option) => String(option.id) === String(value));
}

function findOptionByLabel(options: SelectOption[] | undefined, label: string): SelectOption | undefined {
    const key = label.trim().toLowerCase();
    if (!key) return undefined;
    return options?.find((option) => option.label.trim().toLowerCase() === key);
}

/** Extract a human label from a raw select value (string, number, option-like object). */
export function optionLabel(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "object" && !Array.isArray(value)) {
        const candidate = value as { label?: unknown; name?: unknown; text?: unknown };
        const raw = candidate.label ?? candidate.name ?? candidate.text;
        if (raw == null) return null;
        const trimmed = String(raw).trim();
        return trimmed ? trimmed : null;
    }
    return null;
}

/**
 * Label to use when *creating* a missing option.
 *
 * Deliberately stricter than `optionLabel`: a bare number (`0`, `1`, …) or
 * boolean is a schema/typo signal ("unset"), not a label, and inventing an
 * option called "0" would be worse than leaving the cell empty. Numbers still
 * *resolve* against existing options via `optionLabel`.
 */
function creatableLabel(value: unknown): string | null {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const candidate = value as { label?: unknown; name?: unknown; text?: unknown };
        const raw = candidate.label ?? candidate.name ?? candidate.text;
        if (raw == null) return null;
        const trimmed = String(raw).trim();
        return trimmed ? trimmed : null;
    }
    return null;
}

/**
 * Resolve a raw select value to a configured option id.
 * Accepts an option id, an option label (trimmed, case-insensitive) or an
 * option-like object (`{ id }` / `{ label }`).
 */
export function resolveOptionId(
    options: SelectOption[] | undefined,
    value: unknown
): string | null {
    if (value == null) return null;

    if (typeof value === "object" && !Array.isArray(value)) {
        const byId = findOptionById(options, (value as { id?: unknown }).id);
        if (byId) return byId.id;
        const label = optionLabel(value);
        return label ? findOptionByLabel(options, label)?.id ?? null : null;
    }

    if (typeof value === "string" || typeof value === "number") {
        const direct = findOptionById(options, value);
        if (direct) return direct.id;
        const label = optionLabel(value);
        return label ? findOptionByLabel(options, label)?.id ?? null : null;
    }

    return null;
}

/**
 * Resolve a stored cell value to every option id it refers to, for read-only
 * display (table cells, record detail drawer).
 *
 * Documents written before select values were normalised on write still hold
 * option *labels*; accepting both keeps those cells visible and makes editing
 * them toggle the right option instead of appending a duplicate.
 */
export function resolveOptionIds(options: SelectOption[] | undefined, value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    const ids: string[] = [];
    values.forEach((item) => {
        const id = resolveOptionId(options, item);
        if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
}

function addMissingOption(
    options: SelectOption[],
    label: string
): { option: SelectOption; created: boolean } {
    const existing = findOptionByLabel(options, label);
    if (existing) return { option: existing, created: false };
    const option: SelectOption = {
        id: generateOptionId(),
        label: label.trim(),
        color: normalizeOptionColor(undefined, options.length),
    };
    options.push(option);
    return { option, created: true };
}

const MULTI_VALUE_SEPARATORS = /[,，、;；]/;

/** Recursively flatten nested arrays so no token can hide inside a deeper level. */
function flattenTokens(value: unknown): unknown[] {
    return Array.isArray(value) ? value.flatMap(flattenTokens) : [value];
}

/** Flatten a raw multi-select value into individual tokens. */
function tokenizeMultiValue(
    options: SelectOption[],
    value: unknown,
    allowSplit: boolean
): unknown[] {
    if (value == null || value === "") return [];
    if (Array.isArray(value)) {
        return flattenTokens(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (resolveOptionId(options, trimmed)) return [trimmed];
        const parts = trimmed
            .split(MULTI_VALUE_SEPARATORS)
            .map((part) => part.trim())
            .filter(Boolean);
        if (parts.length > 1 && (allowSplit || parts.every((part) => resolveOptionId(options, part)))) {
            return parts;
        }
        return [trimmed];
    }
    return [value];
}

export interface NormalizedSelectValue {
    /** Normalised value (option id, or option ids for multi-select). */
    value: unknown;
    /** True when every supplied token mapped onto a configured option. */
    resolved: boolean;
    /** Options created for labels that were not configured yet. */
    createdOptions: SelectOption[];
}

function normalizeWithOptions(
    field: SelectLikeField,
    options: SelectOption[],
    value: unknown,
    createMissingOptions: boolean
): NormalizedSelectValue {
    if (field.type === FieldType.MULTI_SELECT) {
        const tokens = tokenizeMultiValue(options, value, createMissingOptions);
        if (tokens.length === 0) return { value, resolved: true, createdOptions: [] };

        const ids: string[] = [];
        const unresolved: unknown[] = [];
        const createdOptions: SelectOption[] = [];

        tokens.forEach((token) => {
            if (token == null || token === "") return;
            const id = resolveOptionId(options, token);
            if (id) {
                if (!ids.includes(id)) ids.push(id);
                return;
            }
            const label = createMissingOptions ? creatableLabel(token) : null;
            if (label) {
                const { option, created } = addMissingOption(options, label);
                if (!ids.includes(option.id)) ids.push(option.id);
                if (created) createdOptions.push(option);
                return;
            }
            unresolved.push(token);
        });

        return {
            value: [...ids, ...unresolved],
            resolved: unresolved.length === 0,
            createdOptions,
        };
    }

    // Single select: the first token wins (an array is tolerated).
    const token = Array.isArray(value) ? value[0] : value;
    if (token == null || token === "") return { value, resolved: true, createdOptions: [] };

    const id = resolveOptionId(options, token);
    if (id) return { value: id, resolved: true, createdOptions: [] };

    const label = createMissingOptions ? creatableLabel(token) : null;
    if (label) {
        const { option, created } = addMissingOption(options, label);
        return { value: option.id, resolved: true, createdOptions: created ? [option] : [] };
    }

    return { value, resolved: false, createdOptions: [] };
}

/** The subset of `FieldConfig` the select normaliser needs. */
export type SelectLikeField = Pick<FieldConfig, "id" | "title" | "type" | "options">;

export interface NormalizeSelectValueOptions {
    /**
     * Create options for labels that are not configured yet (AI tool paths).
     * When false the raw value is preserved untouched so nothing is dropped.
     */
    createMissingOptions?: boolean;
}

/** Normalise one raw value for a select / multi-select field. */
export function normalizeSelectValue(
    field: SelectLikeField,
    value: unknown,
    options: NormalizeSelectValueOptions = {}
): NormalizedSelectValue {
    if (field.type !== FieldType.SELECT && field.type !== FieldType.MULTI_SELECT) {
        return { value, resolved: true, createdOptions: [] };
    }
    return normalizeWithOptions(field, [...(field.options || [])], value, options.createMissingOptions === true);
}

export interface CreatedOptionInfo {
    fieldId: string;
    fieldTitle: string;
    option: SelectOption;
}

export interface NormalizedRecordValues {
    /** Fields with any auto-created options merged in (same array when unchanged). */
    fields: FieldConfig[];
    /** Values with select labels resolved to option ids. */
    values: Record<string, unknown>;
    /** Options created while normalising, for tool feedback. */
    createdOptions: CreatedOptionInfo[];
}

/**
 * Normalise one record's values against its field configs.
 * Labels are translated to option ids; with `createMissingOptions` unknown
 * labels become new options (merged into the returned `fields`).
 */
export function normalizeRecordValues(
    fields: FieldConfig[],
    values: Record<string, unknown>,
    options: NormalizeSelectValueOptions = {}
): NormalizedRecordValues {
    const created = normalizeRecordValuesBatch(fields, [values], options);
    return {
        fields: created.fields,
        values: created.valuesList[0] ?? {},
        createdOptions: created.createdOptions,
    };
}

/**
 * Normalise a batch of records while threading auto-created options forward,
 * so several records that mention the same new label share one option.
 */
export function normalizeRecordValuesBatch(
    fields: FieldConfig[],
    valuesList: Array<Record<string, unknown>>,
    options: NormalizeSelectValueOptions = {}
): {
    fields: FieldConfig[];
    valuesList: Array<Record<string, unknown>>;
    createdOptions: CreatedOptionInfo[];
} {
    const createMissingOptions = options.createMissingOptions === true;
    const selectFieldIds = new Set(
        fields
            .filter((field) => field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT)
            .map((field) => field.id)
    );

    if (selectFieldIds.size === 0) {
        return { fields, valuesList, createdOptions: [] };
    }

    // Live option lists per select field: start from the configured options and
    // append auto-created ones so later records resolve against them.
    const liveOptions = new Map<string, SelectOption[]>();
    const updatedFields = new Map<string, FieldConfig>();
    const createdOptions: CreatedOptionInfo[] = [];
    let fieldsChanged = false;

    const normalizedList = valuesList.map((values) => {
        const normalized: Record<string, unknown> = {};

        Object.entries(values).forEach(([key, raw]) => {
            if (!selectFieldIds.has(key)) {
                normalized[key] = raw;
                return;
            }

            const field = updatedFields.get(key) ?? fields.find((candidate) => candidate.id === key);
            if (!field) {
                normalized[key] = raw;
                return;
            }

            let optionList = liveOptions.get(key);
            if (!optionList) {
                optionList = [...(field.options || [])];
                liveOptions.set(key, optionList);
            }

            const result = normalizeWithOptions(field, optionList, raw, createMissingOptions);
            normalized[key] = result.value;

            if (result.createdOptions.length > 0) {
                const merged: FieldConfig = { ...field, options: [...optionList] };
                updatedFields.set(key, merged);
                fieldsChanged = true;
                result.createdOptions.forEach((option) =>
                    createdOptions.push({ fieldId: field.id, fieldTitle: field.title, option })
                );
            }
        });

        return normalized;
    });

    return {
        fields: fieldsChanged ? fields.map((field) => updatedFields.get(field.id) ?? field) : fields,
        valuesList: normalizedList,
        createdOptions,
    };
}
