import type { TourConfig } from "@kn/common";

/**
 * Core built-in tours. The welcome tour auto-starts for first-run users and
 * highlights the always-present sidebar anchors (see `data-tour` in SiderMenu).
 */
export const WELCOME_TOUR: TourConfig = {
    id: "welcome",
    name: "新手引导",
    trigger: "auto",
    priority: 100,
    version: 1,
    steps: [
        {
            id: "sidebar",
            target: '[data-tour="sidebar-nav"]',
            title: "欢迎来到 Knowledge 👋",
            description: "这里是导航栏,所有功能都从这进入。花 30 秒认识一下吧。",
            placement: "right",
        },
        {
            id: "ai",
            target: '[data-tour="/ai-assistant"]',
            title: "AI 助手",
            description: "随时唤起 AI 帮你写作、整理和问答。也可以在文档里输入 /ai 调用。",
            placement: "right",
            allowInteraction: true,
        },
        {
            id: "shop",
            target: '[data-tour="/plugin-hub"]',
            title: "插件市场",
            description: "在这里安装思维导图、表格、流程图等插件,按需扩展能力。",
            placement: "right",
        },
        {
            id: "setting",
            target: '[data-tour="/setting"]',
            title: "设置都在这",
            description: "个性化配置、成员管理、AI 技能都在设置里。准备好了,开始你的知识之旅吧!",
            placement: "right",
        },
    ],
};

export const BUILTIN_TOURS: TourConfig[] = [WELCOME_TOUR];
