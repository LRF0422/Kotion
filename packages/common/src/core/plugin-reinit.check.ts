/**
 * Re-init must not drop plugins that only exist in this runtime.
 *
 * A plugin installed from source (the plugin studio's hot-reload path) has
 * source `dev`: it is in neither the host's `_initialPlugins` nor the server's
 * installed list, so a re-init that rebuilt the registry from the server list
 * left it present in `_pluginMap` (so `hasPlugin()` stayed true and the
 * marketplace still showed it as installed) but missing from `plugins` — which
 * is what `resolveMenus()` / `resolveRoutes()` iterate. The menu entry and the
 * route vanished while the plugin stayed "installed": the half-dead state.
 *
 * Run with: pnpm check:plugin-reinit
 */
import { KPlugin, PluginManager } from "./PluginManager";
import type { PluginRegistration } from "./global-namespace";
import { pluginScriptLoader } from "../utils/import-util";
import { logger } from "../utils/logger";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const remotePlugin = (
  pluginKey: string,
  name: string,
  versionId: string,
  version: string,
) => ({
  pluginKey,
  name,
  versionId,
  version,
  resourcePath: `/${pluginKey}.js`,
});

const registration = (
  name: string,
  apiVersion: string,
  config: Record<string, unknown> = {},
): PluginRegistration => ({
  exports: {
    default: new KPlugin({ name, status: "active", ...config } as any),
  },
  meta: { apiVersion },
});

/** Names in the public list and in the private registry, for drift checks. */
const registryNames = (manager: PluginManager): string[] => {
  const fromList = manager.plugins.map((plugin) => plugin.name).sort();
  const fromRegistry = manager.getAllPluginNames().sort();
  assert(
    fromList.join(",") === fromRegistry.join(","),
    `plugins and the registry must agree: list=[${fromList}] registry=[${fromRegistry}]`,
  );
  return fromList;
};

