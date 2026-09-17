import React from "react";
import type { ExtensionWrapper } from "@kn/common";
import { Flame } from "@kn/icon";
import {
    zhihuAskTool,
    zhihuGlobalSearchTool,
    zhihuHotListTool,
    zhihuQuotaTool,
    zhihuSearchTool,
} from "./tools/tools";
import { zhihuResearcherSkill } from "./skills/zhihu-researcher";
import { ZhihuHotListNode } from "./nodes/zhihu-hot-list-node";

export const ZhihuExtension: ExtensionWrapper = {
    name: "zhihu",
    extendsion: [ZhihuHotListNode],
    slashConfig: [
        {
            divider: true,
            title: "知乎",
        },
        {
            icon: <Flame className="h-4 w-4" />,
            text: "知乎热榜",
            slash: "/zhihu-hot",
            action: (editor) => {
                editor.commands.insertContent({
                    type: "zhihuHotList",
                    attrs: {},
                });
            },
        },
    ],
    tools: [
        zhihuSearchTool,
        zhihuGlobalSearchTool,
        zhihuHotListTool,
        zhihuAskTool,
        zhihuQuotaTool,
    ],
    skills: [zhihuResearcherSkill],
};

export * from "./tools/tools";
export * from "./skills/zhihu-researcher";
export * from "./nodes/zhihu-hot-list-node";
