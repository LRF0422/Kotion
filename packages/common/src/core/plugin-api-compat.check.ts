import { KPlugin, PluginManager } from "./PluginManager";
import { normalizeRemotePluginDescriptor } from "./plugin-runtime";
import type { PluginRegistration } from "./global-namespace";
import { pluginScriptLoader } from "../utils/import-util";
import { logger } from "../utils/logger";
import { event, PLUGIN_INCOMPATIBLE } from "../event";

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

const canonicalRemotePlugin = (
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
): PluginRegistration => ({
  exports: {
    default: new KPlugin({ name, status: "active" }),
  },
  meta: { apiVersion },
});

const run = async (): Promise<void> => {
  const nameless = normalizeRemotePluginDescriptor({
    pluginKey: "nameless-plugin",
    resourcePath: "/nameless-plugin.js",
    version: "2.0.0",
  });
  assert(
    nameless?.name === "nameless-plugin",
    "legacy descriptors should fall back to pluginKey for their display name",
  );
  const canonicalVersion = normalizeRemotePluginDescriptor({
    pluginKey: "version-precedence",
    name: "Version precedence",
    resourcePath: "/version-precedence.js",
    version: "2.0.0",
    currentVersion: "1.0.0",
  });
  assert(
    canonicalVersion?.version === "2.0.0",
    "canonical version should take precedence over currentVersion",
  );

  const directRenderer = {
    type: "component" as const,
    component: () => null,
  };
  const editorRenderer = {
    type: "editor-component" as const,
    createInitialDocument: () => ({ type: "doc", content: [] }),
  };
  const firstPageTypePlugin = new KPlugin({
    name: "page-types-one",
    status: "active",
    pageTypes: [
      { id: "one:late", label: "Late", order: 20, renderer: directRenderer },
      { id: "shared:page", label: "First duplicate", order: 10, renderer: directRenderer },
      { id: "not-namespaced", label: "Invalid id", renderer: directRenderer },
      { id: "one:blank-label", label: "   ", renderer: directRenderer },
      { id: "one:invalid-renderer", label: "Invalid renderer", renderer: { type: "unknown" } as any },
    ],
  });
  const secondPageTypePlugin = new KPlugin({
    name: "page-types-two",
    status: "active",
    pageTypes: [
      { id: "two:stable", label: "Stable", order: 10, renderer: directRenderer },
      { id: "shared:page", label: "Later duplicate", order: 0, renderer: directRenderer },
      { id: "two:editor", label: "Editor", order: 20, renderer: editorRenderer },
    ],
  });
  const pageTypeManager = new PluginManager(
    { resolveUrl: (path) => path, hostApiVersion: "2.1.0" },
    [firstPageTypePlugin, secondPageTypePlugin],
  );
  await pageTypeManager.init([]);
  const resolvedPageTypes = pageTypeManager.resolvePageTypes();
  assert(
    resolvedPageTypes.map((pageType) => pageType.id).join(",") ===
      "shared:page,two:stable,one:late,two:editor",
    "page types should validate, de-duplicate first-wins, and retain stable order",
  );
  assert(
    resolvedPageTypes[0]?.owner === "page-types-one" &&
      resolvedPageTypes[0]?.source === "plugin",
    "resolved page types should identify their contributing owner and source",
  );
  assert(
    pageTypeManager.resolvePageType("two:editor")?.renderer.type === "editor-component",
    "one page type should resolve by stable id",
  );
  assert(
    pageTypeManager.remove("page-types-one"),
    "page-type owner should be removable",
  );
  const afterPageTypeRemoval = pageTypeManager.resolvePageTypes();
  assert(
    afterPageTypeRemoval[0]?.id === "shared:page" &&
      afterPageTypeRemoval[0]?.owner === "page-types-two",
    "page-type cache invalidation should expose the next duplicate after removal",
  );

  const originalLoad = pluginScriptLoader.load;
  const loadResults = new Map<string, PluginRegistration | Error>();
  let incompatibleEvents = 0;
  const handleIncompatible = () => {
    incompatibleEvents += 1;
  };
  event.on(PLUGIN_INCOMPATIBLE, handleIncompatible);

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
    assert(
      incompatibleEvents === 1,
      "legacy PLUGIN_INCOMPATIBLE listeners should still be notified",
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

    const compatibleUpdate = canonicalRemotePlugin(
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

    const malformedResult = await manager.init([
      { pluginKey: "malformed-plugin", name: "Malformed plugin" },
    ]);
    assert(
      malformedResult.failedPlugins.includes("Malformed plugin"),
      "plugins without a resource path should be rejected before loading",
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
    event.off(PLUGIN_INCOMPATIBLE, handleIncompatible);
    pluginScriptLoader.load = originalLoad;
  }
};

run()
  .then(() => logger.info("plugin API compatibility checks passed"))
  .catch((error) => {
    logger.error(error);
    throw error;
  });
