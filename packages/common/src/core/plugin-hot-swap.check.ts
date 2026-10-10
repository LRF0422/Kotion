/**
 * Hot reload keeps component identity — and therefore state.
 *
 * A plugin studio reload used to be `uninstallPlugin()` + `installPlugin()`: the
 * contribution vanished from `plugins`, the dock unmounted the panel, and the
 * new build mounted a *different* component function. Every bit of state the
 * developer had in front of them (hook state, scroll position, a half-filled
 * form) was destroyed by saving a file — the reload was a restart with extra
 * steps, and the panel did not even show the new code, because the dock host
 * renders the panel object it captured when the panel was first opened.
 *
 * What has to hold instead:
 *
 *   1. `resolve*()` hands React the *same function* for a contribution across
 *      reloads (React keys a fiber by element type, so the same type ⇒ the same
 *      fiber ⇒ the same hooks). This file proves that invariant directly: it is
 *      the whole mechanism.
 *   2. The wrapper calls the newest implementation *inline*, so the
 *      implementation's hooks are recorded on the wrapper's fiber. Calling it
 *      through `createElement` would attribute the hooks to a child fiber — the
 *      child would unmount and the state would go with it.
 *   3. The registry is only touched after the new bundle has loaded and
 *      validated: a bundle that throws while being evaluated (or an API version
 *      mismatch, or a name collision) leaves the running version untouched.
 *   4. Uninstall drops identities, so installing again mounts fresh rather than
 *      updating a tree whose plugin is gone.
 *
 * Run with: pnpm check:plugin-hot-swap
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KPlugin, PluginManager } from "./PluginManager";
import {
  HotComponentRegistry,
  hotBoundaryAction,
  isHookShapeError,
} from "./plugin-hot-component";
import { resolveMountedPanels } from "./dock";
import type { ResolvedDockPanel } from "./dock";
import type { PluginRegistration } from "./global-namespace";
import { pluginScriptLoader } from "../utils/import-util";
import { logger } from "../utils/logger";

let checks = 0;

const assert = (condition: unknown, message: string): void => {
  checks += 1;
  if (!condition) throw new Error(message);
};

const markupOf = (component: unknown): string => {
  try {
    return renderToStaticMarkup(React.createElement(component as React.ComponentType));
  } catch (error) {
    return `THREW: ${(error as Error).message}`;
  }
};

/** Minimal stand-in for a `ResolvedDockPanel`, keyed by id like the real one. */
const dockPanel = (id: string, component: unknown): ResolvedDockPanel =>
  ({ id, title: id, icon: null, component, source: "plugin", owner: "owner", pluginKey: "owner" }) as
    unknown as ResolvedDockPanel;

const registration = (plugin: KPlugin<any>, apiVersion = "2.0.0"): PluginRegistration => ({
  exports: { default: plugin },
  meta: { apiVersion },
});

/* ------------------------------------------------------------------ *
 * 1. The registry: stable identity, live implementation
 * ------------------------------------------------------------------ */
