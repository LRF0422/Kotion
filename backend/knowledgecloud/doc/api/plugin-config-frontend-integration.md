# Plugin Config Frontend Integration Guide

## Overview

The Plugin Config service lets every client-side plugin persist a per-user JSON
blob keyed by a `pluginKey`. The backend is intentionally schema-less for the
`config` payload so each plugin owns its own shape.

The recommended integration pattern is **Hybrid Storage**: the renderer/Web app
calls the backend first, and falls back to `localStorage` on failure. This lets
the UI keep working offline or while a user's token is being refreshed, and it
makes migration seamless for users who already have local-only data.

**Service Base URL**

| Environment | URL |
|-------------|-----|
| Direct (wiki service) | `http://<wiki-host>:<wiki-port>` |
| Via Gateway | `http://<gateway-host>:<gateway-port>/knowledge-wiki` |

All examples below use the gateway form, which is the production path.

## Table of Contents

1. [Authentication](#authentication)
2. [API Endpoints](#api-endpoints)
3. [Data Models](#data-models)
4. [Integration Examples](#integration-examples)
5. [Electron IPC Bridge](#electron-ipc-bridge)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## Authentication

Every request must carry the user's JWT. The backend resolves `userId` from the
token via `SecurityContextUtil.getUserId()`, so the caller never supplies a user
id explicitly.

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Blade-Auth':    `bearer ${token}`,
  'Content-Type':  'application/json'
}
```

Requests without a valid token will be rejected by the gateway filter before
reaching the service.

---

## API Endpoints

All three endpoints are mounted under `/knowledge-wiki/plugin-config` when
accessed through the gateway.

| Method | Path                                       | Purpose                               |
|--------|--------------------------------------------|---------------------------------------|
| `GET`  | `/knowledge-wiki/plugin-config/:pluginKey` | Read the current user's config        |
| `POST` | `/knowledge-wiki/plugin-config/:pluginKey` | Upsert (create or replace) the config |
| `GET`  | `/knowledge-wiki/plugin-config`            | Batch read all configs for the user   |

### pluginKey constraints

| Rule               | Value                  |
|--------------------|------------------------|
| Allowed charset    | `^[A-Za-z0-9._-]+$`    |
| Max length         | 128 characters         |
| Must be non-blank  | Yes                    |

A value that violates these rules is rejected with HTTP 400 before any DB work.

---

### 1. Get a single plugin config

`GET /knowledge-wiki/plugin-config/:pluginKey`

#### Path parameters

| Name        | Type   | Required | Description                                |
|-------------|--------|----------|--------------------------------------------|
| `pluginKey` | string | yes      | Plugin identifier, e.g. `ai-assistant`     |

#### 200 OK — record exists

```json
{
  "code": 200,
  "success": true,
  "msg": "success",
  "data": {
    "id": 1,
    "userId": 10001,
    "pluginKey": "ai-assistant",
    "config": {
      "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
      "enableAutoComplete": true
    },
    "createdAt": "2025-06-01T10:00:00",
    "updatedAt": "2025-06-15T14:30:00"
  }
}
```

#### 200 OK — record missing (business code 404)

The current user has not saved this plugin yet. The HTTP status is still 200
so that a generic HTTP error interceptor does not treat an empty state as an
error; the caller must branch on `code`.

```json
{
  "code": 404,
  "success": false,
  "msg": "Plugin config not found",
  "data": null
}
```

> **Integration rule:** treat `code === 404` as *"first-time install"*; render
> defaults, keep writes going to `localStorage`, and the next successful
> `POST` will create the row on the server.

---

### 2. Upsert a plugin config

`POST /knowledge-wiki/plugin-config/:pluginKey`

#### Path parameters

| Name        | Type   | Required | Description         |
|-------------|--------|----------|---------------------|
| `pluginKey` | string | yes      | Plugin identifier   |

#### Request body

```json
{
  "config": {
    "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
    "apiKey": "sk-xxx",
    "enableAutoComplete": true,
    "maxTokens": 4096
  }
}
```

| Field    | Type   | Required | Description                                       |
|----------|--------|----------|---------------------------------------------------|
| `config` | object | yes      | Arbitrary JSON. Shape is owned by the plugin.     |

#### 200 OK

Returns the full persisted record, including server-assigned `id`, `userId`
and audit timestamps.

```json
{
  "code": 200,
  "success": true,
  "msg": "success",
  "data": {
    "id": 1,
    "userId": 10001,
    "pluginKey": "ai-assistant",
    "config": { "apiEndpoint": "https://api.deepseek.com/v1/chat/completions" },
    "createdAt": "2025-06-01T10:00:00",
    "updatedAt": "2025-06-15T14:30:00"
  }
}
```

#### Semantics

- If `(userId, pluginKey)` already exists → UPDATE `config` + `updateTime`.
- Otherwise → INSERT a new row.
- The whole operation runs in a single transaction. Concurrent inserts are
  detected via the `uk_user_plugin` unique index and automatically fall back
  to an update, so the endpoint is safe to retry.

---

### 3. Get all plugin configs for the current user

`GET /knowledge-wiki/plugin-config`

#### 200 OK

```json
{
  "code": 200,
  "success": true,
  "msg": "success",
  "data": [
    {
      "id": 1,
      "userId": 10001,
      "pluginKey": "ai-assistant",
      "config": { "apiEndpoint": "..." },
      "createdAt": "2025-06-01T10:00:00",
      "updatedAt": "2025-06-15T14:30:00"
    },
    {
      "id": 2,
      "userId": 10001,
      "pluginKey": "excalidraw",
      "config": { "theme": "dark" },
      "createdAt": "2025-06-10T09:00:00",
      "updatedAt": "2025-06-10T09:00:00"
    }
  ]
}
```

Use this endpoint once at application startup to hydrate a global
`PluginConfigStore`, instead of issuing N parallel `GET /:pluginKey` calls.

---

## Data Models

### TypeScript

```ts
/** Response envelope used by every knowledge-* service. */
export interface ApiResponse<T> {
  code: number;          // HTTP-style status: 200, 400, 401, 404, 500
  success: boolean;      // true ⇔ code === 200
  msg: string;
  data: T | null;
}

/** Persisted plugin config record. */
export interface PluginConfig<TConfig = Record<string, unknown>> {
  id: number;
  userId: number;
  pluginKey: string;
  config: TConfig;
  /** ISO-8601 local date-time (no timezone suffix). */
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /plugin-config/:pluginKey. */
export interface SavePluginConfigRequest<TConfig = Record<string, unknown>> {
  config: TConfig;
}
```

### Timestamp format

`createdAt` / `updatedAt` are serialized as local-time ISO strings
(`2025-06-15T14:30:00`) without a `Z` suffix, because `BaseEntity` uses
`LocalDateTime`. Parse with `new Date(s.replace(' ', 'T'))` or `dayjs(s)`.

---

## Integration Examples

### Minimal API client

```ts
const BASE = '/knowledge-wiki/plugin-config';

function authHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Blade-Auth':    `bearer ${token}`,
    'Content-Type':  'application/json',
  };
}

export async function getPluginConfig<T>(
  pluginKey: string, token: string,
): Promise<PluginConfig<T> | null> {
  const res = await fetch(`${BASE}/${encodeURIComponent(pluginKey)}`, {
    method: 'GET', headers: authHeaders(token),
  });
  const body: ApiResponse<PluginConfig<T>> = await res.json();
  if (body.code === 404) return null;           // first-time install
  if (!body.success) throw new PluginConfigError(body);
  return body.data;
}

export async function savePluginConfig<T>(
  pluginKey: string, config: T, token: string,
): Promise<PluginConfig<T>> {
  const res = await fetch(`${BASE}/${encodeURIComponent(pluginKey)}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ config }),
  });
  const body: ApiResponse<PluginConfig<T>> = await res.json();
  if (!body.success || !body.data) throw new PluginConfigError(body);
  return body.data;
}

export async function getAllPluginConfigs(
  token: string,
): Promise<PluginConfig[]> {
  const res = await fetch(BASE, { method: 'GET', headers: authHeaders(token) });
  const body: ApiResponse<PluginConfig[]> = await res.json();
  if (!body.success) throw new PluginConfigError(body);
  return body.data ?? [];
}

class PluginConfigError extends Error {
  code: number;
  constructor(body: ApiResponse<unknown>) {
    super(body.msg);
    this.code = body.code;
  }
}
```

### Hybrid Storage store

The store is the object a plugin actually consumes. It keeps the last known
good copy in `localStorage` so the UI is synchronous on read, and it writes
through to the backend asynchronously.

```ts
const LS_PREFIX = 'pluginConfig:';

export class PluginConfigStore<T extends Record<string, unknown>> {
  private cache: T;
  private saving = Promise.resolve();

  constructor(
    private readonly pluginKey: string,
    private readonly defaults: T,
    private readonly getToken: () => string,
  ) {
    this.cache = this.readLocal() ?? { ...defaults };
  }

  /** Call once at app boot (or on login). */
  async initialize(): Promise<T> {
    try {
      const remote = await getPluginConfig<T>(this.pluginKey, this.getToken());
      if (remote) {
        this.cache = { ...this.defaults, ...remote.config };
        this.writeLocal(this.cache);
      } else if (Object.keys(this.readLocal() ?? {}).length) {
        // First login on a new device: push local config up.
        await this.flush();
      }
    } catch (err) {
      console.warn('[PluginConfig] remote fetch failed, using local cache', err);
    }
    return this.cache;
  }

  get(): T { return this.cache; }

  /** Merge + persist. Safe to call on every keystroke; writes are debounced. */
  set(patch: Partial<T>): void {
    this.cache = { ...this.cache, ...patch };
    this.writeLocal(this.cache);
    this.scheduleFlush();
  }

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush().catch(() => {}), 500);
  }

  private async flush(): Promise<void> {
    this.saving = this.saving.then(async () => {
      try {
        await savePluginConfig(this.pluginKey, this.cache, this.getToken());
      } catch (err) {
        console.warn('[PluginConfig] remote save failed, will retry on next change', err);
      }
    });
    await this.saving;
  }

  private readLocal(): T | null {
    try { return JSON.parse(localStorage.getItem(LS_PREFIX + this.pluginKey) ?? 'null'); }
    catch { return null; }
  }
  private writeLocal(v: T): void {
    localStorage.setItem(LS_PREFIX + this.pluginKey, JSON.stringify(v));
  }
}
```

Usage inside a plugin:

```ts
const store = new PluginConfigStore('ai-assistant',
  { apiEndpoint: '', enableAutoComplete: true, maxTokens: 4096 },
  () => authService.currentToken(),
);

await store.initialize();      // hydrate on mount
store.get().apiEndpoint;        // synchronous read

store.set({ enableAutoComplete: false });  // debounced write-through
```

### Batch pre-load on app start

```ts
async function bootstrapAllPluginConfigs(token: string) {
  const records = await getAllPluginConfigs(token);
  for (const r of records) {
    localStorage.setItem(LS_PREFIX + r.pluginKey, JSON.stringify(r.config));
  }
  return records;
}
```

---

## Electron IPC Bridge

Desktop builds wrap the HTTP API behind two IPC channels so the renderer never
sees a raw token. Each channel has the same request/response shape as its HTTP
counterpart.

| IPC channel              | Maps to                                              |
|--------------------------|------------------------------------------------------|
| `pluginConfig:getAll`    | `GET  /knowledge-wiki/plugin-config`                 |
| `pluginConfig:getOrSave` | `GET /:pluginKey` when no body, `POST /:pluginKey` when body is provided |

```ts
// Renderer
const list = await window.electron.invoke('pluginConfig:getAll');

const cfg = await window.electron.invoke('pluginConfig:getOrSave', {
  pluginKey: 'ai-assistant',
});

const saved = await window.electron.invoke('pluginConfig:getOrSave', {
  pluginKey: 'ai-assistant',
  config: { enableAutoComplete: false },
});
```

The main process is responsible for attaching `Authorization` / `Blade-Auth`
headers and normalising the response to the same `ApiResponse<T>` envelope.

---

## Error Handling

| HTTP | `code` | When it happens                                        | Recommended UI behaviour                            |
|------|--------|--------------------------------------------------------|-----------------------------------------------------|
| 200  | 200    | Success                                                | Use `data`                                          |
| 200  | 404    | `GET /:pluginKey` on a key the user never saved        | Use defaults; keep local-only until next save       |
| 400  | 400    | Malformed `pluginKey`, missing `config`, bad JSON      | Surface the `msg`, do not retry                     |
| 401  | 401    | Missing/expired token                                  | Trigger re-auth flow, then retry                    |
| 500  | 500    | Backend error (DB down, unhandled exception)           | Keep local cache, show transient toast, retry later |

A minimal interceptor:

```ts
async function apiCall<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body: ApiResponse<T> = await res.json();

  if (body.code === 401) {
    await authService.refresh();
    throw new RetryableError('token refreshed');
  }
  if (body.code >= 500) throw new RetryableError(body.msg);
  if (!body.success && body.code !== 404) throw new Error(body.msg);
  return body.data as T;
}
```

---

## Best Practices

### 1. Use `pluginKey` as a stable identity

Pick a kebab-case slug at plugin creation and never change it — it's the
primary key half of the unique index. If you must rename, migrate with a
one-shot `GET` + `POST` under the new key, then manually delete the old row.

### 2. Debounce writes

The backend is happy to absorb a few writes per second, but every call is a
JWT verification + SQL round-trip. Batch changes with a ~300–500 ms debounce
as shown in `PluginConfigStore.scheduleFlush`.

### 3. Keep `config` small

The column is MySQL `JSON` and is not intended for bulk data. Target
< 64 KB per record. For larger artefacts (images, attachments) store them in
the File Center and keep only a reference in `config`.

### 4. Do not trust the payload for validation

The server stores the JSON verbatim. If a malformed `config` would crash your
plugin, validate on **both** sides:

- **Frontend**: validate before `savePluginConfig`.
- **Startup**: run a defensive migration in `initialize()` that fills missing
  fields with defaults, so a stale record from an older plugin version never
  takes the UI down.

### 5. Handle secrets carefully

`config` can legitimately contain API keys. The field is transferred over the
gateway's TLS and is user-scoped (a user can only read their own record), but:

- **Never log the raw `config` object.**
- Mask secrets in any settings UI (show `sk-••••••••1234`).
- Consider an opt-in "clear API key on logout" in the plugin settings.

### 6. First-device vs. new-device flow

`initialize()` above implements a simple merge: remote wins when present, and
a populated local cache is pushed up on the first login of a new device. For
multi-device conflict resolution beyond last-write-wins, include your own
`version` or `updatedAt` field *inside* `config` and resolve on the client.

### 7. Treat 404 as an empty state, not an error

A fresh install on a new user is the common path for `code === 404`. Log it
at `debug`, not `warn`, so your observability stays useful.

---

## Changelog

| Version | Date       | Change                                                                    |
|---------|------------|---------------------------------------------------------------------------|
| 1.0.0   | 2025-06-15 | Initial three-endpoint contract, Hybrid Storage pattern, Electron bridge. |
| 1.1.0   | 2026-05-09 | `GET /:pluginKey` returns `code: 404` instead of auto-creating an empty record; `pluginKey` charset/length now validated server-side; concurrent `POST` is race-safe via unique-index retry. |
