import { strict as assert } from "node:assert";
import { FieldType } from "../types/index.js";
import type { FieldConfig, RecordData, SelectOption } from "../types/index.js";
import {
    convertFieldValue,
    prepareSelectOptions,
} from "./fieldConversion.js";

const textField: FieldConfig = { id: "status", title: "Status", type: FieldType.TEXT };
const records = Array.from({ length: 60 }, (_, index) => ({
    id: String(index),
    status: `Value ${index}`,
})) as RecordData[];
const sourceSnapshot = JSON.stringify(records);
const generated = prepareSelectOptions(records, textField);
assert.equal(generated.length, 60, "all distinct values must receive an option");
records.forEach((record) => {
    const converted = convertFieldValue(
        record.status,
        FieldType.TEXT,
        FieldType.SELECT,
        { ...textField, type: FieldType.SELECT, options: generated },
        textField
    );
    assert.ok(converted, `value ${record.status} must remain mapped`);
});
assert.equal(JSON.stringify(records), sourceSnapshot, "conversion helpers must not mutate records");

const options: SelectOption[] = [
    { id: "open", label: "Open", color: "#111" },
    { id: "closed", label: "Closed", color: "#222" },
];
const selectField: FieldConfig = {
    id: "status",
    title: "Status",
    type: FieldType.SELECT,
    options,
};
const multiField: FieldConfig = {
    ...selectField,
    type: FieldType.MULTI_SELECT,
    options: prepareSelectOptions([], selectField),
};
assert.deepEqual(multiField.options, options);
assert.deepEqual(
    convertFieldValue("open", FieldType.SELECT, FieldType.MULTI_SELECT, multiField, selectField),
    ["open"]
);
assert.equal(
    convertFieldValue(["closed", "open"], FieldType.MULTI_SELECT, FieldType.SELECT, selectField, multiField),
    "closed"
);
assert.equal(
    convertFieldValue("closed", FieldType.SELECT, FieldType.TEXT, undefined, selectField),
    "Closed"
);
assert.equal(
    convertFieldValue(["open", "closed"], FieldType.MULTI_SELECT, FieldType.TEXT, undefined, multiField),
    "Open, Closed"
);

const whitespaceRecords = [
    { id: "1", status: " Open " },
    { id: "2", status: "open" },
] as RecordData[];
const normalizedOptions = prepareSelectOptions(whitespaceRecords, textField);
assert.equal(normalizedOptions.length, 1);
assert.equal(
    convertFieldValue(
        " Open ",
        FieldType.TEXT,
        FieldType.SELECT,
        { ...textField, type: FieldType.SELECT, options: normalizedOptions },
        textField
    ),
    normalizedOptions[0].id
);

console.log("field conversion checks passed");
