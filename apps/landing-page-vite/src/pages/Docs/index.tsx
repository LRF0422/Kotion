import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "@kn/common";
import { Button } from "@kn/ui";
import {
    BookOpen, Rocket, Puzzle, Brain, Database, Users, Server, Code,
    ChevronRight, ChevronLeft, Search, FileText, Keyboard, Terminal,
    Blocks, Palette, BarChart3, Globe, Shield, Zap, ArrowRight, Menu, X,
    ExternalLink, Copy, Check
} from "@kn/icon";
import { useTranslation } from "@kn/common";

// ============================================================
// Documentation section definitions
// ============================================================
interface DocSection {
    id: string;
    icon: React.ReactNode;
    children?: { id: string; title: string }[];
}

const DOC_SECTIONS: DocSection[] = [
    { id: "introduction", icon: <BookOpen className="w-4 h-4" /> },
    {
        id: "getting-started", icon: <Rocket className="w-4 h-4" />,
        children: [
            { id: "installation", title: "" },
            { id: "quick-start", title: "" },
            { id: "project-structure", title: "" },
            { id: "dev-commands", title: "" },
        ]
    },
    {
        id: "core-concepts", icon: <Blocks className="w-4 h-4" />,
        children: [
            { id: "workspaces", title: "" },
            { id: "pages-blocks", title: "" },
            { id: "slash-commands", title: "" },
            { id: "bi-links", title: "" },
        ]
    },
    {
        id: "editor", icon: <FileText className="w-4 h-4" />,
        children: [
            { id: "rich-text", title: "" },
            { id: "markdown-shortcuts", title: "" },
            { id: "keyboard-shortcuts", title: "" },
            { id: "columns-layout", title: "" },
        ]
    },
    {
        id: "plugins", icon: <Puzzle className="w-4 h-4" />,
        children: [
            { id: "plugin-overview", title: "" },
            { id: "available-plugins", title: "" },
            { id: "create-plugin", title: "" },
            { id: "plugin-tools-skills", title: "" },
        ]
    },
    {
        id: "ai-features", icon: <Brain className="w-4 h-4" />,
        children: [
            { id: "ai-assistant", title: "" },
            { id: "ai-tools", title: "" },
            { id: "ai-skills", title: "" },
            { id: "ai-skillsmp", title: "" },
        ]
    },
    {
        id: "database", icon: <Database className="w-4 h-4" />,
        children: [
            { id: "field-types", title: "" },
            { id: "table-view", title: "" },
            { id: "kanban-view", title: "" },
            { id: "calendar-view", title: "" },
            { id: "chart-view", title: "" },
            { id: "timeline-view", title: "" },
        ]
    },
    {
        id: "collaboration", icon: <Users className="w-4 h-4" />,
        children: [
            { id: "realtime-editing", title: "" },
            { id: "collab-server", title: "" },
        ]
    },
    {
        id: "self-hosting", icon: <Server className="w-4 h-4" />,
        children: [
            { id: "docker-deploy", title: "" },
            { id: "manual-deploy", title: "" },
            { id: "env-variables", title: "" },
            { id: "desktop-app", title: "" },
        ]
    },
    {
        id: "api-reference", icon: <Code className="w-4 h-4" />,
        children: [
            { id: "rest-api", title: "" },
            { id: "websocket-api", title: "" },
            { id: "plugin-api", title: "" },
        ]
    },
];

// ============================================================
// Code block component
// ============================================================
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language = "bash" }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="relative group rounded-lg overflow-hidden my-4">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
                <span className="text-xs text-gray-400 font-mono">{language}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre className="p-4 bg-gray-900 dark:bg-gray-950 overflow-x-auto">
                <code className="text-sm text-gray-300 font-mono whitespace-pre">{code}</code>
            </pre>
        </div>
    );
};

// ============================================================
// Callout component
// ============================================================
const Callout: React.FC<{ type?: "info" | "tip" | "warning"; children: React.ReactNode }> = ({ type = "info", children }) => {
    const styles = {
        info: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
        tip: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200",
        warning: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200",
    };
    const icons = { info: "💡", tip: "✅", warning: "⚠️" };
    return (
        <div className={`flex gap-3 p-4 rounded-lg border ${styles[type]} my-4`}>
            <span className="text-lg flex-shrink-0">{icons[type]}</span>
            <div className="text-sm leading-relaxed">{children}</div>
        </div>
    );
};

