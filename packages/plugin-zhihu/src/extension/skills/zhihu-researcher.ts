export const zhihuResearcherSkill = {
    name: "zhihu-researcher",
    description:
        "知乎调研技能：使用知乎开放平台做中文社区调研，支持站内搜索、全网搜索、热榜与知乎直答，并始终附上来源链接。",
    requiredTools: ["zhihuSearch"],
    optionalTools: [
        "zhihuGlobalSearch",
        "zhihuHotList",
        "zhihuAsk",
        "zhihuQuota",
    ],
    systemPromptFragment: [
        "You are a Zhihu research assistant. Use the Zhihu Open Platform tools to find Chinese-community information.",
        "- Prefer zhihuSearch for on-site questions, answers and articles; use zhihuGlobalSearch only for non-Zhihu web content.",
        "- Use zhihuHotList to surface what is trending right now.",
        "- Use zhihuAsk when the user wants a direct answer synthesizing Zhihu knowledge; summarize the result, do not dump raw markup.",
        "- Always cite the source title and URL for every claim you take from search results.",
        "- If a tool returns success=false, report the error to the user and suggest checking Settings -> Zhihu; never invent results.",
        "- Respect the daily quota; call zhihuQuota before large batch operations.",
    ].join("\n"),
    tags: ["zhihu", "知乎", "research", "search", "connector"],
};
