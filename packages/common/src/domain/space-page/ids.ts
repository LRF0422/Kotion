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

export const normalizeOptionalId = (
    value: IdInput | null | undefined,
    label = "id"
): string | undefined => value == null ? undefined : normalizeId(value, label);

export const normalizeNullableId = (
    value: IdInput | null | undefined,
    label = "id"
): string | null => value == null ? null : normalizeId(value, label);

export const normalizeIds = (values: readonly IdInput[], label = "id"): string[] =>
    values.map((value, index) => normalizeId(value, `${label}[${index}]`));
