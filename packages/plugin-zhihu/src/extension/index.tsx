import type { ExtensionWrapper } from "@kn/common";
import {
    zhihuAskTool,
    zhihuGlobalSearchTool,
    zhihuHotListTool,
    zhihuQuotaTool,
    zhihuSearchTool,
} from "./tools/tools";
import { zhihuResearcherSkill } from "./skills/zhihu-researcher";

export const ZhihuExtension: ExtensionWrapper = {
    name: "zhihu",
    extendsion: [],
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
