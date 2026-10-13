import { strict as assert } from "node:assert";
import { FieldType } from "../../types/index.js";
import type { FieldConfig } from "../../types/index.js";
import { buildFieldsConfig, buildDefaultViews, processInitialData } from "./dataBuilders.js";

/**
 * End-to-end check of the AI tool data path: `buildFieldsConfig` +
 * `processInitialData` behave exactly like `insertBitable(initialData)`.
 */

const { fields, titleToIdMap } = buildFieldsConfig([
    {
        title: "任务",
        type: "text",
    },
    {
        title: "状态",
        type: "select",
        options: [{ label: "待拍板", color: "red" }, { label: "待确认", color: "#f59e0b" }],
    },
    {
        title: "标签",
        type: "multi_select",
        options: [{ label: "前端", color: "blue" }, { label: "后端" }],
    },
    {
        title: "负责人",
        type: "person",
    },
]);

assert.equal(titleToIdMap["状态"], "状态", "field ids are the field titles the agent supplied");
const statusField = fields.find((field) => field.title === "状态")!;
const tagsField = fields.find((field) => field.title === "标签")!;
assert.deepEqual(
    statusField.options!.map((option) => [option.label, option.color]),
    [
        ["待拍板", "#ef4444"],
        ["待确认", "#f59e0b"],
    ],
    "named colours are mapped onto the tag palette"
);
assert.equal(
    new Set(statusField.options!.map((option) => option.id)).size,
    2,
    "option ids are unique and generated (never the index form)"
);
assert.equal(tagsField.options![1]!.color, "#10b981", "colour-less options get a palette colour");

// Views are built after option normalisation, so kanban groups by the select field.
const views = buildDefaultViews(fields);
assert.equal(views.find((view) => view.type === "kanban")!.kanbanConfig!.groupByField, statusField.id);

const [waiting, confirming] = statusField.options!;
const [frontend, backend] = tagsField.options!;

const processed = processInitialData(
    [
        { 任务: "写文档", 状态: "待拍板", 标签: ["前端", "后端"] },
        { 任务: "改表格", 状态: "待确认", 标签: "前端, 后端" },
        { 任务: "补数据", 状态: "待拍板", 标签: ["新标签"] },
    ],
    titleToIdMap,
    fields
);

assert.equal(processed.data.length, 3);
assert.equal(processed.data[0]![statusField.id], waiting!.id, "label resolves to the option id");
assert.deepEqual(processed.data[0]![tagsField.id], [frontend!.id, backend!.id]);
assert.deepEqual(processed.data[1]![tagsField.id], [frontend!.id, backend!.id], "delimited multi-select input is split");
assert.equal(processed.data[0]![titleToIdMap["任务"]!], "写文档");

// The unknown label became an option, is shared by the batch and resolves back.
const createdOption = processed.createdOptions[0]!;
assert.equal(processed.createdOptions.length, 1);
assert.equal(createdOption.fieldId, tagsField.id);
assert.equal(createdOption.option.label, "新标签");
assert.deepEqual(processed.data[2]![tagsField.id], [createdOption.option.id]);
const processedTags = processed.fields.find((field) => field.id === tagsField.id)!;
assert.deepEqual(
    (processed.data[2]![tagsField.id] as string[]).map(
        (id) => processedTags.options!.find((option) => option.id === id)?.label
    ),
    ["新标签"]
);

// Every select cell the agent wrote must be visible in the renderer.
const visibleCells = processed.data.flatMap((record) =>
    [statusField, processedTags].map((field) => {
        const value = record[field.id];
        const ids = Array.isArray(value) ? value : [value];
        return ids.map(
            (id) => field.options!.find((option) => option.id === id)?.label ?? null
        );
    })
);
assert.ok(
    visibleCells.every((labels) => labels.every((label) => label !== null)),
    "no agent-written select value may render as an empty cell"
);

// Records without any select value still get sane defaults.
const empty = processInitialData([{ 任务: "空行" }], titleToIdMap, fields);
assert.equal(empty.data[0]![statusField.id], null);
assert.deepEqual(empty.data[0]![tagsField.id], []);

console.log("bitable tool helper checks passed");
