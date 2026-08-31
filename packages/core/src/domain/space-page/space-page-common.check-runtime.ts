export const normalizeId = (value: string | number | bigint, label = "id"): string => {
    if (value === null || value === undefined) throw new TypeError(`${label} is invalid`);
    if (typeof value === "number" && !Number.isSafeInteger(value)) throw new TypeError(`${label} is invalid`);
    const normalized = String(value).trim();
    if (!normalized) throw new TypeError(`${label} is invalid`);
    return normalized;
};
export const normalizeOptionalId = (value: any, label = "id"): string | undefined => value == null ? undefined : normalizeId(value, label);
export const normalizeNullableId = (value: any, label = "id"): string | null => value == null ? null : normalizeId(value, label);

export const createSpacePageChangeStream = () => {
    const all = new Set<(change: any) => void>();
    const typed = new Map<string, Set<(change: any) => void>>();
    const publish = (change: any) => {
        const normalized = { ...change, timestamp: change.timestamp ?? Date.now() };
        all.forEach((listener) => listener(normalized));
        typed.get(change.type)?.forEach((listener) => listener(normalized));
    };
    return {
        emit: (type: string, payload: unknown, options?: object) => publish({ type, payload, ...options }),
        publish,
        subscribe: (typeOrListener: string | ((change: any) => void), listener?: (change: any) => void) => {
            if (typeof typeOrListener === "function") { all.add(typeOrListener); return () => all.delete(typeOrListener); }
            const listeners = typed.get(typeOrListener) ?? new Set();
            if (listener) listeners.add(listener);
            typed.set(typeOrListener, listeners);
            return () => { if (listener) listeners.delete(listener); };
        },
    };
};

export const request = { defaults: { baseURL: "/api" } };
export const getBearerHeader = (): Record<string, string> => ({});
export const handleRequest = async (): Promise<never> => { throw new Error("default transport is not used by this check"); };