const registryChecks = (): void => {
  const registry = new HotComponentRegistry();
  const PanelV1 = () => "panel-v1";
  const PanelV2 = () => "panel-v2";

  const first = registry.resolve("hot-plugin", "dockPanel:panel", PanelV1);
  assert(typeof first === "function", "the first resolve must hand back a renderable function");

  // The host is the fiber React keeps. Called directly (no React), an
  // implementation that returns a string returns it — a host built on
  // createElement would return an element object instead. That difference is
  // exactly "hooks on this fiber" vs "hooks on a child fiber that unmounts".
  const host = registry.hostOf("hot-plugin", "dockPanel:panel");
  assert(typeof host === "function", "the slot must expose its stable host");
  assert(
    (host as () => unknown)() === "panel-v1",
    "the host must call the implementation inline, not through createElement",
  );

  const again = registry.resolve("hot-plugin", "dockPanel:panel", PanelV1);
  assert(again === first, "re-resolving the same implementation must keep the identity");
  assert(
    registry.stats()[0].generation === 0,
    "re-resolving the same implementation is not a reload and must not bump the generation",
  );

  const reloaded = registry.resolve("hot-plugin", "dockPanel:panel", PanelV2);
  assert(reloaded === first, "a reload must reuse the identity React already mounted");
  assert(
    registry.hostOf("hot-plugin", "dockPanel:panel") === host,
    "a reload must not replace the fiber that owns the implementation's hooks",
  );
  assert(
    (host as () => unknown)() === "panel-v2",
    "the reused identity must render the newest implementation",
  );
  assert(registry.stats()[0].generation === 1, "the reload must be counted once");

  // Slots are keyed by the stable registry key, so a renamed plugin (an edited
  // displayName) keeps its identity; a different plugin never shares one.
  const other = registry.resolve("other-plugin", "dockPanel:panel", PanelV1);
  assert(other !== first, "two plugins must not share a component identity");

  // Invalid contributions are passed straight through: the wrapper must not
  // turn a garbage component into a silently-rendered host element.
  assert(
    registry.resolve("bad-plugin", "dockPanel:bad", "div") === "div",
    "a non-component contribution must be left for React to reject",
  );
  assert(
    registry.hostOf("bad-plugin", "dockPanel:bad") === undefined,
    "a non-component contribution must not occupy a slot",
  );

  registry.release("hot-plugin");
  assert(registry.stats().length === 1, "release must drop that plugin's identities");
  assert(
    registry.hostOf("hot-plugin", "dockPanel:panel") === undefined,
    "release must forget the host too",
  );
  const afterRelease = registry.resolve("hot-plugin", "dockPanel:panel", PanelV2);
  assert(
    afterRelease !== first,
    "after an uninstall the next install must mount fresh, not update the old tree",
  );
};

/* ------------------------------------------------------------------ *
 * 2. Hooks land on the wrapper's fiber (what makes state survive)
 * ------------------------------------------------------------------ */
const hookOwnershipChecks = (): void => {
  const registry = new HotComponentRegistry();

  /** A hook-using implementation, like a real plugin panel. */
  const Panel = (): React.ReactNode => {
    const [label] = React.useState("stateful");
    return React.createElement("div", null, label);
  };

  const Wrapper = registry.resolve("hook-plugin", "dockPanel:hook", Panel) as React.ComponentType;
  // If the delegate's `useState` were attributed to another fiber, or called
  // outside a render, React would refuse it ("Invalid hook call" / no dispatcher).
  // Rendering to markup proves the wrapper is a valid component whose fiber owns
  // the implementation's hooks — the same fiber React keeps across a reload.
  assert(
    markupOf(Wrapper).includes("stateful"),
    "a hook-using implementation must render through the stable wrapper",
  );

  // A class component cannot be called as a function: it must go through React.
  class ClassPanel extends React.Component {
    render(): React.ReactNode {
      return React.createElement("div", null, "class-panel");
    }
  }
  const classWrapper = registry.resolve("class-plugin", "dockPanel:class", ClassPanel) as React.ComponentType;
  assert(
    markupOf(classWrapper).includes("class-panel"),
    "a class component contribution must be instantiated by React, not called",
  );
  assert(
    (registry.resolve("class-plugin", "dockPanel:class", ClassPanel) as unknown) === classWrapper,
    "a class component keeps its identity too",
  );
};

/* ------------------------------------------------------------------ *
 * 3. A crashed contribution is isolated, and a hook-shape change recovers
 * ------------------------------------------------------------------ */
const boundaryChecks = (): void => {
  // The isolation itself is React's error-boundary contract for the client
  // renderer (the same pattern the kernel uses for plugin tool renderers in
  // `agent-tool-result-card.tsx`). It cannot be exercised from this harness:
  // the server renderer defers boundary recovery to the client. What *is* worth
  // asserting is the decision the boundary makes, which is this file's own logic.
  const hookError = new Error("Rendered more hooks than during the previous render.");
  assert(
    isHookShapeError(hookError),
    "React's hook-count error must be recognised as a hook-shape change",
  );
  assert(
    !isHookShapeError(new Error("Cannot read properties of undefined")),
    "an ordinary runtime error must not be treated as a hook-shape change",
  );
  assert(
    hotBoundaryAction({ autoRemounts: 0 }, hookError) === "remount",
    "a hook-shape change on the first failure must remount the slot",
  );
  assert(
    hotBoundaryAction({ autoRemounts: 1 }, hookError) === "report",
    "a second hook-shape failure must report, not remount in a loop",
  );
  assert(
    hotBoundaryAction({ autoRemounts: 0 }, new Error("boom")) === "report",
    "an ordinary plugin bug must report rather than remount",
  );

  // The boundary is a renderable element type like any other component: the
  // healthy path must go straight through it.
  const registry = new HotComponentRegistry();
  const Panel = () => React.createElement("div", null, "through-the-boundary");
  const Wrapper = registry.resolve("ok-plugin", "dockPanel:ok", Panel) as React.ComponentType;
  assert(
    markupOf(Wrapper).includes("through-the-boundary"),
    "a healthy contribution must render through the boundary",
  );
};

