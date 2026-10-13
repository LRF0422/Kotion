import { strict as assert } from "node:assert";
import { FieldType } from "../types/index.js";
import type { FieldConfig, SelectOption } from "../types/index.js";
import {
    normalizeOptionColor,
    normalizeOptions,
    normalizeRecordValues,
    normalizeRecordValuesBatch,
    normalizeSelectValue,
    resolveOptionId,
    resolveOptionIds,
} from "./selectValues.js";
import { createRecord, createRecords, sanitizeRecordValues } from "./record.js";
import { getTagStyle } from "./colors.js";
import { OPTION_COLORS } from "./colors.js";

// Option ids mirror what `buildFieldsConfig` / `normalizeOptions` produce for
// AI-supplied fields ("1", "2", …), which is exactly the setup that used to
// leave agent-written labels unmatched.
const statusField: FieldConfig = {
    id: "status",
    title: "状态",
    type: FieldType.SELECT,
    options: [
        { id: "1", label: "待拍板", color: "#ef4444" },
        { id: "2", label: "待确认", color: "#f59e0b" },
    ],
};
const tagsField: FieldConfig = {
    id: "tags",
    title: "标签",
    type: FieldType.MULTI_SELECT,
    options: [
        { id: "1", label: "前端", color: "#3b82f6" },
        { id: "2", label: "后端", color: "#10b981" },
    ],
};

/** Mirrors SelectFields.tsx: a value is visible only if it resolves to an option id. */
function rendersAs(field: FieldConfig, value: unknown): unknown {
    if (field.type === FieldType.MULTI_SELECT) {
        if (!Array.isArray(value)) return null;
        return value.map((id) => field.options?.find((option) => option.id === id)?.label ?? null);
    }
    return field.options?.find((option) => option.id === value)?.label ?? null;
}

// --- 1. Regression: agent writes labels, renderers resolve by option id ------
const record = createRecord([statusField, tagsField], [], {
    status: "待拍板",
    tags: ["前端", "后端"],
});
assert.equal(record.status, "1", "single-select label must be stored as the option id");
assert.deepEqual(record.tags, ["1", "2"], "multi-select labels must be stored as option ids");
assert.equal(rendersAs(statusField, record.status), "待拍板");
assert.deepEqual(rendersAs(tagsField, record.tags), ["前端", "后端"]);

// --- 2. Ids keep working, labels match ignoring case and whitespace ----------
assert.deepEqual(sanitizeRecordValues([statusField, tagsField], { status: "2" }).status, "2");
assert.equal(sanitizeRecordValues([statusField], { status: "  待确认 " }).status, "2");
assert.deepEqual(sanitizeRecordValues([tagsField], { tags: [" 前端 ", "后端"] }).tags, ["1", "2"]);

// --- 3. Delimited strings and option-like objects ---------------------------
assert.deepEqual(sanitizeRecordValues([tagsField], { tags: "前端, 后端" }).tags, ["1", "2"]);
assert.deepEqual(sanitizeRecordValues([tagsField], { tags: "前端、后端" }).tags, ["1", "2"]);
assert.equal(sanitizeRecordValues([statusField], { status: { id: "2" } }).status, "2");
assert.equal(sanitizeRecordValues([statusField], { status: { label: "待确认" } }).status, "2");
assert.deepEqual(sanitizeRecordValues([tagsField], { tags: [{ label: "前端" }, { id: "2" }] }).tags, [
    "1",
    "2",
]);

// --- 4. Unknown labels are preserved (never silently dropped) ---------------
assert.equal(sanitizeRecordValues([statusField], { status: "已废弃" }).status, "已废弃");
assert.deepEqual(sanitizeRecordValues([tagsField], { tags: ["前端", "已废弃"] }).tags, ["1", "已废弃"]);

