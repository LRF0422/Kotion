import { strict as assert } from "node:assert";
import { FieldType, FilterOperator } from "../types/index.js";
import type { FieldConfig, RecordData, FilterConfig } from "../types/index.js";
import { applyFilters, applyGroups } from "./dataProcessing.js";

/**
 * Select filtering must agree with what the cells render: a filter written with
 * the option label has to match a record that stores the option id (and legacy
 * records that still store the label).
 */

const fields: FieldConfig[] = [
    {
        id: "status",
        title: "状态",
        type: FieldType.SELECT,
        options: [
            { id: "1", label: "待拍板", color: "#ef4444" },
            { id: "2", label: "待确认", color: "#f59e0b" },
        ],
    },
    {
        id: "tags",
        title: "标签",
        type: FieldType.MULTI_SELECT,
        options: [
            { id: "1", label: "前端", color: "#3b82f6" },
            { id: "2", label: "后端", color: "#10b981" },
        ],
    },
    { id: "name", title: "名称", type: FieldType.TEXT },
    { id: "points", title: "点数", type: FieldType.NUMBER },
];

const data: RecordData[] = [
    // Values written by the normalised write path (option ids).
    { id: "r1", status: "1", tags: ["1", "2"], name: "Alpha", points: 10 },
    // Legacy record that still stores labels.
    { id: "r2", status: "待确认", tags: ["后端"], name: "beta", points: 3 },
    { id: "r3", status: null, tags: [], name: "", points: 0 },
];

const filter = (fieldId: string, operator: FilterOperator, value?: any): FilterConfig =>
    ({ id: `${fieldId}-${operator}`, fieldId, operator, value }) as FilterConfig;

const ids = (result: RecordData[]) => result.map((record) => record.id);

// equals: label filter matches id-stored and label-stored records alike
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.EQUALS, "待拍板")], fields)), ["r1"]);
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.EQUALS, "待确认")], fields)), ["r2"]);
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.EQUALS, "2")], fields)), ["r2"]);
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.EQUALS, "不存在")], fields)), []);

// not_equals includes the empty record
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.NOT_EQUALS, "待拍板")], fields)), ["r2", "r3"]);

// contains on a multi-select means "has this option"
assert.deepEqual(ids(applyFilters(data, [filter("tags", FilterOperator.CONTAINS, "后端")], fields)), ["r1", "r2"]);
assert.deepEqual(ids(applyFilters(data, [filter("tags", FilterOperator.NOT_CONTAINS, "后端")], fields)), ["r3"]);
assert.deepEqual(ids(applyFilters(data, [filter("tags", FilterOperator.CONTAINS, "2")], fields)), ["r1", "r2"]);

// any_of / none_of
assert.deepEqual(
    ids(applyFilters(data, [filter("tags", FilterOperator.IS_ANY_OF, ["前端", "后端"])], fields)),
    ["r1", "r2"]
);
assert.deepEqual(
    ids(applyFilters(data, [filter("tags", FilterOperator.IS_ANY_OF, ["前端"])], fields)),
    ["r1"]
);
assert.deepEqual(
    ids(applyFilters(data, [filter("tags", FilterOperator.IS_NONE_OF, ["前端"])], fields)),
    ["r2", "r3"]
);

// empty handling for arrays and missing values
assert.deepEqual(ids(applyFilters(data, [filter("tags", FilterOperator.IS_EMPTY)], fields)), ["r3"]);
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.IS_NOT_EMPTY)], fields)), ["r1", "r2"]);

// FilterPanel's default filter is `equals` with an empty value; a null select
// cell has to keep matching it (the filter is "is empty", not "matches nothing").
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.EQUALS, "")], fields)), ["r3"]);
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.EQUALS)], fields)), ["r3"]);

// Partial text on a legacy label cell still matches through the substring
// fallback, so free-text filters do not regress.
assert.deepEqual(ids(applyFilters(data, [filter("status", FilterOperator.CONTAINS, "待")], fields)), ["r2"]);

// non-select fields keep the previous (case-insensitive substring) behaviour
assert.deepEqual(ids(applyFilters(data, [filter("name", FilterOperator.CONTAINS, "ALP")], fields)), ["r1"]);
assert.deepEqual(ids(applyFilters(data, [filter("name", FilterOperator.EQUALS, "beta")], fields)), ["r2"]);
assert.deepEqual(ids(applyFilters(data, [filter("points", FilterOperator.GREATER_THAN, 5)], fields)), ["r1"]);

// filters whose field no longer exists are ignored; and/or logic still applies
assert.deepEqual(ids(applyFilters(data, [filter("gone", FilterOperator.EQUALS, "x")], fields)), ["r1", "r2", "r3"]);
assert.deepEqual(
    ids(
        applyFilters(
            data,
            [filter("status", FilterOperator.EQUALS, "待拍板"), filter("name", FilterOperator.EQUALS, "beta")],
            fields,
            "or"
        )
    ),
    ["r1", "r2"]
);

// grouping by a select field still folds ids and labels into one group
const grouped = applyGroups(data, [{ fieldId: "status", order: "asc" } as any], fields);
assert.deepEqual([...grouped.keys()].sort(), ["", "待拍板", "待确认"]);
assert.deepEqual(ids(grouped.get("待拍板")!), ["r1"]);
assert.deepEqual(ids(grouped.get("待确认")!), ["r2"]);

console.log("data processing checks passed");
