import {
    Circle,
    FileText,
    Languages,
    List,
    ListChecks,
    Maximize2,
    Minimize2,
    PencilLine,
    SmilePlus,
    Sparkles,
    SpellCheck,
    Wand2,
    type LucideIcon,
} from "@kn/icon";

/**
 * AI Tools action catalog — the single source of truth for the bubble-menu
 * "AI Tools" dropdown and the preview panel that runs them.
 *
 * Each action carries a `system` instruction (sent as the system message, with
 * the user's selected text as the user message) and a `mode`:
 *  - `replace`  — the result replaces the selected text (rewrite/translate/…)
 *  - `append`   — the result is inserted after the selection (continue writing)
 */

export type AiActionMode = "replace" | "append";

export interface AiActionDef {
    key: string;
    mode: AiActionMode;
    /** System instruction describing the transformation. */
    system: string;
    label: { zh: string; en: string };
}

export interface AiActionGroup {
    key: string;
    icon: LucideIcon;
    label: { zh: string; en: string };
    items: AiActionDef[];
}

const ONLY_RESULT = "只输出处理后的文本本身，不要添加任何解释、前后缀或引号。";

const action = (
    key: string,
    mode: AiActionMode,
    system: string,
    zh: string,
    en: string
): AiActionDef => ({ key, mode, system, label: { zh, en } });

/** Top-level actions, each shown directly in the dropdown with an icon. */
export const AI_PRIMARY_ACTIONS: Array<AiActionDef & { icon: LucideIcon }> = [
    {
        ...action(
            "continue",
            "append",
            `你是写作助手。请在用户给出的文本之后自然地续写下去，保持相同的语言、风格与语气。只输出新续写的内容，不要重复原文，也不要解释。`,
            "续写",
            "Continue Writing"
        ),
        icon: PencilLine,
    },
    {
        ...action(
            "improve",
            "replace",
            `你是写作助手。请润色并改进用户给出的文本，使其更流畅、专业、易读，保持原意与原语言。${ONLY_RESULT}`,
            "润色改写",
            "Improve Writing"
        ),
        icon: Wand2,
    },
    {
        ...action(
            "proofread",
            "replace",
            `你是校对助手。请修正用户给出文本中的拼写、语法与标点错误，不改变原意、风格与语言。${ONLY_RESULT}`,
            "校对",
            "Fix Grammar"
        ),
        icon: SpellCheck,
    },
    {
        ...action(
            "summarize",
            "replace",
            `你是写作助手。请用简明的语言总结用户给出的文本的要点，保持原语言。${ONLY_RESULT}`,
            "总结",
            "Summarize"
        ),
        icon: FileText,
    },
];

/** Secondary actions grouped under a "More" submenu to keep the menu tidy. */
export const AI_MORE_GROUP: AiActionGroup = {
    key: "more",
    icon: Sparkles,
    label: { zh: "更多", en: "More" },
    items: [
        action("simplify", "replace", `你是写作助手。请用更简洁、清晰的语言重写用户给出的文本，保持原意与原语言。${ONLY_RESULT}`, "简化", "Simplify"),
        action("expand", "replace", `你是写作助手。请在保持原意与原语言的前提下，扩写用户给出的文本，补充细节使其更充实。${ONLY_RESULT}`, "扩写", "Make Longer"),
        action("shorten", "replace", `你是写作助手。请在保留关键信息与原语言的前提下，精简用户给出的文本，使其更短。${ONLY_RESULT}`, "缩写", "Make Shorter"),
        { ...action("bullets", "replace", `请将用户给出的文本改写为清晰的要点列表（使用 Markdown 无序列表），保持原意与原语言。${ONLY_RESULT}`, "转要点列表", "To Bullet List"), },
        action("explain", "replace", `请用通俗易懂的语言解释用户给出的文本的含义，保持原语言。${ONLY_RESULT}`, "解释这段", "Explain"),
        action("todos", "replace", `请从用户给出的文本中提取可执行的待办事项，输出为 Markdown 任务列表（- [ ] 形式），保持原语言。${ONLY_RESULT}`, "提取待办", "Extract Action Items"),
        action("emoji", "replace", `请在不改变原意与原语言的前提下，为用户给出的文本恰当地加入 emoji 表情，使其更生动。${ONLY_RESULT}`, "插入表情", "Add Emoji"),
    ],
};

// icons for the secondary items (kept here so ai-actions stays the single source)
export const AI_MORE_ICONS: Record<string, LucideIcon> = {
    simplify: Circle,
    expand: Maximize2,
    shorten: Minimize2,
    bullets: List,
    explain: Sparkles,
    todos: ListChecks,
    emoji: SmilePlus,
};

const tone = (key: string, desc: string, zh: string, en: string): AiActionDef =>
    action(`tone-${key}`, "replace", `请用${desc}的语气重写用户给出的文本，保持原意与原语言。${ONLY_RESULT}`, zh, en);

/** Tone submenu. */
export const AI_TONE_GROUP: AiActionGroup = {
    key: "tone",
    icon: PencilLine,
    label: { zh: "改变语气", en: "Change Tone" },
    items: [
        tone("friendly", "友好亲切", "友好", "Friendly"),
        tone("formal", "正式、官方", "正式", "Formal"),
        tone("casual", "轻松、口语化", "通俗", "Casual"),
        tone("written", "严谨的书面", "书面", "Written"),
    ],
};

const translate = (key: string, lang: string, zh: string, en: string): AiActionDef =>
    action(`translate-${key}`, "replace", `请将用户给出的文本翻译成${lang}。${ONLY_RESULT}`, zh, en);

/** Translation submenu. */
export const AI_TRANSLATE_GROUP: AiActionGroup = {
    key: "translate",
    icon: Languages,
    label: { zh: "翻译", en: "Translate" },
    items: [
        translate("zh-cn", "简体中文", "简体中文", "Simplified Chinese"),
        translate("zh-tw", "繁体中文", "繁体中文", "Traditional Chinese"),
        translate("en", "英文", "英文", "English"),
        translate("de", "德语", "德语", "German"),
        translate("ja", "日语", "日文", "Japanese"),
    ],
};

/** Sentinel action key for the free-form "custom instruction" entry. */
export const CUSTOM_ACTION_KEY = "custom";

/** System prompt used when the user gives a free-form instruction. */
export const CUSTOM_SYSTEM =
    "你是写作助手。请根据用户的指令处理选中的文本，保持原语言（除非指令另有要求）。只输出处理后的文本本身，不要解释。";

/**
 * Custom DOM event dispatched on the editor view by the AI Tools dropdown and
 * consumed by the preview panel. Carries the action and a selection snapshot so
 * the panel is independent of the live editor selection.
 */
export const AI_TOOLS_EVENT = "ai-tools-run";

export interface AiToolsRunDetail {
    /** Preset action key, or {@link CUSTOM_ACTION_KEY} for free-form mode. */
    actionKey: string;
    from: number;
    to: number;
    text: string;
    rect: { top: number; left: number };
}

/** Flat lookup of every preset action by key. */
export const AI_ACTION_MAP: Record<string, AiActionDef> = (() => {
    const map: Record<string, AiActionDef> = {};
    for (const a of AI_PRIMARY_ACTIONS) map[a.key] = a;
    for (const a of AI_MORE_GROUP.items) map[a.key] = a;
    for (const a of AI_TONE_GROUP.items) map[a.key] = a;
    for (const a of AI_TRANSLATE_GROUP.items) map[a.key] = a;
    return map;
})();
