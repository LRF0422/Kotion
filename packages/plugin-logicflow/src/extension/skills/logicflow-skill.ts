export const logicFlowSkill = {
  name: "logicflow-skill",
  description:
    "LogicFlow 流程图技能：根据步骤和关系创建自动布局的流程图，并读取或批量编辑已有流程图。",
  requiredTools: [
    "createLogicFlowFromGraph",
    "listLogicFlowDiagrams",
    "getLogicFlowDiagram",
    "applyLogicFlowEdits",
  ],
  optionalTools: ["searchLogicFlowShapes"],
  systemPromptFragment: `Use LogicFlow tools when the user asks for a flowchart or an editable process diagram.
- For a new diagram, prefer createLogicFlowFromGraph and provide semantic nodes and edges; do not invent pixel coordinates.
- Use rect for ordinary steps, ellipse for start/end, and diamond for decisions. Keep labels concise and label decision branches when useful.
- Before modifying an existing diagram, call listLogicFlowDiagrams, then getLogicFlowDiagram. Target diagrams, pages, nodes, and edges only by returned IDs; never guess IDs.
- Combine related changes into one atomic applyLogicFlowEdits call.
- Search shapes only when the basic flowchart shapes are insufficient.`,
  tags: ["logicflow", "flowchart", "workflow", "流程图", "plugin"],
};
