import { strict as assert } from "node:assert";
import { FieldType, ViewType, ChartType } from "../types/index.js";
import type { FieldConfig, RecordData, ViewConfig } from "../types/index.js";
import { createRecord, createRecords } from "./record.js";
import { normalizeRecordIdentity } from "./recordIdentity.js";

const legacyFields: FieldConfig[] = [
    { id: "id", title: "ID", type: FieldType.ID },
    { id: "recordNumber", title: "Existing", type: FieldType.NUMBER },
    { id: "name", title: "Name", type: FieldType.TEXT },
];
const legacyViews: ViewConfig[] = [
    {
        id: "view",
        name: "All references",
        type: ViewType.CHART,
        filters: [{ id: "filter", fieldId: "id", operator: "equals" as any, value: 1 }],
        sorts: [{ id: "sort", fieldId: "id", direction: "asc" }],
        groups: [{ fieldId: "id" }],
        hiddenFields: ["id"],
        fieldOrder: ["id", "name"],
        kanbanConfig: { groupByField: "id", cardCoverField: "id", displayFields: ["id"] },
        galleryConfig: { coverField: "id", fitType: "cover", cardSize: "medium", displayFields: ["id"] },
        calendarConfig: { dateField: "id", endDateField: "id", titleField: "id" },
        timelineConfig: {
            startDateField: "id",
            endDateField: "id",
            titleField: "id",
            progressField: "id",
            groupByField: "id",
            milestoneField: "id",
            dependencyField: "id",
            colorField: "id",
        },
        formConfig: { fieldIds: ["id"] },
        chartConfig: {
            chartType: ChartType.BAR,
            xAxisField: "id",
            yAxisFields: [{ fieldId: "id", color: "#000" }],
            groupByField: "id",
        },
    },
];
const legacyData = [
    { id: 1, name: "one" },
    { id: 3, name: "three" },
    { id: 3, name: "duplicate" },
    { id: null, name: "missing" },
] as unknown as RecordData[];

const migrated = normalizeRecordIdentity(legacyFields, legacyViews, legacyData);
assert.equal(migrated.changed, true);
const numberField = migrated.fields.find((field) => field.type === FieldType.ID);
assert.equal(numberField?.id, "recordNumber_2");
assert.deepEqual(migrated.data.map((record) => record[numberField!.id]), [1, 3, 4, 5]);
assert.equal(migrated.data[0].id, "1");
assert.equal(migrated.data[1].id, "3");
assert.notEqual(migrated.data[2].id, "3");
assert.equal(new Set(migrated.data.map((record) => record.id)).size, migrated.data.length);
assert.equal(migrated.views[0].filters?.[0].fieldId, numberField?.id);
assert.equal(migrated.views[0].timelineConfig?.dependencyField, numberField?.id);
assert.equal(migrated.views[0].chartConfig?.yAxisFields[0].fieldId, numberField?.id);

const secondPass = normalizeRecordIdentity(migrated.fields, migrated.views, migrated.data);
assert.equal(secondPass.changed, false, "identity migration must be idempotent");

const newFields: FieldConfig[] = [
    { id: "recordNumber", title: "ID", type: FieldType.ID },
    { id: "name", title: "Name", type: FieldType.TEXT },
];
const existing = [
    { id: "a", recordNumber: 1 },
    { id: "b", recordNumber: 3 },
] as RecordData[];
const created = createRecord(newFields, existing, { id: "caller-id", recordNumber: 99, name: "new" } as any);
assert.equal(typeof created.id, "string");
assert.notEqual(created.id, "caller-id");
assert.equal(created.recordNumber, 4);
assert.equal(created.name, "new");

const bulk = createRecords(newFields, existing, [{ name: "first" }, { name: "second" }]);
assert.deepEqual(bulk.map((record) => record.recordNumber), [4, 5]);
assert.equal(new Set(bulk.map((record) => record.id)).size, 2);

console.log("record identity checks passed");