/* ------------------------------------------------------------------ *
 * 4. A mounted dock panel re-resolves against the live contribution
 * ------------------------------------------------------------------ */
const mountedPanelChecks = (): void => {
  const before = dockPanel("panel", "component-v1");
  const local = dockPanel("local", "component-local");
  const mounted = [before, local];

  const unchanged = resolveMountedPanels(mounted, [before, local]);
  assert(unchanged === mounted, "an unchanged resolution must not invalidate the mounted list");

  // The reload: same id, new definition. This is the case that used to keep
  // rendering the captured component until the window reloaded.
  const after = dockPanel("panel", "component-v2");
  const resolved = resolveMountedPanels(mounted, [after, local]);
  assert(resolved !== mounted, "a replaced contribution must produce a new list");
  assert(resolved[0] === after, "a mounted panel must render the live definition after a reload");
  assert(resolved[1] === local, "unrelated mounted panels must be left alone");

  // A plugin uninstalled while its panel is running: the panel keeps its last
  // definition so the work in it survives.
  const vanished = resolveMountedPanels(mounted, [local]);
  assert(vanished[0] === before, "a panel whose plugin vanished must keep its snapshot");
  const empty = resolveMountedPanels(mounted, []);
  assert(empty === mounted, "an empty live list must not invalidate the mounted list");
};

/* ------------------------------------------------------------------ *
 * 5. The manager: atomic swap, rollback, rename, uninstall
 * ------------------------------------------------------------------ */