// ============================================================
// Section content components
// ============================================================
const IntroductionContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.intro-title")}</h1>
        <p className="text-lg text-notion-light mb-6 leading-relaxed">{t("docs.intro-desc")}</p>
        <p className="text-notion-light mb-8 leading-relaxed">{t("docs.intro-desc2")}</p>

        <h2 className="text-2xl font-bold text-notion mb-4">{t("docs.intro-highlights")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {[
                { icon: <FileText className="w-5 h-5" />, color: "blue", titleKey: "docs.intro-feature-editor", descKey: "docs.intro-feature-editor-desc" },
                { icon: <Puzzle className="w-5 h-5" />, color: "purple", titleKey: "docs.intro-feature-plugins", descKey: "docs.intro-feature-plugins-desc" },
                { icon: <Brain className="w-5 h-5" />, color: "orange", titleKey: "docs.intro-feature-ai", descKey: "docs.intro-feature-ai-desc" },
                { icon: <Users className="w-5 h-5" />, color: "green", titleKey: "docs.intro-feature-collab", descKey: "docs.intro-feature-collab-desc" },
                { icon: <Database className="w-5 h-5" />, color: "indigo", titleKey: "docs.intro-feature-db", descKey: "docs.intro-feature-db-desc" },
                { icon: <Globe className="w-5 h-5" />, color: "teal", titleKey: "docs.intro-feature-crossplatform", descKey: "docs.intro-feature-crossplatform-desc" },
            ].map(({ icon, color, titleKey, descKey }) => (
                <div key={titleKey} className={`bento-card border-${color}-100 dark:border-${color}-900/30`}>
                    <div className={`w-10 h-10 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center text-${color}-600 dark:text-${color}-400 mb-3`}>
                        {icon}
                    </div>
                    <h3 className="font-semibold text-notion mb-1">{t(titleKey)}</h3>
                    <p className="text-sm text-notion-light">{t(descKey)}</p>
                </div>
            ))}
        </div>

        <h2 className="text-2xl font-bold text-notion mb-4">{t("docs.intro-techstack")}</h2>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.intro-category")}</th>
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.intro-technology")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[
                        [t("docs.intro-build"), "Turborepo, Vite 5, Rollup 4, electron-vite"],
                        [t("docs.intro-frontend"), "React 18, TypeScript 5, Tailwind CSS 3, shadcn/ui"],
                        [t("docs.intro-editor-tech"), "Tiptap 3.x (Headless Rich Text)"],
                        [t("docs.intro-state"), "React-Redux, React Router 6"],
                        [t("docs.intro-ai-tech"), "Vercel AI SDK + DeepSeek / Anthropic Claude"],
                        [t("docs.intro-desktop"), "Electron + electron-builder"],
                        [t("docs.intro-collab-tech"), "Hocuspocus + Y.js (CRDT)"],
                    ].map(([cat, tech]) => (
                        <tr key={cat}>
                            <td className="px-4 py-3 font-medium text-notion">{cat}</td>
                            <td className="px-4 py-3 text-notion-light font-mono text-xs">{tech}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <Callout type="tip">{t("docs.intro-tip")}</Callout>
    </div>
);

const GettingStartedContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.gs-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.gs-desc")}</p>

        <h2 id="installation" className="text-2xl font-bold text-notion mb-4 mt-8 scroll-mt-20">{t("docs.gs-install-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.gs-install-desc")}</p>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.gs-prerequisites")}</h3>
        <ul className="list-disc pl-6 text-notion-light space-y-2 mb-6">
            <li>Node.js 18+</li>
            <li>pnpm 8+ (<code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono">npm install -g pnpm</code>)</li>
            <li>Git</li>
        </ul>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.gs-clone")}</h3>
        <CodeBlock language="bash" code={`git clone https://github.com/LRF0422/knowledge-repo.git
cd knowledge-repo
pnpm install`} />

        <h2 id="quick-start" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.gs-quickstart-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.gs-quickstart-desc")}</p>

        <div className="space-y-4 mb-6">
            <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold">1</div>
                <div className="flex-1">
                    <p className="font-medium text-notion mb-2">{t("docs.gs-step1")}</p>
                    <CodeBlock language="bash" code="cp .env.example .env.local" />
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold">2</div>
                <div className="flex-1">
                    <p className="font-medium text-notion mb-2">{t("docs.gs-step2")}</p>
                    <CodeBlock language="bash" code="pnpm dev" />
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold">3</div>
                <div className="flex-1">
                    <p className="font-medium text-notion mb-2">{t("docs.gs-step3")}</p>
                    <CodeBlock language="bash" code="pnpm room-server:dev" />
                </div>
            </div>
        </div>

        <Callout type="info">{t("docs.gs-tip")}</Callout>

        <h2 id="project-structure" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.gs-structure-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.gs-structure-desc")}</p>
        <CodeBlock language="text" code={`knowledge-repo/
├── apps/
│   ├── vite/                 # Main web application (Vite + React 18)
│   ├── desktop/              # Electron desktop app (electron-vite)
│   └── landing-page-vite/    # Marketing site (Vite)
├── packages/
│   ├── core/                 # Core: plugin system, AI Agent, settings
│   ├── editor/               # Tiptap 3.x editor integration
│   ├── common/               # Shared utilities, types, HTTP client, logger
│   ├── ui/                   # shadcn/ui component library
│   ├── room-server/          # Hocuspocus collaboration server
│   ├── plugin-ai/            # AI chat, text/image generation
│   ├── plugin-bitable/       # Multi-view database (7 views)
│   ├── plugin-excalidraw/    # Hand-drawn diagrams & whiteboard
│   ├── plugin-drawio-v2/     # Professional diagrams (draw.io)
│   ├── plugin-mermaid/       # Text-based diagrams
│   ├── plugin-mindmap-canvas/# Mind mapping
│   ├── plugin-database/      # Simple database blocks
│   ├── plugin-bilibili/      # Bilibili video embed
│   ├── plugin-block-reference/# Block reference & bi-directional links
│   ├── plugin-file-manager/  # File management
│   └── ...                   # ESLint, TypeScript, Rollup configs`} />

        <h2 id="dev-commands" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.gs-commands-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.gs-commands-desc")}</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.gs-command")}</th>
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.gs-purpose")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[
                        ["pnpm dev", t("docs.gs-cmd-dev")],
                        ["pnpm app:dev", t("docs.gs-cmd-appdev")],
                        ["pnpm desktop:dev", t("docs.gs-cmd-desktopdev")],
                        ["pnpm room-server:dev", t("docs.gs-cmd-roomdev")],
                        ["pnpm build", t("docs.gs-cmd-build")],
                        ["pnpm build:core", t("docs.gs-cmd-buildcore")],
                        ["pnpm lint", t("docs.gs-cmd-lint")],
                        ["pnpm format", t("docs.gs-cmd-format")],
                        ["pnpm ui:add [name]", t("docs.gs-cmd-uiadd")],
                        ["pnpm desktop:package:win", t("docs.gs-cmd-packagewin")],
                    ].map(([cmd, desc]) => (
                        <tr key={cmd}>
                            <td className="px-4 py-3"><code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-notion">{cmd}</code></td>
                            <td className="px-4 py-3 text-notion-light">{desc}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const CoreConceptsContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.concepts-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.concepts-desc")}</p>

        <h2 id="workspaces" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.concepts-workspace-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.concepts-workspace-desc")}</p>
        <p className="text-notion-light mb-6">{t("docs.concepts-workspace-detail")}</p>

        <h2 id="pages-blocks" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.concepts-pages-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.concepts-pages-desc")}</p>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.concepts-basic-blocks")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {[
                { name: t("docs.block-paragraph"), icon: "📝" },
                { name: t("docs.block-heading"), icon: "📌", detail: "H1 / H2 / H3" },
                { name: t("docs.block-list"), icon: "📋", detail: t("docs.block-list-detail") },
                { name: t("docs.block-checklist"), icon: "☑️" },
                { name: t("docs.block-code"), icon: "💻" },
                { name: t("docs.block-image"), icon: "🖼️" },
                { name: t("docs.block-table"), icon: "📊" },
                { name: t("docs.block-quote"), icon: "💬" },
                { name: t("docs.block-divider"), icon: "➖" },
                { name: t("docs.block-callout"), icon: "💡" },
                { name: t("docs.block-columns"), icon: "📐", detail: "2-6 " + t("docs.block-columns-detail") },
                { name: t("docs.block-toggle"), icon: "▶️" },
            ].map(b => (
                <div key={b.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm text-notion">
                    <span>{b.icon}</span>
                    <div>
                        <span>{b.name}</span>
                        {b.detail && <span className="text-xs text-notion-light ml-1">({b.detail})</span>}
                    </div>
                </div>
            ))}
        </div>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.concepts-embed-blocks")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {[
                { name: "Excalidraw", icon: "✏️" },
                { name: "Draw.io", icon: "📐" },
                { name: "Mermaid", icon: "🧜" },
                { name: t("docs.block-mindmap"), icon: "🧠" },
                { name: t("docs.block-bitable"), icon: "🗃️" },
                { name: "Bilibili", icon: "📺" },
            ].map(b => (
                <div key={b.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm text-notion">
                    <span>{b.icon}</span> {b.name}
                </div>
            ))}
        </div>

        <h2 id="slash-commands" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.concepts-slash-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.concepts-slash-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.concepts-slash-detail")}</p>
        <Callout type="tip">{t("docs.concepts-slash-tip")}</Callout>

        <h2 id="bi-links" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.concepts-bilinks-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.concepts-bilinks-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.concepts-bilinks-detail")}</p>
    </div>
);

const EditorContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.editor-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.editor-desc")}</p>

        <h2 id="rich-text" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.editor-richtext-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.editor-richtext-desc")}</p>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.editor-inline-formats")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
                { name: t("docs.fmt-bold"), example: "**text**" },
                { name: t("docs.fmt-italic"), example: "*text*" },
                { name: t("docs.fmt-underline"), example: "" },
                { name: t("docs.fmt-strikethrough"), example: "~~text~~" },
                { name: t("docs.fmt-code"), example: "`code`" },
                { name: t("docs.fmt-highlight"), example: "" },
                { name: t("docs.fmt-link"), example: "[text](url)" },
                { name: t("docs.fmt-color"), example: "" },
            ].map(f => (
                <div key={f.name} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm">
                    <span className="text-notion font-medium">{f.name}</span>
                    {f.example && <code className="ml-2 text-xs text-notion-light font-mono">{f.example}</code>}
                </div>
            ))}
        </div>

        <h2 id="markdown-shortcuts" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.editor-md-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.editor-md-desc")}</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.editor-md-input")}</th>
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.editor-md-result")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[
                        ["# + Space", t("docs.md-h1")],
                        ["## + Space", t("docs.md-h2")],
                        ["### + Space", t("docs.md-h3")],
                        ["- + Space", t("docs.md-bullet")],
                        ["1. + Space", t("docs.md-numbered")],
                        ["[] + Space", t("docs.md-checklist")],
                        ["> + Space", t("docs.md-quote")],
                        ["``` + Space", t("docs.md-codeblock")],
                        ["--- + Enter", t("docs.md-divider")],
                    ].map(([input, result]) => (
                        <tr key={input}>
                            <td className="px-4 py-3"><kbd className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-notion">{input}</kbd></td>
                            <td className="px-4 py-3 text-notion-light">{result}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <h2 id="keyboard-shortcuts" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.editor-shortcuts-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.editor-shortcuts-desc")}</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.editor-shortcut")}</th>
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.editor-action")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[
                        ["Ctrl/Cmd + B", t("docs.shortcut-bold")],
                        ["Ctrl/Cmd + I", t("docs.shortcut-italic")],
                        ["Ctrl/Cmd + U", t("docs.shortcut-underline")],
                        ["Ctrl/Cmd + K", t("docs.shortcut-link")],
                        ["Ctrl/Cmd + Z", t("docs.shortcut-undo")],
                        ["Ctrl/Cmd + Shift + Z", t("docs.shortcut-redo")],
                        ["/", t("docs.shortcut-slash")],
                        ["Ctrl/Cmd + Shift + H", t("docs.shortcut-highlight")],
                        ["Ctrl/Cmd + E", t("docs.shortcut-code")],
                        ["Ctrl/Cmd + Shift + X", t("docs.shortcut-strikethrough")],
                        ["Tab", t("docs.shortcut-indent")],
                        ["Shift + Tab", t("docs.shortcut-outdent")],
                    ].map(([shortcut, action]) => (
                        <tr key={shortcut}>
                            <td className="px-4 py-3"><kbd className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-notion">{shortcut}</kbd></td>
                            <td className="px-4 py-3 text-notion-light">{action}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <h2 id="columns-layout" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.editor-columns-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.editor-columns-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.editor-columns-detail")}</p>
        <Callout type="tip">{t("docs.editor-columns-tip")}</Callout>
    </div>
);

const PluginsContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.plugins-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.plugins-desc")}</p>

        <h2 id="plugin-overview" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.plugins-overview-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.plugins-overview-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.plugins-overview-detail")}</p>

        <CodeBlock language="typescript" code={`// ExtensionWrapper - the core plugin interface
interface ExtensionWrapper {
    name: string;
    extendsion: AnyExtension[];  // Tiptap extensions
    slashConfig?: SlashConfig[]; // Slash command registrations
    tools?: ToolConfig[];        // AI tools this plugin provides
    skills?: SkillConfig[];      // AI skills this plugin provides
    bubbleMenu?: ElementType[];  // Bubble menu components
}`} />

        <h2 id="available-plugins" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.plugins-available-title")}</h2>
        <div className="space-y-4 mb-6">
            {[
                { name: "plugin-ai", desc: t("docs.plugin-ai-detail"), color: "orange", features: t("docs.plugin-ai-features") },
                { name: "plugin-bitable", desc: t("docs.plugin-bitable-detail"), color: "purple", features: t("docs.plugin-bitable-features") },
                { name: "plugin-excalidraw", desc: t("docs.plugin-excalidraw-detail"), color: "green", features: t("docs.plugin-excalidraw-features") },
                { name: "plugin-mermaid", desc: t("docs.plugin-mermaid-detail"), color: "blue", features: t("docs.plugin-mermaid-features") },
                { name: "plugin-drawio-v2", desc: t("docs.plugin-drawio-detail"), color: "cyan", features: t("docs.plugin-drawio-features") },
                { name: "plugin-mindmap-canvas", desc: t("docs.plugin-mindmap-detail"), color: "pink", features: t("docs.plugin-mindmap-features") },
                { name: "plugin-block-reference", desc: t("docs.plugin-blockref-detail"), color: "indigo", features: t("docs.plugin-blockref-features") },
                { name: "plugin-bilibili", desc: t("docs.plugin-bilibili-detail"), color: "sky", features: t("docs.plugin-bilibili-features") },
            ].map(p => (
                <div key={p.name} className="p-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-2 h-8 rounded-full bg-${p.color}-400 flex-shrink-0`}></div>
                        <h4 className="font-mono text-sm font-semibold text-notion">{p.name}</h4>
                    </div>
                    <p className="text-sm text-notion-light mb-2">{p.desc}</p>
                    <p className="text-xs text-notion-light italic">{p.features}</p>
                </div>
            ))}
        </div>

        <h2 id="create-plugin" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.plugins-create-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.plugins-create-desc")}</p>
        <CodeBlock language="typescript" code={`// 1. Create extension wrapper
import { ExtensionWrapper } from '@kn/common';

export const MyFeatureExtension: ExtensionWrapper = {
    name: 'my-feature',
    extendsion: [MyTiptapExtension],

    // Register slash commands
    slashConfig: [{
        text: 'My Feature',
        slash: '/my-feature',
        action: (editor) => {
            editor.commands.insertContent({ type: 'myFeatureBlock' });
        }
    }],
};

// 2. Register as a plugin
import { Plugin } from '@kn/common';

export const myPlugin: Plugin = {
    name: 'my-plugin',
    extensions: [MyFeatureExtension],
    components: [MySettingsPanel]  // Optional UI components
};`} />

        <h2 id="plugin-tools-skills" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.plugins-toolsskills-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.plugins-toolsskills-desc")}</p>
        <CodeBlock language="typescript" code={`// Adding AI tools and skills to a plugin
export const MyExtension: ExtensionWrapper = {
    name: 'my-feature',
    extendsion: [...],

    // AI tools: callable functions for the AI agent
    tools: [{
        name: 'createMyFeature',
        description: 'Create a my-feature block with given params',
        inputSchema: z.object({
            title: z.string(),
            data: z.array(z.string())
        }),
        execute: (editor) => async ({ title, data }) => {
            // Tool implementation
            return { success: true };
        }
    }],

    // AI skills: specialized prompt fragments
    skills: [{
        name: 'my-feature-expert',
        description: 'Expert at creating my-feature blocks',
        requiredTools: ['createMyFeature'],
        systemPromptFragment: '## Expert Mode\\n...',
        tags: ['my-feature']
    }]
};`} />
    </div>
);

const AIFeaturesContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.ai-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.ai-desc")}</p>

        <h2 id="ai-assistant" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.ai-assistant-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.ai-assistant-desc")}</p>
        <p className="text-notion-light mb-6">{t("docs.ai-assistant-detail")}</p>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.ai-providers-title")}</h3>
        <ul className="list-disc pl-6 text-notion-light space-y-2 mb-6">
            <li><strong>DeepSeek</strong> — {t("docs.ai-provider-deepseek")}</li>
            <li><strong>Anthropic Claude</strong> — {t("docs.ai-provider-claude")}</li>
        </ul>

        <h2 id="ai-tools" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.ai-tools-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.ai-tools-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.ai-tools-discovery")}</p>

        <div className="space-y-4 mb-6">
            {[
                { category: t("docs.ai-cat-read"), tools: "getDocumentStructure, readChunk, searchInDocument, getNodeAtPosition, getDocumentSize", desc: t("docs.ai-cat-read-desc") },
                { category: t("docs.ai-cat-write"), tools: "write, insertNear, insertAtEnd, replaceContent, batchInsert, insertAfterBlock, insertSegmentedMarkdown", desc: t("docs.ai-cat-write-desc") },
                { category: t("docs.ai-cat-delete"), tools: "deleteRange, deleteBySearch, deleteBlock", desc: t("docs.ai-cat-delete-desc") },
                { category: t("docs.ai-cat-structure"), tools: "convertBlock, moveBlock, setBlockAlignment, formatText, insertTable, editTable, editTableCell", desc: t("docs.ai-cat-structure-desc") },
                { category: t("docs.ai-cat-layout"), tools: "insertColumns, getColumnsInfo, updateColumnContent, setColumnsLayout, insertNestedColumns", desc: t("docs.ai-cat-layout-desc") },
                { category: t("docs.ai-cat-interaction"), tools: "askUserChoice, highlight", desc: t("docs.ai-cat-interaction-desc") },
                { category: t("docs.ai-cat-web"), tools: "webSearch, fetchWebPage", desc: t("docs.ai-cat-web-desc") },
                { category: t("docs.ai-cat-plugin"), tools: t("docs.ai-cat-plugin-tools"), desc: t("docs.ai-cat-plugin-desc") },
            ].map(c => (
                <div key={c.category} className="p-4 rounded-lg border border-gray-100 dark:border-gray-800">
                    <h4 className="font-semibold text-notion mb-1">{c.category}</h4>
                    <p className="text-xs text-notion-light mb-2">{c.desc}</p>
                    <code className="text-xs font-mono text-indigo-600 dark:text-indigo-400">{c.tools}</code>
                </div>
            ))}
        </div>
        <Callout type="info">{t("docs.ai-tools-tip")}</Callout>

        <h2 id="ai-skills" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.ai-skills-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.ai-skills-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.ai-skills-detail")}</p>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.ai-skills-builtin-title")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
                { name: "document-refactor", desc: t("docs.ai-skill-refactor-desc") },
                { name: "content-analysis", desc: t("docs.ai-skill-analysis-desc") },
            ].map(s => (
                <div key={s.name} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <span className="font-mono text-sm font-medium text-notion">{s.name}</span>
                    <p className="text-xs text-notion-light mt-1">{s.desc}</p>
                </div>
            ))}
        </div>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.ai-skills-examples-title")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
                { name: t("docs.ai-skill-translation"), desc: t("docs.ai-skill-translation-desc") },
                { name: t("docs.ai-skill-codedoc"), desc: t("docs.ai-skill-codedoc-desc") },
                { name: t("docs.ai-skill-meeting"), desc: t("docs.ai-skill-meeting-desc") },
                { name: t("docs.ai-skill-writing"), desc: t("docs.ai-skill-writing-desc") },
            ].map(s => (
                <div key={s.name} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <span className="text-sm font-medium text-notion">{s.name}</span>
                    <p className="text-xs text-notion-light mt-1">{s.desc}</p>
                </div>
            ))}
        </div>

        <h3 className="text-lg font-semibold text-notion mb-3">{t("docs.ai-skill-format")}</h3>
        <CodeBlock language="markdown" code={`---
name: my-skill
description: A custom skill for specific tasks
version: 1.0.0
author: Your Name
---
# Instructions
You are a specialized assistant that...

## Workflow
1. First, analyze the document...
2. Then, perform the task...

## Best Practices
- Preserve formatting
- Ask before major changes`} />

        <h2 id="ai-skillsmp" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.ai-skillsmp-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.ai-skillsmp-desc")}</p>
        <ul className="list-disc pl-6 text-notion-light space-y-2 mb-6">
            <li>{t("docs.ai-skillsmp-browse")}</li>
            <li>{t("docs.ai-skillsmp-install")}</li>
            <li>{t("docs.ai-skillsmp-custom")}</li>
        </ul>
    </div>
);

const DatabaseContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.db-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.db-desc")}</p>

        <h2 id="field-types" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.db-fields-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.db-fields-desc")}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {[
                { name: t("docs.field-text"), type: "TEXT" },
                { name: t("docs.field-number"), type: "NUMBER" },
                { name: t("docs.field-select"), type: "SELECT" },
                { name: t("docs.field-multiselect"), type: "MULTI_SELECT" },
                { name: t("docs.field-date"), type: "DATE" },
                { name: t("docs.field-checkbox"), type: "CHECKBOX" },
                { name: t("docs.field-person"), type: "PERSON" },
                { name: t("docs.field-attachment"), type: "ATTACHMENT" },
                { name: t("docs.field-image"), type: "IMAGE" },
                { name: t("docs.field-url"), type: "URL" },
                { name: t("docs.field-email"), type: "EMAIL" },
                { name: t("docs.field-phone"), type: "PHONE" },
                { name: t("docs.field-rating"), type: "RATING" },
                { name: t("docs.field-progress"), type: "PROGRESS" },
                { name: t("docs.field-formula"), type: "FORMULA" },
                { name: t("docs.field-relation"), type: "RELATION" },
                { name: t("docs.field-created-time"), type: "CREATED_TIME" },
                { name: t("docs.field-updated-time"), type: "UPDATED_TIME" },
                { name: t("docs.field-created-by"), type: "CREATED_BY" },
                { name: t("docs.field-updated-by"), type: "UPDATED_BY" },
                { name: t("docs.field-autonumber"), type: "AUTO_NUMBER" },
            ].map(f => (
                <div key={f.type} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm">
                    <span className="text-notion">{f.name}</span>
                    <code className="text-xs text-notion-light font-mono">{f.type}</code>
                </div>
            ))}
        </div>
        <p className="text-notion-light mb-6">{t("docs.db-fields-operations")}</p>

        <h2 id="table-view" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.db-table-title")}</h2>
        <p className="text-notion-light mb-6">{t("docs.db-table-desc")}</p>

        <h2 id="kanban-view" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.db-kanban-title")}</h2>
        <p className="text-notion-light mb-6">{t("docs.db-kanban-desc")}</p>

        <h2 id="calendar-view" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.db-calendar-title")}</h2>
        <p className="text-notion-light mb-6">{t("docs.db-calendar-desc")}</p>

        <h2 id="chart-view" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.db-chart-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.db-chart-desc")}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
                { name: t("docs.chart-bar"), icon: <BarChart3 className="w-4 h-4" /> },
                { name: t("docs.chart-line"), icon: <BarChart3 className="w-4 h-4" /> },
                { name: t("docs.chart-pie"), icon: <Palette className="w-4 h-4" /> },
                { name: t("docs.chart-area"), icon: <BarChart3 className="w-4 h-4" /> },
                { name: t("docs.chart-radar"), icon: <Globe className="w-4 h-4" /> },
                { name: t("docs.chart-scatter"), icon: <Blocks className="w-4 h-4" /> },
                { name: t("docs.chart-radialbar"), icon: <Palette className="w-4 h-4" /> },
                { name: t("docs.chart-stacked"), icon: <BarChart3 className="w-4 h-4" /> },
            ].map(v => (
                <div key={v.name} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm text-notion">
                    {v.icon}
                    <span>{v.name}</span>
                </div>
            ))}
        </div>

        <h2 id="timeline-view" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.db-timeline-title")}</h2>
        <p className="text-notion-light mb-6">{t("docs.db-timeline-desc")}</p>

        <Callout type="tip">{t("docs.db-excel-tip")}</Callout>
    </div>
);

const CollaborationContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.collab-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.collab-desc")}</p>

        <h2 id="realtime-editing" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.collab-realtime-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.collab-realtime-desc")}</p>

        <div className="space-y-6 mb-8">
            {[
                { icon: <Zap className="w-5 h-5" />, color: "green", titleKey: "docs.collab-crdt-title", descKey: "docs.collab-crdt-desc" },
                { icon: <Users className="w-5 h-5" />, color: "blue", titleKey: "docs.collab-cursor-title", descKey: "docs.collab-cursor-desc" },
                { icon: <Shield className="w-5 h-5" />, color: "purple", titleKey: "docs.collab-conflict-title", descKey: "docs.collab-conflict-desc" },
            ].map(({ icon, color, titleKey, descKey }) => (
                <div key={titleKey} className="flex gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center text-${color}-600 dark:text-${color}-400`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-semibold text-notion mb-1">{t(titleKey)}</h3>
                        <p className="text-sm text-notion-light">{t(descKey)}</p>
                    </div>
                </div>
            ))}
        </div>

        <h2 id="collab-server" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.collab-server-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.collab-server-desc")}</p>
        <CodeBlock language="bash" code={`# Start collaboration server (default port: 1234)
pnpm room-server:dev

# The server URL is configured via environment variable:
# VITE_COLLABORATION_WS_URL=ws://localhost:1234`} />
        <Callout type="info">{t("docs.collab-tip")}</Callout>
    </div>
);

const SelfHostingContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.hosting-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.hosting-desc")}</p>

        <h2 id="docker-deploy" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.hosting-docker-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.hosting-docker-desc")}</p>
        <CodeBlock language="bash" code={`# Build the Docker image
docker build -t kotion .

# Run the container
docker run -d -p 3000:3000 \\
  -e VITE_API_BASE_URL=https://your-api.com \\
  -e VITE_COLLABORATION_WS_URL=ws://your-server:1234 \\
  kotion`} />

        <h2 id="manual-deploy" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.hosting-manual-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.hosting-manual-desc")}</p>
        <CodeBlock language="bash" code={`# 1. Clone and install
git clone https://github.com/LRF0422/knowledge-repo.git
cd knowledge-repo && pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your settings

# 3. Build all packages
pnpm build

# 4. Start production server
pnpm start

# 5. Start collaboration server
pnpm room-server:start`} />

        <h2 id="env-variables" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.hosting-env-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.hosting-env-desc")}</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.env-variable")}</th>
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.env-description")}</th>
                        <th className="text-left px-4 py-3 font-medium text-notion">{t("docs.env-default")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[
                        ["VITE_API_BASE_URL", t("docs.env-api-url"), "-"],
                        ["VITE_COLLABORATION_WS_URL", t("docs.env-ws-url"), "ws://localhost:1234"],
                        ["VITE_AI_IMAGE_API_KEY", t("docs.env-ai-key"), "-"],
                    ].map(([name, desc, def]) => (
                        <tr key={name}>
                            <td className="px-4 py-3 font-mono text-xs text-notion">{name}</td>
                            <td className="px-4 py-3 text-notion-light">{desc}</td>
                            <td className="px-4 py-3 text-notion-light font-mono text-xs">{def}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <h2 id="desktop-app" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.hosting-desktop-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.hosting-desktop-desc")}</p>
        <CodeBlock language="bash" code={`# Development
pnpm desktop:dev

# Package for different platforms
pnpm desktop:package:win    # Windows
pnpm desktop:package:mac    # macOS
pnpm desktop:package:linux  # Linux`} />
        <Callout type="info">{t("docs.hosting-desktop-tip")}</Callout>
    </div>
);

const APIReferenceContent: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div>
        <h1 className="text-3xl md:text-4xl font-bold text-notion mb-4">{t("docs.api-title")}</h1>
        <p className="text-lg text-notion-light mb-8">{t("docs.api-desc")}</p>

        <h2 id="rest-api" className="text-2xl font-bold text-notion mb-4 scroll-mt-20">{t("docs.api-rest-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.api-rest-desc")}</p>
        <CodeBlock language="bash" code={`# Workspace operations
GET    /api/workspaces           # List all workspaces
POST   /api/workspaces           # Create workspace
GET    /api/workspaces/:id       # Get workspace details

# Page operations
GET    /api/pages/:id            # Get page content
POST   /api/pages                # Create a new page
PUT    /api/pages/:id            # Update page content
DELETE /api/pages/:id            # Delete page

# Example: Create a new page
POST /api/pages
Content-Type: application/json
{
  "title": "My Page",
  "parentId": "workspace-id",
  "content": { "type": "doc", "content": [] }
}`} />

        <h2 id="websocket-api" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.api-ws-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.api-ws-desc")}</p>
        <p className="text-notion-light mb-4">{t("docs.api-ws-detail")}</p>
        <CodeBlock language="typescript" code={`// Collaboration is powered by Hocuspocus (Y.js backend)
// Connection is handled automatically by the Tiptap collaboration extension

// Server: packages/room-server
// Uses @hocuspocus/server with Y.js document provider
// Supports: document sync, awareness (cursors), persistence

// Client-side: automatic via Tiptap Collaboration extension
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

const ydoc = new Y.Doc()
const provider = new HocuspocusProvider({
    url: 'ws://localhost:1234',
    name: 'document-id',
    document: ydoc,
})`} />

        <h2 id="plugin-api" className="text-2xl font-bold text-notion mb-4 mt-10 scroll-mt-20">{t("docs.api-plugin-title")}</h2>
        <p className="text-notion-light mb-4">{t("docs.api-plugin-desc")}</p>
        <CodeBlock language="typescript" code={`// Core plugin interfaces
interface ExtensionWrapper {
    name: string;
    extendsion: AnyExtension[];
    slashConfig?: SlashConfig[];
    tools?: ToolConfig[];
    skills?: SkillConfig[];
    bubbleMenu?: ElementType[];
}

interface ToolConfig {
    name: string;
    description: string;
    inputSchema: ZodSchema;
    execute: (editor: Editor) => (params: any) => Promise<any>;
}

interface SkillConfig {
    name: string;
    description: string;
    requiredTools: string[];
    optionalTools?: string[];
    systemPromptFragment: string;
    tags: string[];
}

interface SlashConfig {
    text: string;           // Display name in command palette
    slash: string;          // Slash command trigger (e.g. "/table")
    action: (editor: Editor) => void;
    icon?: ReactNode;
    group?: string;
}

// Plugin registration
interface Plugin {
    name: string;
    extensions: ExtensionWrapper[];
    components?: ElementType[];
}`} />
        <p className="text-notion-light mt-4">{t("docs.api-plugin-note")}</p>
    </div>
);

// Section content mapping
const SECTION_CONTENT: Record<string, React.FC<{ t: (key: string) => string }>> = {
    "introduction": IntroductionContent,
    "getting-started": GettingStartedContent,
    "core-concepts": CoreConceptsContent,
    "editor": EditorContent,
    "plugins": PluginsContent,
    "ai-features": AIFeaturesContent,
    "database": DatabaseContent,
    "collaboration": CollaborationContent,
    "self-hosting": SelfHostingContent,
    "api-reference": APIReferenceContent,
};

// ============================================================
// Main Docs component
// ============================================================
export const Docs: React.FC = () => {
    const { section } = useParams<{ section?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const currentSection = section || "introduction";

    // Close sidebar on navigation (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [currentSection]);

    const filteredSections = DOC_SECTIONS.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const title = t(`docs.nav-${s.id}`).toLowerCase();
        if (title.includes(q)) return true;
        return s.children?.some(c => t(`docs.nav-${c.id}`).toLowerCase().includes(q));
    });

    const ContentComponent = SECTION_CONTENT[currentSection];

    // Find prev/next sections for navigation
    const flatSections = DOC_SECTIONS.map(s => s.id);
    const currentIndex = flatSections.indexOf(currentSection);
    const prevSection = currentIndex > 0 ? flatSections[currentIndex - 1] : null;
    const nextSection = currentIndex < flatSections.length - 1 ? flatSections[currentIndex + 1] : null;

    return (
        <div className="min-h-screen bg-white dark:bg-gray-950">
            {/* Mobile sidebar toggle */}
            <div className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    {sidebarOpen ? <X className="w-5 h-5 text-notion" /> : <Menu className="w-5 h-5 text-notion" />}
                </button>
                <span className="text-sm font-medium text-notion">{t(`docs.nav-${currentSection}`)}</span>
            </div>

            <div className="container-padding">
                <div className="flex gap-0 lg:gap-8 relative">
                    {/* Sidebar */}
                    <aside className={`
                        fixed lg:sticky top-0 lg:top-4 left-0 z-30
                        w-72 lg:w-64 xl:w-72 flex-shrink-0
                        h-screen lg:h-[calc(100vh-65px)]
                        bg-white dark:bg-gray-950 lg:bg-transparent
                        border-r lg:border-r-0 border-gray-200 dark:border-gray-800
                        transition-transform duration-300
                        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                        overflow-y-auto py-6 px-4 lg:px-0
                    `}>
                        {/* Search */}
                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={t("docs.search-placeholder")}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-notion placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            />
                        </div>

                        {/* Navigation */}
                        <nav className="space-y-1">
                            {filteredSections.map((section) => {
                                const isActive = currentSection === section.id;
                                const isParentActive = section.children?.some(c => c.id === currentSection);

                                return (
                                    <div key={section.id}>
                                        <Link
                                            to={`/doc/${section.id}`}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                isActive
                                                    ? 'bg-primary/10 text-primary'
                                                    : isParentActive
                                                    ? 'text-notion'
                                                    : 'text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <span className={isActive ? 'text-primary' : 'text-gray-400'}>{section.icon}</span>
                                            {t(`docs.nav-${section.id}`)}
                                        </Link>

                                        {/* Sub-items */}
                                        {section.children && (isActive || isParentActive) && (
                                            <div className="ml-7 mt-1 space-y-1 border-l-2 border-gray-100 dark:border-gray-800 pl-3">
                                                {section.children.map((child) => (
                                                    <a
                                                        key={child.id}
                                                        href={`#${child.id}`}
                                                        className="block px-2 py-1.5 text-sm text-notion-light hover:text-notion transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                    >
                                                        {t(`docs.nav-${child.id}`)}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </nav>
                    </aside>

                    {/* Backdrop for mobile */}
                    {sidebarOpen && (
                        <div
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}

                    {/* Main content */}
                    <main className="flex-1 min-w-0 py-8 lg:py-10">
                        <div className="max-w-3xl">
                            {ContentComponent ? (
                                <ContentComponent t={t} />
                            ) : (
                                <div className="text-center py-20">
                                    <p className="text-notion-light">{t("docs.section-not-found")}</p>
                                    <Button
                                        variant="outline"
                                        className="mt-4 rounded-lg"
                                        onClick={() => navigate('/doc/introduction')}
                                    >
                                        {t("docs.go-to-intro")}
                                    </Button>
                                </div>
                            )}

                            {/* Prev/Next navigation */}
                            <div className="flex items-center justify-between mt-16 pt-8 border-t border-gray-200 dark:border-gray-800">
                                {prevSection ? (
                                    <Link
                                        to={`/doc/${prevSection}`}
                                        className="flex items-center gap-2 text-sm text-notion-light hover:text-notion transition-colors group"
                                    >
                                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                                        {t(`docs.nav-${prevSection}`)}
                                    </Link>
                                ) : <div />}
                                {nextSection ? (
                                    <Link
                                        to={`/doc/${nextSection}`}
                                        className="flex items-center gap-2 text-sm text-notion-light hover:text-notion transition-colors group"
                                    >
                                        {t(`docs.nav-${nextSection}`)}
                                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                ) : <div />}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};
