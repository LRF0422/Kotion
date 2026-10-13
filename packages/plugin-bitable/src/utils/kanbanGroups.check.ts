import { strict as assert } from "node:assert";
import { FieldType } from "../types/index.js";
import type { FieldConfig, RecordData } from "../types/index.js";
import { buildKanbanColumns, valueForColumnKey } from "./kanbanGroups.js";

const field: FieldConfig = {
    id: "status",
    title: "状态",
    type: FieldType.SELECT,
    options: [
        { id: "1", label: "待拍板", color: "#ef4444" },
        { id: "2", label: "待确认", color: "#f59e0b" },
    ],
};
const labels = { uncategorized: "(未分类)", yes: "是", no: "否" };

const data: RecordData[] = [
    { id: "r1", status: "1" }, // normalised id
    { id: "r2", status: "待拍板" }, // legacy label for the same option
    { id: "r3", status: "2" },
    { id: "r4", status: null },
];

const columns = buildKanbanColumns(field, data, labels);

// One column per option plus the unassigned column — a legacy label must not
// create a second "待拍板" column.
assert.deepEqual(
    columns.map((column) => column.key),
    ["1", "2", "__unassigned__"]
);
assert.deepEqual(columns[0]!.records.map((record) => record.id), ["r1", "r2"]);
assert.equal(columns[0]!.label, "待拍板");
assert.equal(columns[0]!.color, "#ef4444");
assert.deepEqual(columns[1]!.records.map((record) => record.id), ["r3"]);
assert.deepEqual(columns[2]!.records.map((record) => record.id), ["r4"]);

// Dropping a card writes the canonical option id back, healing legacy cells.
assert.equal(valueForColumnKey(field, "1"), "1");
assert.equal(valueForColumnKey(field, "__unassigned__"), null);

// Non-select grouping is untouched.
const textField: FieldConfig = { id: "owner", title: "负责人", type: FieldType.TEXT };
const textColumns = buildKanbanColumns(textField, [{ id: "r5", owner: "梁" }], labels);
assert.deepEqual(textColumns.map((column) => column.key), ["梁"]);

console.log("kanban grouping checks passed");