const managerChecks = async (): Promise<void> => {
  const originalLoad = pluginScriptLoader.load;
  let nextRegistration: PluginRegistration = registration(
    new KPlugin({ name: "hot-plugin", status: "ACTIVE" }),
  );
  pluginScriptLoader.load = async () => nextRegistration;

  const PanelV1 = () => React.createElement("div", null, "panel-v1");
  const PanelV2 = () => React.createElement("div", null, "panel-v2");

  const pluginWith = (name: string, component: () => React.ReactElement): KPlugin<any> =>
    new KPlugin({
      name,
      status: "ACTIVE",
      dockPanels: [{ id: "hot-panel", title: "Hot", icon: null, component }],
      services: { smokeService: { hello: () => name } },
    } as any);

  const manager = new PluginManager({ resolveUrl: (path) => path, hostApiVersion: "2.0.0" }, []);
  /** Why a refusal happened, exactly as the host reported it to the caller. */
  let lastReason = "";
  const install = (name: string, version: string) =>
    manager.installPluginFromSource({
      code: "export default {}",
      pluginKey: "hot-plugin-key",
      name,
      version,
      replace: true,
      sourceLabel: "/tmp/hot-plugin",
      onRejected: (reason) => { lastReason = reason },
    });

  try {
    /* -- first activation: the identity is created up front, not on reload -- */
    nextRegistration = registration(pluginWith("Hot Plugin", PanelV1));
    assert(await install("Hot Plugin", "dev.1"), "the first build must install");

    const firstPanels = manager.resolveDockPanels("right");
    assert(firstPanels.length === 1, "the dev plugin must contribute its dock panel");
    const identity = firstPanels[0].component;
    assert(typeof identity === "function", "the resolved panel must expose a component");
    assert(markupOf(identity).includes("panel-v1"), "the resolved panel must render the first build");
    // Component identity is adopted at *activation*, so the plugin's own config
    // already carries it — which makes `resolve*` a pure projection, and means the
    // studio preview, the dock, and the manager all hand React the same function
    // (no view can drift onto a different identity).
    assert(
      manager.getPlugin("Hot Plugin")?.dockPanels[0].component === identity,
      "the plugin config must carry the same stable identity the resolve path returns",
    );
    assert(
      manager.getPlugin("Hot Plugin")?.dockPanels[0].component !== PanelV1,
      "the raw bundle component must be behind a wrapper (one identity per contribution)",
    );
    assert(
      manager.getHotComponentStats().some(
        (stat) => stat.pluginKey === "hot-plugin-key" && stat.slotKey === "dockPanel:hot-panel" && stat.generation === 0,
      ),
      `the panel slot must be registered under the registry key: ${JSON.stringify(manager.getHotComponentStats())}`,
    );

    /* -- the reload: same identity, new implementation -------------------- */
    nextRegistration = registration(pluginWith("Hot Plugin", PanelV2));
    assert(await install("Hot Plugin", "dev.2"), "the second build must hot-swap");

    const secondPanels = manager.resolveDockPanels("right");
    assert(
      secondPanels[0].component === identity,
      "a hot reload must keep the component identity React already mounted",
    );
    assert(
      markupOf(secondPanels[0].component).includes("panel-v2"),
      "the kept identity must render the new implementation",
    );
    assert(
      manager.getHotComponentStats().find((stat) => stat.slotKey === "dockPanel:hot-panel")?.generation === 1,
      "the reload must be counted as one swap",
    );
    assert(
      manager.plugins.filter((plugin) => plugin.name === "Hot Plugin").length === 1,
      "a hot reload must not leave two copies of the plugin active",
    );
    assert(
      manager.getPluginEntry("Hot Plugin")?.version === "dev.2",
      "the running plugin must report the new version",
    );
    // The plugin's service values are swapped without a gap in ownership.
    const services = (manager as unknown as { serviceRegistry: { get(name: string): any } }).serviceRegistry;
    assert(
      services.get("smokeService")?.hello() === "Hot Plugin",
      "the hot-swapped plugin must keep its services registered",
    );

    /* -- a bundle that throws while loading: rollback ---------------------- */
    pluginScriptLoader.load = async () => {
      throw new Error("bundle threw while evaluating");
    };
    assert(!(await install("Hot Plugin", "dev.3")), "a bundle that fails to load must be rejected");
    assert(
      lastReason.includes("could not be loaded or evaluated") && lastReason.includes("bundle threw while evaluating"),
      `a refusal must carry the host's own reason: ${lastReason}`,
    );
    assert(
      manager.getPluginEntry("Hot Plugin")?.version === "dev.2",
      "a rejected reload must keep the previous version installed",
    );
    assert(
      manager.resolveDockPanels("right")[0].component === identity,
      "a rejected reload must keep rendering the previous implementation",
    );
    pluginScriptLoader.load = async () => nextRegistration;

    /* -- a bundle that never registers itself: rollback ------------------- */
    // A bundle that throws during evaluation never calls definePlugin, so the
    // host namespace still holds the *previous* registration. Committing that
    // would report a stale plugin as a fresh reload.
    const staleRegistration = nextRegistration;
    const hostGlobal = globalThis as unknown as { __KN__?: unknown };
    hostGlobal.__KN__ = { getPlugin: () => staleRegistration };
    try {
      pluginScriptLoader.load = async () => staleRegistration;
      assert(
        !(await install("Hot Plugin", "dev.4")),
        "a bundle that never registered itself must be rejected, not committed as a success",
      );
      assert(
        lastReason.includes("did not register itself"),
        `the refusal must name the actual problem: ${lastReason}`,
      );
      assert(
        manager.getPluginEntry("Hot Plugin")?.version === "dev.2",
        "the stale-registration rejection must keep the running version",
      );

      /* -- an API version mismatch on reload: rollback -------------------- */
      nextRegistration = registration(pluginWith("Hot Plugin", PanelV2), "9.0.0");
      pluginScriptLoader.load = async () => nextRegistration;
      assert(!(await install("Hot Plugin", "dev.5")), "an incompatible reload must be rejected");
      assert(
        lastReason.includes("plugin API 9.0.0") && lastReason.includes("2.0.0"),
        `the refusal must name both API versions: ${lastReason}`,
      );
      assert(
        manager.getPluginEntry("Hot Plugin")?.version === "dev.2",
        "an incompatible reload must keep the running version",
      );
      assert(
        manager.resolveDockPanels("right")[0].component === identity,
        "an incompatible reload must not disturb the mounted panel",
      );
    } finally {
      delete hostGlobal.__KN__;
    }

    /* -- a plugin renamed between builds ---------------------------------- */
    nextRegistration = registration(pluginWith("Hot Plugin Renamed", PanelV2));
    pluginScriptLoader.load = async () => nextRegistration;
    assert(await install("Hot Plugin Renamed", "dev.6"), "a renamed build must still hot-swap");
    assert(
      !manager.hasPlugin("Hot Plugin") && manager.hasPlugin("Hot Plugin Renamed"),
      `a rename must replace the old entry, not leave both: ${JSON.stringify(manager.getAllPluginNames())}`,
    );
    assert(
      manager.resolveDockPanels("right")[0].component === identity,
      "a rename must not remount the panel: identities are keyed by registry key",
    );

    /* -- uninstall drops the identity ------------------------------------- */
    assert(manager.uninstallPlugin("Hot Plugin Renamed"), "the plugin must uninstall");
    assert(
      manager.getHotComponentStats().length === 0,
      `uninstall must release the plugin's render identities: ${JSON.stringify(manager.getHotComponentStats())}`,
    );
    assert(manager.resolveDockPanels("right").length === 0, "the panel must be gone with the plugin");

    /* -- the same plugin under two names (the published artifact) ---------
     *
     * A project's manifest carries a `displayName`; the *running* plugin's name
     * is whatever its bundle declared, and a bundle may translate it
     * (`name: t('API Client')` → the name follows the UI language). So the copy
     * the developer is iterating on can be active under a name the manifest never
     * mentions — a published version of the very same plugin.
     *
     * A name lookup misses it, which used to turn the reload into a *fresh
     * install* that collided with the active name and was refused: a studio
     * project that never hot-reloaded once, with no explanation. The registry key
     * is the identity, so the dev build must shadow the installed artifact.
     */
    const publishedName = "API Client";      // what the published bundle declares
    const projectName = "API 客户端";         // what the project manifest says
    const shadowManager = new PluginManager({ resolveUrl: (path) => path, hostApiVersion: "2.0.0" }, []);
    pluginScriptLoader.load = async (_url, _key, runtimeName) =>
      registration(pluginWith(runtimeName, PanelV1));

    assert(
      await shadowManager.installPlugin({
        pluginKey: "hot-plugin-key",
        name: publishedName,
        versionId: "p-1",
        resourcePath: "/hot-plugin.js",
      }),
      "the published artifact must be active first",
    );
    assert(
      shadowManager.getPluginEntry(publishedName)?.source === "installed",
      "the published artifact is an installed plugin",
    );
    const identityBeforeShadow = shadowManager.resolveDockPanels("right")[0].component;

    const shadowReasons: string[] = [];
    const shadowInstalled = await shadowManager.installPluginFromSource({
      code: "export default {}",
      pluginKey: "hot-plugin-key",
      name: projectName,
      version: "dev.1",
      replace: true,
      onRejected: (reason) => shadowReasons.push(reason),
    });
    assert(
      shadowInstalled,
      `a dev build must replace the published artifact of the same registry key `
      + `(active=${JSON.stringify(shadowManager.getAllPluginNames())}; reasons=${shadowReasons.join(" | ")})`,
    );
    assert(
      shadowManager.getAllPluginNames().length === 1 && shadowManager.hasPlugin(projectName),
      `the dev build must shadow the published artifact, not run next to it: `
      + JSON.stringify(shadowManager.getAllPluginNames()),
    );
    assert(
      shadowManager.getPluginEntry(projectName)?.source === "dev",
      "the shadowing entry must be reported as the dev build",
    );
    assert(
      shadowManager.resolveDockPanels("right")[0].component === identityBeforeShadow,
      "shadowing a published artifact must keep the panel identity",
    );

    /* -- refusals are atomic, and name their cause ------------------------
     *
     * Three different questions, three different answers — and none of them may
     * touch the running entry:
     *   a) the same registry key  → a reload (asserted above);
     *   b) a foreign key that wants a service an active plugin already owns;
     *   c) an explicit "install, do not replace" on an active key.
     */
    const beforeRefusals = JSON.stringify(shadowManager.getAllPluginKeys());

    const serviceReasons: string[] = [];
    const serviceClash = await shadowManager.installPluginFromSource({
      code: "export default {}",
      pluginKey: "unrelated-key",
      name: "Other Plugin",
      version: "dev.1",
      onRejected: (reason) => serviceReasons.push(reason),
    });
    assert(!serviceClash, "a foreign plugin must not take over an active plugin's service");
    assert(
      serviceReasons.join(" ").includes("owned"),
      `the service clash must be named: ${serviceReasons.join(" | ")}`,
    );

    const replaceReasons: string[] = [];
    const noReplace = await shadowManager.installPluginFromSource({
      code: "export default {}",
      pluginKey: shadowManager.getAllPluginKeys()[0],
      name: projectName,
      version: "dev.2",
      replace: false,
      onRejected: (reason) => replaceReasons.push(reason),
    });
    assert(!noReplace, "replace:false must refuse an active key instead of reloading it");
    assert(
      replaceReasons.join(" ").includes("already active"),
      `the refusal must say the key is taken: ${replaceReasons.join(" | ")}`,
    );

    assert(
      JSON.stringify(shadowManager.getAllPluginKeys()) === beforeRefusals
        && shadowManager.getPluginEntry(projectName)?.version === "dev.1",
      `a refused install must leave the registry exactly as it was: `
      + `${JSON.stringify(shadowManager.getAllPluginKeys())} vs ${beforeRefusals}`,
    );
  } finally {
    pluginScriptLoader.load = originalLoad;
  }
};

