import { DefaultPluginInstance } from "@kn/plugin-main";
import { speechToText } from "@kn/plugin-speech-to-text";
import { logicFlow } from "@kn/plugin-logicflow";

/**
 * Host-owned plugins required for core document compatibility.
 * Optional services and marketplace plugins are loaded later by PluginManager.
 */
export const systemPlugins = [DefaultPluginInstance, speechToText, logicFlow];
