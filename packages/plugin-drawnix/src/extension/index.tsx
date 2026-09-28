import type { ExtensionWrapper } from "@kn/common";
import { Paintbrush2 } from "@kn/icon";
import React from "react";
import { Drawnix } from "./drawnix";

export const DrawnixExtension: ExtensionWrapper = {
  name: "drawnix",
  extendsion: [Drawnix],
  slashConfig: [
    {
      icon: <Paintbrush2 className="h-4 w-4" />,
      text: "思维导图",
      slash: "/drawnix",
      action: (editor) => {
        editor.chain().focus().insertDrawnix().run();
      },
    },
  ],
};
