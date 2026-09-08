import type { ExtensionWrapper } from "@kn/common";
import { Workflow } from "@kn/icon";
import React from "react";
import { LogicFlowDiagram } from "./logicflow";

export const LogicFlowExtension: ExtensionWrapper = {
  name: "logicflow",
  extendsion: [LogicFlowDiagram],
  slashConfig: [
    {
      icon: <Workflow className="h-4 w-4" />,
      text: "LogicFlow 流程图",
      slash: "/logicflow",
      action: (editor) => editor.chain().focus().insertLogicFlow().run(),
    },
    {
      icon: <Workflow className="h-4 w-4" />,
      text: "流程图",
      slash: "/流程图",
      action: (editor) => editor.chain().focus().insertLogicFlow().run(),
    },
  ],
};
