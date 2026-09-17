/**
 * Section props: the typed bridge between the admin CMS "自定义 props"
 * editor (landing_resource · SECTION) and the React sections.
 *
 * Everything is defensive — props arrive as arbitrary JSON from the CMS,
 * so a malformed value must fall back to the built-in default rather than
 * break the marketing page.
 */

export type SectionProps = Record<string, unknown> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export function readString(props: SectionProps, key: string, fallback: string): string {
    if (!isRecord(props)) return fallback;
    const value = props[key];
    return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function readStringArray(props: SectionProps, key: string, fallback: string[]): string[] {
    if (!isRecord(props)) return fallback;
    const value = props[key];
    if (!Array.isArray(value)) return fallback;
    const items = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
    return items.length > 0 ? items : fallback;
}

export function readBoolean(props: SectionProps, key: string, fallback: boolean): boolean {
    if (!isRecord(props)) return fallback;
    const value = props[key];
    return typeof value === "boolean" ? value : fallback;
}

export function readNumber(props: SectionProps, key: string, fallback: number, min?: number, max?: number): number {
    if (!isRecord(props)) return fallback;
    const value = props[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    let next = value;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    return next;
}

export function readEnum<T extends string>(
    props: SectionProps,
    key: string,
    allowed: readonly T[],
    fallback: T,
): T {
    if (!isRecord(props)) return fallback;
    const value = props[key];
    return typeof value === "string" && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback;
}
