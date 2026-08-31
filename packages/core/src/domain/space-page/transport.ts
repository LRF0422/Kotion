import {
    getBearerHeader,
    handleRequest,
    request,
    type API,
} from "@kn/common";
import type { SpacePageEndpoint } from "./api";

export interface SpacePageTransportRequest {
    endpoint: SpacePageEndpoint;
    params?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
}

export interface SpacePageKeepaliveRequest {
    endpoint: SpacePageEndpoint;
    pathParams?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
}

export interface SpacePageTransport {
    execute<T = unknown>(request: SpacePageTransportRequest): Promise<T>;
    keepalive(request: SpacePageKeepaliveRequest): void | Promise<unknown>;
}

const fillPathParams = (template: string, params: Record<string, unknown> = {}): string =>
    Object.entries(params).reduce(
        (url, [key, value]) => url.split(`:${key}`).join(encodeURIComponent(String(value))),
        template
    );

const withQuery = (url: string, query?: Record<string, unknown>): string => {
    if (!query) return url;
    const values = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) value.forEach((item) => values.append(key, String(item)));
        else values.append(key, String(value));
    });
    const suffix = values.toString();
    return suffix ? `${url}${url.includes("?") ? "&" : "?"}${suffix}` : url;
};

/** Best-effort authenticated fetch suitable for release/flush during pagehide. */
export const sendSpacePageKeepalive = ({
    endpoint,
    pathParams,
    query,
    body,
}: SpacePageKeepaliveRequest): Promise<unknown> => {
    const baseUrl = (request as any)?.defaults?.baseURL ?? "/api";
    const url = withQuery(`${baseUrl}${fillPathParams(endpoint.url, pathParams)}`, query);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const init: RequestInit = {
        method: endpoint.method,
        headers: {
            ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
            ...getBearerHeader(),
        },
        ...(payload === undefined ? {} : { body: payload }),
        ...(payload !== undefined && payload.length <= 60_000 ? { keepalive: true } : {}),
    };
    return fetch(url, init).then(response => {
        if (!response.ok) {
            throw new Error(`Space/Page keepalive request failed with HTTP ${response.status}`);
        }
        return response;
    });
};

export const createCommonSpacePageTransport = (): SpacePageTransport => ({
    async execute<T>({ endpoint, params, body, headers }: SpacePageTransportRequest): Promise<T> {
        const response = await handleRequest(
            endpoint as API<T, Record<string, unknown>, unknown>,
            params,
            body,
            headers
        );
        return response.data;
    },
    keepalive: sendSpacePageKeepalive,
});
