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
    agents: [{
      id: 'logicflow-ops',
      name: '流程图操作员',
      description: '在当前页面创建、查看与编辑 LogicFlow 流程图：按图结构或既有图形创建、检索图形库、增删改节点与连线。'
        + '当用户要求画流程图、改流程图或查询文档里的流程图时派给它。',
      scope: 'page',
      systemPrompt: '你是当前页面的流程图操作员，只负责这一页的 LogicFlow 图（createLogicFlowFromGraph / applyLogicFlowEdits / listLogicFlowDiagrams / getLogicFlowDiagram / searchLogicFlowShapes）。'
        + '改图前先用 listLogicFlowDiagrams + getLogicFlowDiagram 看清现有结构，再用 searchLogicFlowShapes 确认图形名；不要凭记忆写图形标识。'
        + '不要改动本页其他内容。完成后一句话汇报：新建或修改了哪个流程图、增删了哪些节点与连线。',
      tools: liftLegacyTools(logicFlowTools, { scope: 'page' }),
      skills: liftLegacySkills([logicFlowSkill]),
    }],
  },
  locales: logicFlowLocales,
});

export default logicFlow;