// --- 5. Auto-creation keeps data visible and reports the new options --------
const created = normalizeRecordValues([statusField, tagsField], {
    status: "已废弃",
    tags: ["新标签", "前端"],
}, { createMissingOptions: true });
const createdStatus = created.fields.find((field) => field.id === "status")!;
const createdTags = created.fields.find((field) => field.id === "tags")!;
const createdStatusOption = createdStatus.options!.find((option) => option.label === "已废弃")!;
assert.ok(createdStatusOption, "unknown single-select label must become an option");
assert.equal(created.values.status, createdStatusOption.id);
assert.equal(rendersAs(createdStatus, created.values.status), "已废弃");
assert.equal(created.createdOptions.length, 2, "one new option per field");
assert.deepEqual(
    (created.values.tags as string[]).map((id) => createdTags.options!.find((o) => o.id === id)?.label),
    ["新标签", "前端"]
);

// The original field config must not be mutated by normalisation.
assert.equal(statusField.options!.length, 2);
assert.equal(tagsField.options!.length, 2);

// --- 6. Batch writes share one auto-created option per label ----------------
const batch = normalizeRecordValuesBatch(
    [tagsField],
    [{ tags: ["新增"] }, { tags: ["新增", "前端"] }, { tags: "新增" }],
    { createMissingOptions: true }
);
const batchOptions = batch.fields.find((field) => field.id === "tags")!.options!;
assert.equal(batch.createdOptions.length, 1, "the same label must not be created twice");
assert.equal(batchOptions.length, 3);
const newOptionId = batch.createdOptions[0]!.option.id;
batch.valuesList.forEach((values) => {
    assert.ok((values.tags as string[]).includes(newOptionId), "every record must reference the same option");
});

// --- 7. normalizeOptions: ids, colours, dedupe ------------------------------
const existing: SelectOption[] = [
    { id: "1", label: "前端", color: "#3b82f6" },
    { id: "2", label: "后端", color: "#10b981" },
];
assert.deepEqual(normalizeOptions([{ label: "后端" }, { label: "前端" }], existing), [
    { id: "2", label: "后端", color: "#10b981" },
    { id: "1", label: "前端", color: "#3b82f6" },
]);
assert.deepEqual(
    normalizeOptions([{ label: " A " }, { label: "a" }, { label: "" }]).map((option) => option.label),
    ["A"],
    "labels are trimmed and deduped"
);
assert.deepEqual(normalizeOptions([{ label: "broken", color: "not-a-color" }])[0]!.color, OPTION_COLORS[0]);
assert.deepEqual(normalizeOptions([{ label: "red-ish", color: "#red" }])[0]!.color, "#ef4444");
assert.deepEqual(normalizeOptions([{ label: "red-ish", color: "red" }])[0]!.color, "#ef4444");
assert.deepEqual(normalizeOptions([{ label: "hex", color: "#123abc" }])[0]!.color, "#123abc");
assert.equal(normalizeOptionColor(undefined, 3), OPTION_COLORS[3]);
// 3-digit hex expands, 8-digit hex loses its alpha: both stay renderable.
assert.equal(normalizeOptionColor("#abc"), "#aabbcc");
assert.equal(normalizeOptionColor("#AABBCC"), "#aabbcc");
assert.equal(normalizeOptionColor("#aabbccdd"), "#aabbcc");
assert.equal(getTagStyle("#abc").bg, "#aabbcc20");
assert.equal(getTagStyle("#aabbccdd").bg, "#aabbcc20");

// New options get fresh unique ids, never the index form: a numeric-looking
// label must not be shadowed by some other option's id.
const numericLabels = normalizeOptions([{ label: "3" }, { label: "a" }, { label: "b" }]);
assert.equal(new Set(numericLabels.map((option) => option.id)).size, 3);
assert.equal(resolveOptionId(numericLabels, "3"), numericLabels[0]!.id);
assert.equal(resolveOptionId(numericLabels, "b"), numericLabels[2]!.id);

