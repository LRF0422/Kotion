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
