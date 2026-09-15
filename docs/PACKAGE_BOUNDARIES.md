# Common / Core Package Boundaries

## Dependency direction

```text
apps -> @kn/core -> @kn/common
plugins ---------> @kn/common
```

`@kn/common` must never import `@kn/core`. Plugins must not depend on `@kn/core`.
The Space/Page domain is the reference pattern: common owns IDs, contracts and service interfaces; core owns endpoint selection, backend normalization and the concrete service.

## `@kn/common` responsibilities

Common is the public abstraction and plugin-runtime layer. New code belongs here only when it is one of the following:

- Domain IDs, DTOs and stable public contracts.
- Service, transport and host-bridge interfaces.
- Plugin contribution contracts (routes, menus, editor extensions, docks, tours).
- Reusable pure logic that does not select a Kotion endpoint, persistence policy or application lifecycle.
- Compatibility APIs that must have one shared runtime identity, such as the existing `KPlugin` constructor.

Public contracts must have one canonical declaration. Internal common modules should import the defining file directly rather than importing the common root barrel.

## `@kn/core` responsibilities

Core is the concrete host implementation. It owns:

- The application shell, routing, startup and core UI.
- Plugin host lifecycle and marketplace/backend DTO adaptation.
- Concrete HTTP/WebSocket/upload/storage behavior and endpoint catalogs.
- Redux application-store construction and application navigation state.
- Built-in product content, including bundled AI skills.
- Concrete service implementations and bridge registration.

Core consumes common contracts. It must not compile files directly from `packages/common/src`.

## Agent SDK runtime seam

The agent SDK in `@kn/common/src/ai/agent` is a contract + orchestration layer;
concrete product policy is injected by the host:

- `AgentTransport` (`src/ai/agent/transport.ts`) is the fetch seam. The SDK
  never hard-codes the gateway path or the auth/session policy.
- `@kn/core/src/ai/agent/runtime.ts` owns the concrete `apiBase` and JWT-aware
  `authorizedFetch`, registered via `registerAgentRuntime()` from
  `ensureCoreRuntimeRegistered()` in `App.tsx`.
- `AgentClient` resolves the transport lazily on first request, so module-level
  client construction stays safe before startup registration.
- `useEditorAgent` and `useCapabilityProviders` accept an injectable
  `sessionBinding` getter; the global `setSessionPageBinding` registry is a
  backward-compatible default only.
- Sub-agent lifecycle (`useSubRuns`) lives in `src/ai/agent/use-sub-runs.ts`,
  separate from the run hook: it owns the `SubRunWorker`, attach/detach, and
  private-document release.
- Frontend tool execution (`usePendingToolExecution`) lives in
  `src/ai/agent/use-pending-tools.ts`: it owns the idempotent tool-result
  journal, batch guard, and bounded resume retries. The shared retry policy is
  in `src/ai/agent/retry-policy.ts`.
- The run SSE transport (`useAgentStream`: live tail, reconnect backoff, resume
  round-trip, `lastSeq` persistence) lives in
  `src/ai/agent/use-agent-stream.ts`. `useEditorAgent` keeps only session and
  public-API orchestration.
- The executor injects the binding into every tool call via
  `ToolExecutionContext.sessionBinding`; editor tools (`@kn/core/src/ai/tools`)
  read it from the context and only fall back to the global registry.
- `AgentRunStore`/`AgentTabLock` (`src/ai/agent/persistence.ts`) are the
  crash-recovery contracts; `configureAgentPersistence()` is registered by the
  host in `@kn/core/src/ai/agent/runtime.ts`. The browser implementation
  (`localStorage` + Web Locks) lives in `@kn/core/src/ai/agent/browser-persistence.ts`,
  and the SDK falls back to a dependency-free in-memory store.
- The run view-state machine (types, reducer, `applyEvent`/`applySubRunEvent`)
  lives in `src/ai/agent/editor-agent-state.ts` — pure, no React or I/O. The hook
  (`use-editor-agent.ts`) only owns transport/session/tool mechanics.
- The chat surface's off-screen editor leases (the conversation target plus every
  per-owner sub-run target: acquisition, LRU eviction, ref-counting, teardown, and
  the private-document merge) live in
  `plugin-ai/src/ai/menu/use-offscreen-targets.ts`; `Chat.tsx` keeps only the
  composer, the page-binding registry, and wiring.
- Sub-agent tree labels are built once by `buildSubAgentTreeLabels(t)` in
  `@kn/ui` (`components/ai/SubAgentTree.tsx`); the core panel and the plugin-ai
  message bubble both call it instead of re-declaring the same 18 keys. Because
  `@kn/ui` may not import `@kn/common`, the builder takes `t` as a parameter.

The boundary checker enforces the seams: `ai/agent/client.ts` may not reference
`authorizedFetch`, `utils/session` or the gateway path, and must import
`./transport`; `core/src/ai/agent/runtime.ts` must call
`configureAgentTransport`; and no file under `packages/common/src/ai/agent` may
reference `localStorage` or `navigator.locks`.

Follow-up (tracked): split the remaining hook into
`useAgentRun`/`useAgentTools`/`useAgentSession`. Fully merging the two AI
panels is still open: the shared contracts/hooks already live in `@kn/common`,
but their rendering differs and consolidating it needs an `@kn/ai-ui`-style
package that can depend on common (`@kn/ui` cannot), which is blocked while the
workspace install is offline.

## Compatibility surfaces

The following surfaces remain temporarily for published-plugin compatibility:

- `@kn/core` still forwards the legacy `@kn/common` surface through `legacy-core-api.ts`.
- `window.__KN__.core` and the legacy `window.core` global retain that same facade.
- `@kn/common` still forwards selected third-party APIs, including React Router, React Redux and ahooks.
- `KPlugin` remains defined in common because `PluginManager` currently validates plugins with `instanceof KPlugin`; a second constructor would break runtime activation.
- `PLUGIN_INCOMPATIBLE` remains emitted even though current UI reads incompatibility state from `PluginManager`.

Do not add new APIs to these compatibility surfaces unless an existing published consumer requires them.

## Existing compatibility debt in common

These are concrete implementations that predate the boundary and should not be used as placement examples:

- `src/core/PluginManager.ts` and `src/core/global-namespace.ts`
- `src/store/`
- Product endpoint catalog in `src/api/`
- Hard-coded upload and instant-message hooks
- Local/API/hybrid plugin-config storage implementations
- Built-in and example AI skills
- SkillsMP client and React hook

## Migration order

Move these areas in small compatibility-preserving slices:

1. Move Redux store construction to core; retain plugin-facing state contracts in common.
2. Move product API catalogs and hard-coded network implementations to core; retain request/transport interfaces in common.
3. Keep `PluginConfigStorageAdapter` in common and move concrete storage policies to core.
4. Move bundled/example skills and SkillsMP integration to core or a dedicated feature package.
5. Move global namespace installation and host lifecycle to core while keeping forwarding aliases.
6. Remove the `@kn/core -> @kn/common` root facade and third-party common proxies only in a major release with a migration guide.
7. Add restrictive package `exports` maps only after published plugin deep imports have been audited.

## Review checklist

Before adding a common export, ask:

1. Is this a stable contract or a reusable implementation without product policy?
2. Does it hard-code an endpoint, storage key, browser lifecycle or application UI?
3. Could a plugin use it without importing host implementation details?
4. Is the symbol already exported from another canonical barrel?
5. Would moving it create a second singleton/class/context identity?

If the answer indicates host policy or concrete behavior, implement it in core and expose only the required interface through common.