// Duplicate existing labels keep the first occurrence, matching the resolve path.
assert.equal(
    normalizeOptions(
        [{ label: "dup" }],
        [
            { id: "1", label: "dup", color: "#111111" },
            { id: "2", label: "dup", color: "#222222" },
        ]
    )[0]!.id,
    "1"
);

// A kept option's id survives even when a new option precedes it.
const colliding = normalizeOptions(
    [{ label: "新选项" }, { label: "后端" }],
    [{ id: "1", label: "后端", color: "#10b981" }]
);
assert.equal(colliding.find((option) => option.label === "后端")!.id, "1");
assert.notEqual(colliding.find((option) => option.label === "新选项")!.id, "1");
// A caller-supplied id is honoured as given, including when the option list
// drops the option that used to own it: an explicit id is the caller's intent.
assert.deepEqual(
    normalizeOptions([{ id: "opt-9", label: "自定义" }])[0]!.id,
    "opt-9"
);
assert.deepEqual(
    normalizeOptions([{ id: "1", label: "自定义" }], [{ id: "1", label: "后端", color: "#10b981" }])[0]!.id,
    "1"
);

// A bare number is a "no value" signal: it must never invent an option, while
// still resolving against an option that is genuinely labelled "0".
const zeroField: FieldConfig = {
    id: "score",
    title: "评分",
    type: FieldType.SELECT,
    options: [{ id: "z", label: "0", color: "#3b82f6" }],
};
assert.deepEqual(normalizeSelectValue(zeroField, 0).value, "z");
const invented = normalizeSelectValue(zeroField, 7, { createMissingOptions: true });
assert.equal(invented.createdOptions.length, 0);
assert.equal(invented.resolved, false);
assert.equal(invented.value, 7);

// Deeply nested arrays are fully flattened instead of leaking an array token.
assert.deepEqual(
    normalizeSelectValue(tagsField, [[["前端"]], ["后端"]]).value,
    ["1", "2"]
);

// --- 8. resolveOptionId handles every accepted input shape ------------------
assert.equal(resolveOptionId(tagsField.options, "1"), "1");
assert.equal(resolveOptionId(tagsField.options, "前端"), "1");
assert.equal(resolveOptionId(tagsField.options, { label: "后端" }), "2");
assert.equal(resolveOptionId(tagsField.options, "不存在"), null);

// Readings legacy (label-valued) cells must still resolve, so they stay visible
// and editing them toggles instead of appending a duplicate.
assert.deepEqual(resolveOptionIds(tagsField.options, ["1", "后端"]), ["1", "2"]);
assert.deepEqual(resolveOptionIds(tagsField.options, "前端, 后端".split(", ")), ["1", "2"]);
assert.deepEqual(resolveOptionIds(statusField.options, "待拍板"), ["1"]);
assert.deepEqual(resolveOptionIds(tagsField.options, null), []);
assert.deepEqual(resolveOptionIds(tagsField.options, ["前端", "前端"]), ["1"]);

// --- 9. Unrenderable stored colours no longer produce broken CSS ------------
assert.equal(getTagStyle("#3b82f6").text, "#60a5fa");
assert.equal(getTagStyle("#red").bg, "rgba(107, 114, 128, 0.2)");
assert.equal(getTagStyle("#6b7280").bg, "#6b7280" + "20");

// --- 10. Sanitisation contract is unchanged ---------------------------------
const withSystemFields = createRecords(
    [
        { id: "recordNumber", title: "ID", type: FieldType.ID },
        { id: "createdTime", title: "创建时间", type: FieldType.CREATED_TIME },
        statusField,
    ],
    [],
    [{ recordNumber: 99, createdTime: "2020-01-01T00:00:00.000Z", status: "待拍板" }]
);
assert.notEqual(withSystemFields[0]!.recordNumber, 99, "read-only ID field must not accept caller values");
assert.notEqual(withSystemFields[0]!.createdTime, "2020-01-01T00:00:00.000Z");
assert.equal(withSystemFields[0]!.status, "1");

console.log("select value checks passed");
