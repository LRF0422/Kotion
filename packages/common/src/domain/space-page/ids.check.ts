import {
    normalizeId,
    normalizeIds,
    normalizeNullableId,
    normalizeOptionalId,
} from "./ids";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

assert(normalizeId(" 42 ") === "42", "string ids should be trimmed");
assert(normalizeId(42) === "42", "numeric ids should normalize to strings");
assert(normalizeId(42n) === "42", "bigint ids should normalize without precision loss");
assert(normalizeOptionalId(undefined) === undefined, "optional undefined ids should stay undefined");
assert(normalizeNullableId(null) === null, "nullable ids should preserve null");
assert(normalizeIds([1, "2", 3n]).join(",") === "1,2,3", "id lists should normalize in order");

let rejected = 0;
const invalidValues: unknown[] = [
    " ",
    null,
    undefined,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    1.5,
];
for (const value of invalidValues) {
    try {
        normalizeId(value as never);
    } catch (error) {
        if (error instanceof TypeError) rejected++;
    }
}
assert(rejected === invalidValues.length, "missing, blank, non-finite, unsafe, and fractional ids should be rejected");

console.log("space-page ids checks passed");
