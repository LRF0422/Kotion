export type EntityId = string;
export type SpaceId = EntityId;
export type PageId = EntityId;
export type BlockId = EntityId;
export type UserId = EntityId;
export type CommentId = EntityId;
export type InvitationId = EntityId;
export type TemplateId = EntityId;
export type ShareCode = string;
export type ClientId = string;
export type IdInput = string | number | bigint;

/** Normalize backend ids at the transport boundary so domain models only expose strings. */
export const normalizeId = (value: IdInput, label = "id"): string => {
    if (value === null || value === undefined) {
        throw new TypeError(`${label} must be a safe integer, bigint, or non-empty string`);
    }
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
        throw new TypeError(`${label} must be a safe integer, bigint, or non-empty string`);
    }

    const normalized = String(value).trim();
    if (!normalized) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return normalized;
};

/**
 * Backend string id columns (e.g. WikiBlock.parentId) serialize "no id" as an
 * empty/blank string rather than null. For optional ids that means "absent", not
 * an invalid id, so coerce blanks instead of throwing.
 */
const isBlankId = (value: IdInput): boolean => typeof value === "string" && value.trim() === "";

export const normalizeOptionalId = (
    value: IdInput | null | undefined,
    label = "id"
): string | undefined => value == null || isBlankId(value) ? undefined : normalizeId(value, label);

export const normalizeNullableId = (
    value: IdInput | null | undefined,
    label = "id"
): string | null => value == null || isBlankId(value) ? null : normalizeId(value, label);

export const normalizeIds = (values: readonly IdInput[], label = "id"): string[] =>
    values.map((value, index) => normalizeId(value, `${label}[${index}]`));
