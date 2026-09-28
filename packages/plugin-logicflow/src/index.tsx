import { KPlugin, liftLegacySkills, liftLegacyTools, type PluginConfig } from "@kn/common";
import { LogicFlowExtension } from "./extension";
import { logicFlowLocales } from "./i18n";
import { logicFlowTools } from "./extension/tools/logicflow-tools";
import { logicFlowSkill } from "./extension/skills/logicflow-skill";

interface LogicFlowPluginConfig extends PluginConfig {}
class LogicFlowPlugin extends KPlugin<LogicFlowPluginConfig> {}

export const logicFlow = new LogicFlowPlugin({
  status: "ACTIVE",
  name: "LogicFlow",
  editorExtension: [LogicFlowExtension],
  agent: {
    tools: liftLegacyTools(logicFlowTools, { scope: 'page' }),
    skills: liftLegacySkills([logicFlowSkill]),
  },
  locales: logicFlowLocales,
});

export default logicFlow;
