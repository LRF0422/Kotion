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
  id: string,
  version: string,
) => ({
  pluginKey,
  name,
  id,
  version,
  resourcePath: `/${pluginKey}.js`,
});

const registration = (
  name: string,
  apiVersion: string,
): PluginRegistration => ({
  exports: {
    default: new KPlugin({ name, status: "active" }),
  },
  meta: { apiVersion },
});

const run = async (): Promise<void> => {
  const originalLoad = pluginScriptLoader.load;
  const loadResults = new Map<string, PluginRegistration | Error>();

  pluginScriptLoader.load = async (url, packageName) => {
    const versionId = /[?&]v=([^&]+)/.exec(url)?.[1];
    const result =
      (versionId
        ? loadResults.get(`${packageName}:${decodeURIComponent(versionId)}`)
        : undefined) ?? loadResults.get(packageName);
    if (result instanceof Error) throw result;
    if (!result)
      throw new Error(`Missing test registration for ${packageName}`);
    return result;
  };

  try {
    const manager = new PluginManager(
      {
        resolveUrl: (path) => path,
        hostApiVersion: "2.0.0",
      },
      [],
    );

    const incompatible = remotePlugin(
      "incompatible-plugin",
      "Incompatible plugin",
      "version-1",
      "1.0.0",
    );
    loadResults.set(
      incompatible.pluginKey,
      registration(incompatible.name, "1.5.0"),
    );

    const incompatibleResult = await manager.init([incompatible]);
    assert(
      incompatibleResult.failedPlugins.length === 0,
      "API incompatibility should not be reported as a generic plugin failure",
    );
    assert(
      incompatibleResult.incompatiblePlugins.length === 1,
      "API incompatibility should be returned from initialization",
    );
    assert(
      incompatibleResult.incompatiblePlugins[0]?.pluginKey ===
        incompatible.pluginKey,
      "incompatibility should retain the stable plugin key",
    );
    assert(
      incompatibleResult.incompatiblePlugins[0]?.versionId === incompatible.id,
      "incompatibility should retain the installed version id",
    );
    assert(
      incompatibleResult.incompatiblePlugins[0]?.apiVersion === "1.5.0" &&
        incompatibleResult.incompatiblePlugins[0]?.hostApiVersion === "2.0.0",
      "incompatibility should include plugin and host API versions",
    );
    assert(
      !manager.hasPlugin(incompatible.name),
      "an incompatible plugin should not be activated",
    );
    assert(
      manager.incompatiblePlugins.length === 1,
      "manager should retain incompatibility state after initialization",
    );

    const compatibleSibling = remotePlugin(
      incompatible.pluginKey,
      incompatible.name,
      "version-compatible",
      "2.0.0",
    );
    loadResults.set(
      `${incompatible.pluginKey}:${incompatible.id}`,
      registration(incompatible.name, "1.5.0"),
    );
    loadResults.set(
      `${compatibleSibling.pluginKey}:${compatibleSibling.id}`,
      registration(compatibleSibling.name, "2.0.0"),
    );
    const siblingResult = await manager.init([incompatible, compatibleSibling]);
    assert(
      siblingResult.incompatiblePlugins.length === 0,
      "an active compatible version should prevent an older sibling version from marking the plugin incompatible",
    );
    assert(
      manager.hasPlugin(compatibleSibling.name),
      "the compatible sibling version should remain active",
    );

    const compatible = remotePlugin(
      "compatible-plugin",
      "Compatible plugin",
      "version-2",
      "2.1.0",
    );
    loadResults.set(
      compatible.pluginKey,
      registration(compatible.name, "2.3.0"),
    );

    const mixedResult = await manager.init([compatible, incompatible]);
    assert(
      mixedResult.failedPlugins.length === 0,
      "mixed compatible and incompatible plugins should initialize without generic failures",
    );
    assert(
      manager.hasPlugin(compatible.name),
      "a compatible plugin should activate when an incompatible plugin is also installed",
    );
    assert(
      !manager.hasPlugin(incompatible.name),
      "the incompatible plugin should remain inactive in a mixed initialization",
    );

    const compatibleUpdate = remotePlugin(
      incompatible.pluginKey,
      incompatible.name,
      "version-3",
      "2.0.0",
    );
    loadResults.set(
      compatibleUpdate.pluginKey,
      registration(compatibleUpdate.name, "2.0.0"),
    );
    const updatedResult = await manager.init([compatibleUpdate]);
    assert(
      updatedResult.incompatiblePlugins.length === 0,
      "updating a plugin to a compatible API version should clear its warning",
    );
    assert(
      manager.hasPlugin(compatibleUpdate.name),
      "the compatible update should activate",
    );

    await manager.init([]);
    assert(
      manager.incompatiblePlugins.length === 0,
      "initializing without remote plugins should clear incompatibility state",
    );

    const failedManager = new PluginManager(
      {
        resolveUrl: (path) => path,
        hostApiVersion: "2.0.0",
      },
      [],
    );
    const broken = remotePlugin(
      "broken-plugin",
      "Broken plugin",
      "broken-1",
      "1.0.0",
    );
    const invalid = remotePlugin(
      "invalid-plugin",
      "Invalid plugin",
      "invalid-1",
      "1.0.0",
    );
    loadResults.set(broken.pluginKey, new Error("script failed"));
    loadResults.set(invalid.pluginKey, {
      exports: {},
      meta: { apiVersion: "2.0.0" },
    });
    const failedResult = await failedManager.init([broken, invalid]);
    assert(
      failedResult.failedPlugins.includes(broken.name) &&
        failedResult.failedPlugins.includes(invalid.name),
      "script and contract failures should remain generic fatal plugin failures",
    );
    assert(
      failedResult.incompatiblePlugins.length === 0,
      "non-version failures should not be classified as incompatibilities",
    );

    const installManager = new PluginManager(
      {
        resolveUrl: (path) => path,
        hostApiVersion: "2.0.0",
      },
      [],
    );
    await installManager.init([]);
    let notifications = 0;
    const unsubscribe = installManager.onChange(() => {
      notifications += 1;
    });
    loadResults.set(
      incompatible.pluginKey,
      registration(incompatible.name, "1.5.0"),
    );
    const managerPlugin = {
      ...incompatible,
      id: "plugin-subject-1",
      currentVersionId: incompatible.id,
      currentVersion: incompatible.version,
    };
    const installed = await installManager.installPlugin(managerPlugin);
    assert(
      !installed,
      "direct installation should reject an incompatible plugin",
    );
    assert(
      installManager.incompatiblePlugins.length === 1,
      "direct installation should retain the incompatibility for the marketplace",
    );
    assert(
      installManager.incompatiblePlugins[0]?.versionId === incompatible.id,
      "direct installation should use currentVersionId instead of the plugin subject id",
    );
    assert(
      notifications === 1,
      "direct incompatible installation should notify plugin-state subscribers",
    );
    assert(
      installManager.uninstallPlugin(incompatible.name),
      "an incompatible plugin should be removable from manager state",
    );
    assert(
      installManager.incompatiblePlugins.length === 0,
      "uninstalling an incompatible plugin should clear its marketplace warning",
    );
    assert(
      notifications === 2,
      "uninstalling an incompatible plugin should notify plugin-state subscribers",
    );
    unsubscribe();
  } finally {
    pluginScriptLoader.load = originalLoad;
  }
};

run()
  .then(() => logger.info("plugin API compatibility checks passed"))
  .catch((error) => {
    logger.error(error);
    throw error;
  });
