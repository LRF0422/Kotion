import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Flow } from "./flow";
import { FlowerIcon } from "@kn/icon";


export const FlowExtension: ExtensionWrapper = {
    name: Flow.name,
    extendsion: Flow,
    slashConfig: [
        {
            text: '流程图',
            slash: '/flow',
            icon: <FlowerIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertFlow()
            }
        }
    ]
}