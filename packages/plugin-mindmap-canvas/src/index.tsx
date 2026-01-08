import { KPlugin, PluginConfig } from "@kn/common";
import { MindmapCanvasExtension } from "./mindmap-extension";

interface MindmapPluginConfig extends PluginConfig {}

class MindmapPlugin extends KPlugin<MindmapPluginConfig> {}

export const mindmapCanvas = new MindmapPlugin({
  status: "",
  name: "MindmapCanvas",
  editorExtension: [MindmapCanvasExtension],
});