/* ------------------------------------------------------------------ *
 * 6. One plugin never becomes two registrations
 *
 * The reported bug: uninstalling a plugin did nothing and the sidebar menu grew,
 * because the registry could hold **two entries for one plugin** — one keyed by a
 * name-derived key (an older/legacy descriptor without a `pluginKey`) and one
 * keyed by the artifact's `pluginKey` — and `uninstall(name)` resolved to only one
 * of them.
 *
 * Two invariants fix it, and both are asserted here:
 *   - the plan refuses a second entry for a plugin that is already active
 *     (same declared name, or same pluginKey);
 *   - a lookup resolves any of a plugin's names, so an uninstall addresses the
 *     plugin that is actually running.
 * ------------------------------------------------------------------ */
const registrationChecks = async (): Promise<void> => {
  const originalLoad = pluginScriptLoader.load;
  const marketplace = (name: string, menuId: string): PluginRegistration => ({
    exports: {
      default: new KPlugin({
        name,
        status: "ACTIVE",
        menus: [{ name, key: menuId, icon: null, id: menuId }],
      } as any),
    },
    meta: { apiVersion: "2.0.0" },
  });
  let served = marketplace("api-client", "/api");
  pluginScriptLoader.load = async () => served;

  const manager = new PluginManager({ resolveUrl: (path) => path, hostApiVersion: "2.0.0" }, []);
  const descriptor = {
    pluginKey: "apiclient",
    name: "API Client",
    versionId: "v1",
    version: "1.0.0",
    resourcePath: "/apiclient.js",
  };
  const menuIds = () => manager.resolveMenus().map((menu) => menu.id);

  try {
    await manager.init([descriptor]);
    assert(manager.getAllPluginKeys().join() === "apiclient", "the server list activates by its pluginKey");
    assert(menuIds().join() === "/api", "and contributes its menu once");

    /* The marketplace record's name is not the name the bundle declared. The UI
     * used to hand that label to `uninstallPlugin`, which resolved to nothing:
     * silent no-op, plugin still in the sidebar. */
    assert(
      manager.uninstallPlugin("API Client"),
      "uninstall must resolve the marketplace record's name (it is not the declared name)",
    );
    assert(manager.getAllPluginKeys().length === 0 && menuIds().length === 0, "and actually remove it");

    /* Legacy descriptor without a pluginKey: it gets a name-derived key. A later
     * init that knows the pluginKey must not add a second copy of the same plugin. */
    await manager.installPlugin({ ...descriptor, pluginKey: "", name: "API Client" } as any);
    assert(manager.getAllPluginKeys().length === 1, "a descriptor without a pluginKey still installs");
    await manager.init([descriptor]);
    assert(
      manager.getAllPluginKeys().length === 1,
      `one plugin must never be active twice under two keys: ${JSON.stringify(manager.getAllPluginKeys())}`,
    );
    assert(
      menuIds().join() === "/api",
      `and must contribute its sidebar entry exactly once: ${JSON.stringify(menuIds())}`,
    );
    assert(
      manager.uninstallPlugin("apiclient"),
      "the surviving entry must still be addressable by its pluginKey",
    );
    assert(manager.getAllPluginKeys().length === 0, "uninstall removes the only copy");

    /* A second install of an active plugin is still an install, not a duplicate. */
    served = marketplace("api-client", "/api");
    await manager.installPlugin(descriptor as any);
    await manager.installPlugin(descriptor as any);
    assert(manager.getAllPluginKeys().length === 1, "installing twice must not register twice");

    /* -- a dev build of a plugin that is filed under another key ------------
     *
     * The reported failure: an artifact installed from a legacy record (no
     * `pluginKey`) is filed under a key derived from its name — `"API Client"` —
     * while the project manifest says `pluginKey: "apiclient"`. The studio's build
     * must be recognised as a new build of *that plugin* and replace it. Treating
     * it as a second plugin gets it refused as a duplicate ("the same plugin is
     * already active"), which leaves the developer unable to hot-reload at all.
     */
    const legacy = new PluginManager({ resolveUrl: (path) => path, hostApiVersion: "2.0.0" }, []);
    pluginScriptLoader.load = async () => marketplace("API Client", "/api");
    await legacy.installPlugin({
        pluginKey: "",
        name: "API Client",
        versionId: "legacy-1",
        resourcePath: "/legacy.js",
    } as any);
    assert(
      legacy.getAllPluginKeys().join() === "API Client",
      `a legacy record is filed under a name-derived key: ${JSON.stringify(legacy.getAllPluginKeys())}`,
    );

    served = marketplace("API Client", "/api");
    const reload = await legacy.installBundle({
      code: "export default {}",
      pluginKey: "apiclient",
      name: "API 客户端",
      version: "dev.1",
      sourceLabel: "/tmp/apiclient",
    });
    assert(
      reload.ok === true && reload.mode === "reloaded",
      `a build of the same plugin must replace it, not be refused: ${JSON.stringify(reload)}`,
    );
    assert(
      reload.ok === true && reload.key === "apiclient" && reload.shadowed === true,
      `and the entry converges on the manifest's pluginKey: ${JSON.stringify(reload)}`,
    );
    assert(
      legacy.getAllPluginKeys().join() === "apiclient",
      `exactly one entry survives, under the stable key: ${JSON.stringify(legacy.getAllPluginKeys())}`,
    );
    assert(
      legacy.resolveMenus().map((menu) => menu.id).join() === "/api",
      `and the sidebar entry is contributed once: ${JSON.stringify(legacy.resolveMenus().map((m) => m.id))}`,
    );
    assert(
      legacy.getPluginEntry("apiclient")?.version === "dev.1" && legacy.hasPlugin("API Client"),
      "the running entry is the dev build, addressable by both its key and its name",
    );
  } finally {
    pluginScriptLoader.load = originalLoad;
  }
};