const run = async (): Promise<void> => {
  const originalLoad = pluginScriptLoader.load;
  const loadResults = new Map<string, PluginRegistration | Error>();
  /** Keys whose scripts were actually fetched, to prove a skip happened first. */
  const loadedKeys: string[] = [];
  pluginScriptLoader.load = async (url, packageName) => {
    loadedKeys.push(packageName);
    const versionId = /[?&]v=([^&]+)/.exec(url)?.[1];
    const result = versionId
      ? loadResults.get(`${packageName}:${decodeURIComponent(versionId)}`)
      : undefined;
    const resolved = result ?? loadResults.get(packageName);
    if (resolved instanceof Error) throw resolved;
    if (!resolved) throw new Error(`Missing test registration for ${packageName}`);
    return resolved;
  };

  try {
    const hostPlugin = new KPlugin({
      name: "host-plugin",
      status: "active",
      menus: [{ name: "Host", key: "/host", icon: null, id: "/host" }],
    });
    const manager = new PluginManager(
      { resolveUrl: (path) => path, hostApiVersion: "2.0.0" },
      [hostPlugin],
    );

    const published = remotePlugin("published-plugin", "published-plugin", "p-1", "1.0.0");
    loadResults.set(published.pluginKey, registration(published.name, "2.0.0"));

    await manager.init([published]);
    assert(
      manager.hasPlugin(published.name),
      "a remote plugin from the installed list should activate",
    );

    // The studio's hot-reload path: install an in-memory bundle for a plugin the
    // server has never heard of.
    loadResults.set(
      "dev-db-connector",
      registration("db-connector", "2.0.0", {
        menus: [{ name: "DB", key: "/db", icon: null, id: "/db" }],
        routes: [{ path: "/db", name: "db" }],
      }),
    );
    const devInstalled = await manager.installPluginFromSource({
      code: "export default {}",
      pluginKey: "dev-db-connector",
      name: "db-connector",
      version: "dev.1",
      sourceLabel: "/tmp/db-connector",
    });
    assert(devInstalled, "installing a plugin from source should succeed");
    assert(
      manager.getPluginEntry("db-connector")?.source === "dev",
      "a plugin installed from source should be reported with source 'dev'",
    );
    assert(
      manager.resolveMenus().some((menu) => menu.id === "/db"),
      "a dev plugin should contribute its menu entry",
    );
    registryNames(manager);

    // 1. Re-init with an unchanged remote list — this is what a market refresh,
    //    a plugin announcing itself, or any other install triggers.
    await manager.init([published]);
    assert(
      manager.hasPlugin("db-connector"),
      "a dev plugin must survive a re-init that does not list it",
    );
    assert(
      manager.plugins.some((plugin) => plugin.name === "db-connector"),
      "a dev plugin must stay in the active list, not just in the registry",
    );
    assert(
      manager.resolveMenus().some((menu) => menu.id === "/db"),
      "a dev plugin's menu entry must survive a re-init",
    );
    assert(
      manager.resolveRoutes().some((route) => route.path === "/db"),
      "a dev plugin's route must survive a re-init",
    );
    assert(
      manager.getPluginEntry("db-connector")?.source === "dev",
      "a surviving dev plugin must keep its install metadata after a re-init",
    );
    assert(
      manager.isPluginRemovable("db-connector"),
      "a surviving dev plugin must stay removable after a re-init",
    );
    assert(
      manager.getPluginEntry("db-connector")?.version === "dev.1",
      "a surviving dev plugin must keep its version after a re-init",
    );
    registryNames(manager);

    // 2. The empty-remote path (plugin fetch failed / no token) must not drop it.
    await manager.init([]);
    assert(
      manager.hasPlugin("db-connector") &&
        manager.resolveMenus().some((menu) => menu.id === "/db"),
      "a dev plugin must survive an empty re-init",
    );
    assert(
      !manager.hasPlugin(published.name),
      "a remote plugin missing from the installed list should still be dropped",
    );
    registryNames(manager);

    // 3. A published artifact with the same runtime name must not replace the
    //    dev build the developer is working on.
    const publishedShadow = remotePlugin(
      "db-connector",
      "db-connector",
      "published-1",
      "9.9.9",
    );
    loadResults.set(
      "db-connector:published-1",
      registration("db-connector", "2.0.0", {
        menus: [{ name: "DB (published)", key: "/db-published", icon: null, id: "/db-published" }],
      }),
    );
    await manager.init([publishedShadow]);
    assert(
      manager.plugins.filter((plugin) => plugin.name === "db-connector").length === 1,
      "the dev build and the published artifact of the same name must not both activate",
    );
    assert(
      manager.resolveMenus().some((menu) => menu.id === "/db") &&
        !manager.resolveMenus().some((menu) => menu.id === "/db-published"),
      "the hot-reloaded dev build should shadow the published artifact of the same name",
    );
    assert(
      manager.getPluginEntry("db-connector")?.source === "dev",
      "shadowing must not relabel the dev build as a remote install",
    );
    registryNames(manager);

    // 4. An explicit uninstall still removes it for good.
    assert(manager.uninstallPlugin("db-connector"), "a dev plugin should be removable");
    await manager.init([]);
    assert(
      !manager.hasPlugin("db-connector"),
      "an uninstalled dev plugin must not come back on the next re-init",
    );
    registryNames(manager);

    // 5. The interleaving behind the reported symptom: a re-init is already in
    //    flight (its remote script still loading) when the studio hot-installs.
    //    The old code rebuilt `plugins` from the server list afterwards while
    //    leaving the new plugin in the registry — `hasPlugin()` true, no menus.
    const slow = remotePlugin("slow-plugin", "slow-plugin", "s-1", "1.0.0");
    loadResults.set("slow-plugin:s-1", registration("slow-plugin", "2.0.0"));
    let releaseSlow: () => void = () => {};
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const ungatedLoad = pluginScriptLoader.load;
    pluginScriptLoader.load = async (url, packageName, name, options) => {
      if (packageName === "slow-plugin") await slowGate;
      return ungatedLoad(url, packageName, name, options);
    };

    loadResults.set(
      "dev-race",
      registration("race-plugin", "2.0.0", {
        menus: [{ name: "Race", key: "/race", icon: null, id: "/race" }],
      }),
    );
    const inFlight = manager.init([slow]);
    const racedInstall = await manager.installPluginFromSource({
      code: "export default {}",
      pluginKey: "dev-race",
      name: "race-plugin",
      version: "dev.1",
    });
    assert(racedInstall, "a plugin installed while an init is in flight should activate");
    releaseSlow();
    await inFlight;
    assert(
      manager.hasPlugin("race-plugin") &&
        manager.plugins.some((plugin) => plugin.name === "race-plugin"),
      "a plugin installed while an init is in flight must end up in the active list too",
    );
    assert(
      manager.resolveMenus().some((menu) => menu.id === "/race"),
      "a plugin installed while an init is in flight must contribute its menu entry",
    );
    assert(
      manager.getPluginEntry("race-plugin")?.source === "dev",
      "a plugin installed while an init is in flight must keep its install metadata",
    );
    registryNames(manager);

    // 6. A plugin the host already bundles must never be loaded from the server's
    //    installed list a second time.
    //
    //    The reported failure: development boot bundles the source build
    //    (`Bitable`) *and* reads the market's installed list, where the same
    //    plugin is filed under the backend's lowercase slug (`bitable`). The two
    //    keys were compared exactly, so the installed copy was not recognised as
    //    "already provided by the host": it collided with the bundle in the plan,
    //    `init()` reported the loser through `failedPlugins`, and the shell
    //    refused to boot ("failed to load the installed plugins"). The installed
    //    copy must be skipped before its script is fetched — the bundled build is
    //    the one that should run.
    const bundled = new PluginManager(
      { resolveUrl: (path) => path, hostApiVersion: "2.0.0" },
      [
        new KPlugin({
          name: "Bitable",
          status: "active",
          menus: [{ name: "Bitable", key: "/bitable", icon: null, id: "/bitable" }],
        }),
      ],
    );
    loadResults.set("bitable", registration("Bitable", "2.0.0"));
    const marketCopy = remotePlugin("bitable", "Bitable", "m-1", "1.0.0");
    const bundledResult = await bundled.init([marketCopy]);
    assert(
      bundledResult.failedPlugins.length === 0,
      `an installed copy of a host-bundled plugin must not fail the init: `
      + JSON.stringify(bundledResult.failedPlugins),
    );
    assert(
      !loadedKeys.includes("bitable"),
      "the installed copy must be skipped before its script is fetched",
    );
    assert(
      bundled.getAllPluginKeys().join() === "Bitable",
      `exactly the host's own build stays active: ${JSON.stringify(bundled.getAllPluginKeys())}`,
    );
    assert(
      bundled.resolveMenus().filter((menu) => menu.id === "/bitable").length === 1,
      "the bundled plugin contributes its menu exactly once",
    );
    const repeated = await bundled.init([marketCopy]);
    assert(
      repeated.failedPlugins.length === 0 && bundled.getAllPluginKeys().join() === "Bitable",
      "a re-init of the same installed list must stay quiet and idempotent",
    );

    // A publisher may file the plugin under a key that is not derived from its
    // display name; the record name is the fallback that still recognises it.
    const oddlyKeyed = remotePlugin("kn-bitable-market", "Bitable", "m-2", "1.0.0");
    const oddlyKeyedResult = await bundled.init([oddlyKeyed]);
    assert(
      oddlyKeyedResult.failedPlugins.length === 0
        && !bundled.hasPlugin("kn-bitable-market"),
      `a record name matching a host bundle must be skipped too: `
      + JSON.stringify(bundled.getAllPluginKeys()),
    );
    assert(
      !loadedKeys.includes("kn-bitable-market"),
      "the oddly-keyed installed copy must also be skipped before it is fetched",
    );

    // A host that does not bundle it still loads the installed build (the
    // production main boot). The skip is about host-provided plugins, not keys.
    const withoutBundle = new PluginManager(
      { resolveUrl: (path) => path, hostApiVersion: "2.0.0" },
      [new KPlugin({ name: "File Manager", status: "active" })],
    );
    const installedResult = await withoutBundle.init([marketCopy]);
    assert(
      installedResult.failedPlugins.length === 0 && withoutBundle.hasPlugin("Bitable"),
      "a host that does not bundle the plugin must still load its installed build",
    );

    // Only the same plugin is skipped: a different key that merely shares a word
    // is a genuine second plugin.
    loadResults.set("bitable-extras", registration("Bitable Extras", "2.0.0"));
    const sibling = remotePlugin("bitable-extras", "Bitable Extras", "x-1", "1.0.0");
    const siblingResult = await bundled.init([sibling]);
    assert(
      siblingResult.failedPlugins.length === 0 && bundled.hasPlugin("Bitable Extras"),
      `a different plugin must still load alongside the bundle: `
      + JSON.stringify(bundled.getAllPluginKeys()),
    );

    // 7. One bad plugin must not take the healthy ones with it.
    //
    //    This is the boot the shell now renders as "degraded" instead of the old
    //    retry-only error screen: the round isolates the failure, activates
    //    everything that did load, and reports the failure **with its reason**
    //    (`failures`) so the toast and log can say why — not just the name.
    const isolatedManager = new PluginManager(
      { resolveUrl: (path) => path, hostApiVersion: "2.0.0" },
      [new KPlugin({ name: "host-plugin", status: "active" })],
    );
    const healthy = remotePlugin("healthy-plugin", "healthy-plugin", "h-1", "1.0.0");
    loadResults.set("healthy-plugin", registration("healthy-plugin", "2.0.0"));
    const broken = remotePlugin("broken-plugin", "broken-plugin", "b-1", "1.0.0");
    loadResults.set(
      "broken-plugin",
      new Error("Failed to fetch https://cdn.example/broken-plugin.js: 500"),
    );
    const isolated = await isolatedManager.init([healthy, broken]);
    assert(
      isolated.failedPlugins.length === 1 && isolated.failedPlugins[0] === "broken-plugin",
      `exactly the broken plugin should be reported: ${JSON.stringify(isolated.failedPlugins)}`,
    );
    assert(
      isolatedManager.hasPlugin("healthy-plugin"),
      "a healthy plugin must still activate when a sibling fails to load",
    );
    assert(
      !isolatedManager.hasPlugin("broken-plugin"),
      "the broken plugin must not be active",
    );
    assert(
      isolated.failures.length === 1 && isolated.failures[0]?.key === "broken-plugin",
      "every failed plugin should be reported once with a reason",
    );
    assert(
      isolated.failures[0]?.stage === "load",
      `a script that rejected should be reported at the 'load' stage: `
      + JSON.stringify(isolated.failures[0]),
    );
    assert(
      (isolated.failures[0]?.reason ?? "").includes("500"),
      `the failure reason must carry the loader's error: `
      + JSON.stringify(isolated.failures[0]),
    );
    registryNames(isolatedManager);

    // 8. A duplicate identity is a plan conflict, and reports the plan's reason.
    const conflictManager = new PluginManager(
      { resolveUrl: (path) => path, hostApiVersion: "2.0.0" },
      [],
    );
    loadResults.set("dup-a", registration("Duplicate Plugin", "2.0.0"));
    loadResults.set("dup-b", registration("Duplicate Plugin", "2.0.0"));
    const conflictResult = await conflictManager.init([
      remotePlugin("dup-a", "Duplicate Plugin", "a-1", "1.0.0"),
      remotePlugin("dup-b", "Duplicate Plugin", "b-2", "1.0.0"),
    ]);
    assert(
      conflictResult.failedPlugins.length === 1,
      `one of two identical plugins should be rejected: ${JSON.stringify(conflictResult.failedPlugins)}`,
    );
    assert(
      conflictResult.failures[0]?.stage === "conflict"
        && /same plugin/.test(conflictResult.failures[0]?.reason ?? ""),
      `a duplicate identity should be reported as a conflict with the plan's reason: `
      + JSON.stringify(conflictResult.failures),
    );
    assert(
      conflictManager.plugins.length === 1,
      "the first candidate (render order) wins the conflict",
    );

    // 9. A contract getter that throws must be a plugin failure, not an init() throw.
    //
    //    `_extractPlugin` smoke-tests the getters that activation and the service
    //    plan read *outside* any per-plugin try/catch. Before that, a plugin class
    //    with a throwing getter rejected `init()` and the shell fell back to the
    //    retry-only screen — i.e. a bad plugin could still block the app through a
    //    different door than the one the shell fix closed.
    class ThrowingGettersPlugin extends KPlugin<any> {
      get services(): any {
        throw new Error("services exploded");
      }
    }
    const throwingManager = new PluginManager(
      { resolveUrl: (path) => path, hostApiVersion: "2.0.0" },
      [],
    );
    loadResults.set("throwing-plugin", {
      exports: {
        default: new ThrowingGettersPlugin({
          name: "Throwing plugin",
          status: "active",
        } as any),
      },
      meta: { apiVersion: "2.0.0" },
    });
    const throwingResult = await throwingManager.init([
      remotePlugin("throwing-plugin", "Throwing plugin", "t-1", "1.0.0"),
    ]);
    assert(
      throwingResult.failedPlugins.includes("Throwing plugin"),
      "a plugin whose contract getter throws must be reported, not reject init()",
    );
    assert(
      throwingResult.failures[0]?.stage === "invalid",
      `a throwing contract getter should be reported at the 'invalid' stage: `
      + JSON.stringify(throwingResult.failures),
    );
    assert(
      !throwingManager.hasPlugin("Throwing plugin"),
      "the plugin with the throwing getter must not be active",
    );
    assert(
      throwingManager.plugins.length === 0,
      "a throwing getter must not take the plugin registry down with it",
    );
  } finally {
    pluginScriptLoader.load = originalLoad;
  }
};

run()
  .then(() => logger.info("plugin re-init checks passed"))
  .catch((error) => {
    logger.error(error);
    throw error;
  });
