import { KPlugin, PluginManager } from "./PluginManager";
import {
    CORE_SERVICE_OWNER,
    ServiceRegistrationError,
    ServiceRegistry,
    pluginServiceOwner,
} from "./ServiceRegistry";
import type { AIFoundation, FileService, Services } from "./types";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

const fileService = { getDownloadUrl: (name: string) => name } as FileService;
const aiOne = { marker: "one" } as unknown as AIFoundation;
const aiTwo = { marker: "two" } as unknown as AIFoundation;

const registry = new ServiceRegistry({ fileService });
let collision: ServiceRegistrationError | undefined;
try {
    registry.registerAll(
        { fileService: {} as FileService, aiFoundation: aiOne },
        pluginServiceOwner("plugin-one")
    );
} catch (error) {
    if (error instanceof ServiceRegistrationError) collision = error;
}
assert(collision?.serviceName === "fileService", "plugins should not overwrite core services");
assert(registry.get("fileService") === fileService, "core service identity should be preserved");
assert(registry.get("aiFoundation") === undefined, "bulk registration should be atomic on collision");

registry.register("aiFoundation", aiOne, pluginServiceOwner("plugin-one"));
let pluginCollision = false;
try {
    registry.register("aiFoundation", aiTwo, pluginServiceOwner("plugin-two"));
} catch (error) {
    pluginCollision = error instanceof ServiceRegistrationError;
}
assert(pluginCollision, "plugins should not overwrite another plugin's service");
registry.register("aiFoundation", aiTwo, pluginServiceOwner("plugin-one"));
assert(registry.get("aiFoundation") === aiTwo, "the same owner may replace its atomic service value");
registry.unregisterOwner(pluginServiceOwner("plugin-one"));
assert(!registry.has("aiFoundation"), "unregisterOwner should remove plugin services");
assert(registry.getOwner("fileService")?.type === "core", "plugin cleanup should keep core ownership");

const pluginOne = new KPlugin({
    name: "plugin-one",
    status: "active",
    services: { aiFoundation: aiOne } as Services,
});
const pluginTwo = new KPlugin({
    name: "plugin-two",
    status: "active",
    services: { aiFoundation: aiTwo } as Services,
});
const filePlugin = new KPlugin({
    name: "file-plugin",
    status: "active",
    services: { fileService } as Services,
});
const manager = new PluginManager({
    resolveUrl: path => path,
    hostApiVersion: "1.0.0",
    coreServices: { fileService },
}, [pluginOne, pluginTwo]);

const run = async (): Promise<void> => {
    const initResult = await manager.init([]);
    assert(manager.serviceRegistry.get("fileService") === fileService, "manager rebuild should keep core services");
    assert(!("register" in manager.serviceRegistry), "plugins should receive a read-only service registry view");
    assert(manager.serviceRegistry.get("aiFoundation") === aiOne, "first plugin owner should win collisions");
    assert(manager.serviceRegistry.getOwner("aiFoundation")?.type === "plugin", "manager should track plugin ownership");
    assert(initResult.failedPlugins.includes("plugin-two"), "conflicting initial plugins should be reported as failed");
    assert(!manager.hasPlugin("plugin-two"), "conflicting initial plugins should not remain partially active");

    assert(manager.uninstallPlugin("plugin-one"), "installed plugin should uninstall");
    assert(manager.serviceRegistry.get("fileService") === fileService, "uninstall should keep core services");
    assert(manager.serviceRegistry.get("aiFoundation") === undefined, "uninstall should remove the last plugin owner");

    const stableManager = new PluginManager({
        resolveUrl: path => path,
        hostApiVersion: "1.0.0",
    }, [pluginOne, filePlugin]);
    await stableManager.init([]);
    let survivingServiceDisappeared = false;
    const unsubscribe = stableManager.serviceRegistry.subscribe(name => {
        if (name === "aiFoundation" && !stableManager.serviceRegistry.get("aiFoundation")) {
            survivingServiceDisappeared = true;
        }
    });
    stableManager.uninstallPlugin("file-plugin");
    unsubscribe();
    assert(!survivingServiceDisappeared, "uninstall should not transiently remove surviving services");
    assert(stableManager.serviceRegistry.get("aiFoundation") === aiOne, "surviving services should retain identity");

    registry.clear();
    assert(registry.getOwner("fileService") === undefined, "clear should remove core services when explicitly requested");
    assert(CORE_SERVICE_OWNER.type === "core", "core owner constant should remain stable");
};

run()
    .then(() => console.log("service owner lifecycle checks passed"))
    .catch(error => {
        console.error(error);
        throw error;
    });
