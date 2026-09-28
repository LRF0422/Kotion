import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common";
import { DrawnixExtension } from "./extension";
import { drawnixLocales } from "./i18n";
import { drawnixTools } from "./extension/tools/drawnix-tools";
import { drawnixSkill } from "./extension/skills/drawnix-skill";

interface DrawnixPluginConfig extends PluginConfig {}
class Drawnix extends KPlugin<DrawnixPluginConfig> {}

export const drawnix = new Drawnix({
  status: "",
  name: "Drawnix",
  editorExtension: [DrawnixExtension],
  agent: {
    agents: [{
      id: 'drawnix-ops',
      name: '思维导图操作员',
      description: '在当前页面创建与编辑 Drawnix 思维导图：从结构 / Markdown / Mermaid 生成，读取现有导图，增删节点与改文字。'
        + '当用户要求画思维导图、把大纲转成导图或修改文档里的导图时派给它。',
      scope: 'page',
      systemPrompt: '你是当前页面的思维导图操作员，只负责这一页的 Drawnix 导图（insertDrawnix* / listAllDrawnix / getDrawnixAtPos / addNodeToDrawnix / deleteNodeFromDrawnix / updateDrawnixNodeText）。'
        + '改图前先用 listAllDrawnix / getDrawnixAtPos 看清现有导图与节点位置；用户给了大纲或 Mermaid 时优先用对应的 FromMarkdown / FromMermaid 工具，不要手工逐节点搭。'
        + '不要改动本页其他内容。完成后一句话汇报：新建或修改了哪个导图、增删了哪些节点。',
      tools: liftLegacyTools(drawnixTools, { scope: 'page' }),
      skills: liftLegacySkills([drawnixSkill]),
    }],
  },
  locales: drawnixLocales,
});
