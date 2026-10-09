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
  pluginScriptLoader.load = async (url, packageName) => {
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
