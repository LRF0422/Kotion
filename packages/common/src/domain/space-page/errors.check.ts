import { PAGE_IN_TRASH_ERROR_CODE, isPageInTrashError } from "./errors";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

assert(PAGE_IN_TRASH_ERROR_CODE === 3017, "the page-in-trash code must match WikiException.PAGE_IN_TRASH");
assert(isPageInTrashError({ code: 3017 }), "an error carrying 3017 is a trashed-page rejection");
assert(!isPageInTrashError({ code: 3001 }), "PAGE_NOT_FOUND is a different outcome");
assert(!isPageInTrashError({ code: "3017" }), "the code is numeric on the wire; strings must not match");
assert(!isPageInTrashError(new Error("Page is in the trash")), "a message alone is not a reliable signal");
assert(!isPageInTrashError(undefined), "a missing error is not a trashed-page rejection");
assert(!isPageInTrashError(null), "a null error is not a trashed-page rejection");

console.log("space-page error-code checks passed");