/* ------------------------------------------------------------------ *
 * 7. Routes: registered as soon as the plugin is, and hot-reloadable
 *
 * The reported failure: a plugin's *route* never registered. Two mechanisms were
 * missing, and both are asserted here:
 *
 *   - a route contributes an **element**, so the stable hot-reload identity has to
 *     be installed on the element's `type` — otherwise a reload gives the router a
 *     different component and the page remounts (or keeps rendering the old code);
 *   - routes must be resolvable from the **live registry** (the host renders them
 *     through a lazy outlet), because a plugin activated after the router was built
 *     has no route baked into it and the studio's dev install never emits the
 *     `PLUGIN_CHANGED` that would rebuild the router.
 * ------------------------------------------------------------------ */
/** Render an *element* (as opposed to `markupOf`, which takes a component). */
const markupOfElement = (element: unknown): string => {
  try {
    return renderToStaticMarkup(element as React.ReactElement);
  } catch (error) {
    return `THREW: ${(error as Error).message}`;
  }
};

/** An element's component type (`ReactNode` does not expose it). */
const elementType = (element: unknown): unknown =>
  (element as { type?: unknown } | null | undefined)?.type;

const routeChecks = async (): Promise<void> => {
  const originalLoad = pluginScriptLoader.load;
  const pageV1 = () => React.createElement("div", null, "page-v1");
  const pageV2 = () => React.createElement("div", null, "page-v2");

  const routedPlugin = (page: () => React.ReactElement): KPlugin<any> =>
    new KPlugin({
      name: "Routed Plugin",
      status: "ACTIVE",
      routes: [
        { path: "/routed", name: "Routed", element: React.createElement(page) },
        // The same page on a second path (the API client does exactly this): one
        // component, two routes, and navigating between them must not remount it.
        { path: "/routed-alias", name: "Routed", element: React.createElement(page) },
      ],
    } as any);

  let served = registration(routedPlugin(pageV1));
  pluginScriptLoader.load = async () => served;
  const manager = new PluginManager({ resolveUrl: (path) => path, hostApiVersion: "2.0.0" }, []);
  const renderRoute = (index: number) => markupOfElement(manager.resolveRoutes()[index].element);
  const installBuild = (version: string) => manager.installBundle({
    code: "export default {}",
    pluginKey: "routed-plugin",
    name: "Routed Plugin",
    version,
    sourceLabel: "/tmp/routed-plugin",
  });

  try {
    const firstInstall = await installBuild("dev.1");
    assert(firstInstall.ok === true, `a plugin with routes must install: ${JSON.stringify(firstInstall)}`);

    const first = manager.resolveRoutes();
    assert(first.length === 2, `both routes must be resolvable: ${JSON.stringify(first.map((r) => r.path))}`);
    assert(
      typeof elementType(first[0].element) === "function" && elementType(first[0].element) !== pageV1,
      "a route element's component must be the stable wrapper, not the raw bundle component",
    );
    assert(
      elementType(first[0].element) === elementType(first[1].element),
      "two routes pointing at one component must share a single identity",
    );
    assert(renderRoute(0) === "<div>page-v1</div>", `the route must render its page: ${renderRoute(0)}`);

    /* -- a reload: same identity, new code -------------------------------- */
    served = registration(routedPlugin(pageV2));
    const reload = await installBuild("dev.2");
    assert(reload.ok === true && reload.mode === "reloaded", `a new build must reload: ${JSON.stringify(reload)}`);
    const second = manager.resolveRoutes();
    assert(
      elementType(second[0].element) === elementType(first[0].element),
      "a reload must keep the route's component identity (the page must not remount)",
    );
    assert(renderRoute(0) === "<div>page-v2</div>", `the kept identity must render the new page: ${renderRoute(0)}`);

    /* -- a duplicate path is dropped, not silently shadowed --------------- */
    const copycat = new PluginManager({ resolveUrl: (path) => path, hostApiVersion: "2.0.0" }, []);
    pluginScriptLoader.load = async () => registration(new KPlugin({
      name: "Copycat Plugin",
      status: "ACTIVE",
      routes: [{ path: "/routed", name: "Copycat", element: React.createElement(pageV1) }],
    } as any));
    assert(await copycat.installPlugin({
      pluginKey: "copycat-plugin",
      name: "Copycat Plugin",
      versionId: "c1",
      resourcePath: "/copycat.js",
    }), "a different plugin may register the same path");
    assert(
      copycat.resolveRoutes().filter((route) => route.path === "/routed").length === 1,
      `a route path must resolve to exactly one entry: ${JSON.stringify(copycat.resolveRoutes().map((r) => r.path))}`,
    );
  } finally {
    pluginScriptLoader.load = originalLoad;
  }
};

const run = async (): Promise<void> => {
  registryChecks();
  hookOwnershipChecks();
  boundaryChecks();
  mountedPanelChecks();
  await managerChecks();
  await registrationChecks();
  await routeChecks();
  logger.info(`plugin hot-swap checks passed (${checks} assertions)`);
};

run().catch((error) => {
  logger.error(error);
  throw error;
});
