import { Circle, Languages, PencilLine, SmilePlus, type LucideIcon } from "@kn/icon";

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

/** Top-level actions, each shown directly in the dropdown with an icon. */
export const AI_TOOL_ACTIONS: Array<AiActionDef & { icon: LucideIcon }> = [
    {
        key: "continue",
        icon: PencilLine,
        mode: "append",
        system: `你是写作助手。请在用户给出的文本之后自然地续写下去，保持相同的语言、风格与语气。只输出新续写的内容，不要重复原文，也不要解释。`,
        label: { zh: "续写", en: "Continue Writing" },
    },
    {
        key: "simplify",
        icon: Circle,
        mode: "replace",
        system: `你是写作助手。请用更简洁、清晰的语言重写用户给出的文本，保持原意与原语言。${ONLY_RESULT}`,
        label: { zh: "简化", en: "Simplify" },
    },
    {
        key: "emoji",
        icon: SmilePlus,
        mode: "replace",
        system: `请在不改变原意与原语言的前提下，为用户给出的文本恰当地加入 emoji 表情，使其更生动。${ONLY_RESULT}`,
        label: { zh: "插入表情", en: "Add Emoji" },
    },
];

const tone = (key: string, desc: string, zh: string, en: string): AiActionDef => ({
    key: `tone-${key}`,
    mode: "replace",
    system: `请用${desc}的语气重写用户给出的文本，保持原意与原语言。${ONLY_RESULT}`,
    label: { zh, en },
});

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

const translate = (key: string, lang: string, zh: string, en: string): AiActionDef => ({
    key: `translate-${key}`,
    mode: "replace",
    system: `请将用户给出的文本翻译成${lang}。${ONLY_RESULT}`,
    label: { zh, en },
});

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

/**
 * Custom DOM event dispatched on the editor view by the AI Tools dropdown and
 * consumed by the preview panel. Carries the action and a selection snapshot so
 * the panel is independent of the live editor selection.
 */
export const AI_TOOLS_EVENT = "ai-tools-run";

export interface AiToolsRunDetail {
    actionKey: string;
    from: number;
    to: number;
    text: string;
    rect: { top: number; left: number };
}

/** Flat lookup of every action by key. */
export const AI_ACTION_MAP: Record<string, AiActionDef> = (() => {
    const map: Record<string, AiActionDef> = {};
    for (const a of AI_TOOL_ACTIONS) map[a.key] = a;
    for (const a of AI_TONE_GROUP.items) map[a.key] = a;
    for (const a of AI_TRANSLATE_GROUP.items) map[a.key] = a;
    return map;
})();
