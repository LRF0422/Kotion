import { KPlugin, type PluginConfig } from "@kn/common";
import { LogicFlowExtension } from "./extension";
import { logicFlowLocales } from "./i18n";

interface LogicFlowPluginConfig extends PluginConfig {}
class LogicFlowPlugin extends KPlugin<LogicFlowPluginConfig> {}

export const logicFlow = new LogicFlowPlugin({
  status: "ACTIVE",
  name: "LogicFlow",
  editorExtension: [LogicFlowExtension],
  locales: logicFlowLocales,
});

export default logicFlow;
