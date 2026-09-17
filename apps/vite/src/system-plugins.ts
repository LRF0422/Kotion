import { fileManager } from "@kn/file-manager";
import { DefaultPluginInstance } from "@kn/plugin-main";

/**
 * Host-owned plugins required for core document compatibility.
 * Optional services and marketplace plugins are loaded later by PluginManager.
 */
export const systemPlugins = [DefaultPluginInstance, fileManager];
