/**
 * 运行时 head 管理：按路由 + 语言设置 title / description / OG / Twitter /
 * canonical / hreflang，并注入 JSON-LD。
 *
 * - 先渲染内置默认值，CMS 配置异步到达后自动覆盖（不阻塞首屏）；
 * - canonical 规则消除 `/` 与 `/zh` 的重复内容；
 * - 所有 DOM 操作都包裹 try/catch，缺少 document 时静默跳过。
 */

import { getCachedConfig, loadOpsConfig, type OpsConfig, type OpsSeoPayload } from "./config";

const SITE_ORIGIN = "https://kotion.top";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
const DEFAULT_ROBOTS = "index,follow";

type Locale = "zh" | "en";

interface SeoDefaults {
    title: string;
    description: string;
    keywords: string;
}

/** 内置每路由默认值（CMS 无对应条目时使用）。 */
const ROUTE_DEFAULTS: Record<string, Record<Locale, SeoDefaults>> = {
    "/": {
        zh: {
            title: "Kotion · 开源一体化知识工作台",
            description:
                "Kotion 是开源的一体化知识工作台：文档、多维表格、白板、AI 与实时协作，支持自托管部署。20+ 插件，MIT 协议。",
            keywords: "Kotion,知识工作台,知识库,知识管理,文档协作,多维表格,白板,AI 助手,自托管,开源,MIT",
        },
        en: {
            title: "Kotion · Open-source all-in-one knowledge workspace",
            description:
                "Kotion is an open-source, all-in-one knowledge workspace with docs, databases, whiteboards, AI and real-time collaboration. Self-hostable, 20+ plugins, MIT licensed.",
            keywords:
                "Kotion,knowledge workspace,knowledge base,docs,database,whiteboard,AI assistant,self-hosted,open source,MIT",
        },
    },
    "/templates": {
        zh: {
            title: "模板中心 · Kotion",
            description:
                "浏览官方与社区模板：文档、多维表格、看板、白板与项目管理场景，一键复用并落地到自己的空间。",
            keywords: "Kotion 模板,文档模板,多维表格模板,看板模板,项目管理模板,白板模板",
        },
        en: {
            title: "Templates · Kotion",
            description:
                "Browse official and community templates for docs, databases, kanban, whiteboards and project management — reuse them in your own space in one click.",
            keywords: "Kotion templates,document templates,database templates,kanban,project management,whiteboard",
        },
    },
    "/plugins": {
        zh: {
            title: "插件生态 · Kotion",
            description:
                "20+ 官方与社区插件：多维表格、白板、思维导图、AI 助手与协作扩展，按需组合成属于自己的知识工作台。",
            keywords: "Kotion 插件,知识工作台插件,多维表格,白板,思维导图,AI 插件,自托管",
        },
        en: {
            title: "Plugin ecosystem · Kotion",
            description:
                "20+ official and community plugins: databases, whiteboards, mind maps, AI assistants and collaboration extensions — compose the workspace you need.",
            keywords: "Kotion plugins,workspace plugins,database,whiteboard,mind map,AI plugin,self-hosted",
        },
    },
    "/doc": {
        zh: {
            title: "使用文档 · Kotion",
            description:
                "从安装部署到插件开发，Kotion 官方文档覆盖自托管、协作配置、编辑器扩展与 API 接入。",
            keywords: "Kotion 文档,自托管部署,协作配置,插件开发,API 接入,使用指南",
        },
        en: {
            title: "Documentation · Kotion",
            description:
                "From self-hosted deployment to plugin development, the Kotion docs cover setup, collaboration, editor extensions and API integration.",
            keywords: "Kotion docs,self-hosting,collaboration,plugin development,API,guides",
        },
    },
    "/changelog": {
        zh: {
            title: "更新日志 · Kotion",
            description: "查看 Kotion 的版本发布记录、新功能与改进项，第一时间了解产品演进方向。",
            keywords: "Kotion 更新日志,版本发布,新功能,Release Notes",
        },
        en: {
            title: "Changelog · Kotion",
            description: "Release notes, new features and improvements for Kotion — follow how the product evolves.",
            keywords: "Kotion changelog,release notes,new features,updates",
        },
    },
};

const HOME_DEFAULTS: Record<Locale, SeoDefaults> = {
    zh: ROUTE_DEFAULTS["/"].zh,
    en: ROUTE_DEFAULTS["/"].en,
};

const normalizeLocale = (locale: string): Locale => (locale?.toLowerCase().startsWith("en") ? "en" : "zh");

/** 去掉语言前缀 / query / hash，得到用于默认值与 canonical 的逻辑路径。 */
const toLogicalPath = (path: string): string => {
    const withoutLocale = path.replace(/^\/(zh|en)(?=\/|$)/, "");
    const withoutHash = withoutLocale.split("#")[0] ?? "";
    const withoutQuery = withoutHash.split("?")[0] ?? "";
    if (withoutQuery === "" || withoutQuery === "/") return "/";
    return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
};

/** 逐级向上回退（如 /doc/getting-started → /doc → /）。 */
function resolveDefaults(logicalPath: string, locale: Locale): SeoDefaults {
    let current = logicalPath;
    for (let depth = 0; depth < 8; depth += 1) {
        const found = ROUTE_DEFAULTS[current];
        if (found) return found[locale];
        if (current === "/") break;
        const parent = current.replace(/\/[^/]+$/, "");
        current = parent === "" ? "/" : parent;
    }
    return HOME_DEFAULTS[locale];
}

/**
 * canonical：中文页为 `https://kotion.top<path>`，英文页为 `https://kotion.top/en<path>`，
 * 无论访问的是 `/` 还是 `/zh` 都归一化到同一地址。
 */
function buildCanonical(logicalPath: string, locale: Locale): string {
    const clean = logicalPath === "/" ? "" : logicalPath.replace(/\/+$/, "");
    if (locale === "en") return clean ? `${SITE_ORIGIN}/en${clean}` : `${SITE_ORIGIN}/en`;
    return clean ? `${SITE_ORIGIN}${clean}` : `${SITE_ORIGIN}/`;
}

/* ------------------------------------------------------------------ */
/* DOM 原语                                                           */
/* ------------------------------------------------------------------ */

/** upsert 一个 `<meta>` 标签。 */
export function upsertMeta(attr: "name" | "property", key: string, content: string): void {
    try {
        if (typeof document === "undefined" || !document.head || !key) return;
        const selector = `meta[${attr}="${key}"]`;
        let el = document.head.querySelector<HTMLMetaElement>(selector);
        if (!el) {
            el = document.createElement("meta");
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute("content", content);
    } catch {
        /* head 操作失败不影响页面 */
    }
}

/** upsert 一个 `<link>` 标签（可选 hreflang）。 */
export function upsertLink(rel: string, href: string, hreflang?: string): void {
    try {
        if (typeof document === "undefined" || !document.head || !rel) return;
        const selector = hreflang
            ? `link[rel="${rel}"][hreflang="${hreflang}"]`
            : `link[rel="${rel}"]:not([hreflang])`;
        let el = document.head.querySelector<HTMLLinkElement>(selector);
        if (!el) {
            el = document.createElement("link");
            el.setAttribute("rel", rel);
            if (hreflang) el.setAttribute("hreflang", hreflang);
            document.head.appendChild(el);
        }
        el.setAttribute("href", href);
    } catch {
        /* head 操作失败不影响页面 */
    }
}

/** upsert 一段 JSON-LD（同 id 覆盖，不存在则创建）。 */
export function injectJsonLd(id: string, data: unknown): void {
    try {
        if (typeof document === "undefined" || !document.head || !id) return;
        let el = document.getElementById(id) as HTMLScriptElement | null;
        if (!el || el.tagName !== "SCRIPT") {
            el = document.createElement("script");
            el.type = "application/ld+json";
            el.id = id;
            document.head.appendChild(el);
        }
        el.textContent = JSON.stringify(data);
    } catch {
        /* 序列化 / DOM 失败时忽略 */
    }
}

/** 移除指定 id 的 JSON-LD。 */
export function removeJsonLd(id: string): void {
    try {
        if (typeof document === "undefined") return;
        const el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch {
        /* 忽略 */
    }
}

/* ------------------------------------------------------------------ */
/* SEO 应用                                                           */
/* ------------------------------------------------------------------ */

function resolvePayload(
    config: OpsConfig | undefined,
    pathname: string,
    logicalPath: string,
): OpsSeoPayload | undefined {
    if (!config) return undefined;
    return config.seo[pathname] ?? config.seo[logicalPath];
}

function applySeoPayload(
    config: OpsConfig | undefined,
    pathname: string,
    logicalPath: string,
    locale: Locale,
): void {
    const defaults = resolveDefaults(logicalPath, locale);
    const payload = resolvePayload(config, pathname, logicalPath);

    const title = payload?.title || defaults.title;
    const description = payload?.description || defaults.description;
    const keywords = payload?.keywords || defaults.keywords;
    const canonical = payload?.canonical || buildCanonical(logicalPath, locale);
    const ogImage = payload?.ogImage || DEFAULT_OG_IMAGE;
    const ogTitle = payload?.ogTitle || title;
    const ogDescription = payload?.ogDescription || description;

    document.title = title;

    upsertMeta("name", "description", description);
    upsertMeta("name", "keywords", keywords);
    upsertMeta("name", "robots", payload?.robots || DEFAULT_ROBOTS);

    upsertMeta("property", "og:title", ogTitle);
    upsertMeta("property", "og:description", ogDescription);
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:url", canonical);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", ogTitle);
    upsertMeta("name", "twitter:description", ogDescription);
    upsertMeta("name", "twitter:image", ogImage);

    upsertLink("canonical", canonical);
    upsertLink("alternate", buildCanonical(logicalPath, "zh"), "zh-CN");
    upsertLink("alternate", buildCanonical(logicalPath, "en"), "en");
    upsertLink("alternate", buildCanonical(logicalPath, "zh"), "x-default");

    if (payload?.jsonLd) {
        try {
            injectJsonLd("kn-jsonld-seo", JSON.parse(payload.jsonLd) as unknown);
        } catch {
            /* CMS 里是非法的 JSON 字符串时忽略 */
        }
    } else {
        removeJsonLd("kn-jsonld-seo");
    }
}

/**
 * 应用某条路径的 SEO。配置未缓存时先按内置默认值渲染，并触发一次懒加载，
 * 加载成功后自动重放（不会递归：失败结果不写缓存）。
 */
export function applySeo(path: string, locale: string): void {
    try {
        if (typeof document === "undefined") return;
        const lang = normalizeLocale(locale);
        const logicalPath = toLogicalPath(path);
        const cached = getCachedConfig(locale);

        if (!cached) {
            void loadOpsConfig(locale)
                .then(() => {
                    if (getCachedConfig(locale)) applySeo(path, locale);
                })
                .catch(() => undefined);
        }

        applySeoPayload(cached, path, logicalPath, lang);
    } catch {
        /* head 管理失败不影响页面 */
    }
}

/* ------------------------------------------------------------------ */
/* 结构化数据                                                          */
/* ------------------------------------------------------------------ */

const SEGMENT_LABELS: Record<string, Record<Locale, string>> = {
    templates: { zh: "模板", en: "Templates" },
    plugins: { zh: "插件", en: "Plugins" },
    doc: { zh: "文档", en: "Docs" },
    changelog: { zh: "更新日志", en: "Changelog" },
};

const safeDecode = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

function buildBreadcrumb(logicalPath: string, locale: Locale): unknown {
    const segments = logicalPath.split("/").filter(Boolean);
    const itemListElement: Array<Record<string, unknown>> = [
        { "@type": "ListItem", position: 1, name: "Kotion", item: buildCanonical("/", locale) },
    ];
    let cumulative = "";
    segments.forEach((segment, index) => {
        cumulative += `/${segment}`;
        itemListElement.push({
            "@type": "ListItem",
            position: index + 2,
            name: SEGMENT_LABELS[segment]?.[locale] ?? safeDecode(segment),
            item: buildCanonical(cumulative, locale),
        });
    });
    return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement };
}

const extraJsonLdIds = new Set<string>();

/**
 * 应用结构化数据：非根路径始终注入 BreadcrumbList，并注入调用方传入的额外 payload。
 * 上一次注入但本次不再需要的额外 payload 会被移除，避免路由切换后残留。
 */
export function applyStructuredData(path: string, locale: string, payloads: unknown[] = []): void {
    try {
        if (typeof document === "undefined") return;
        const lang = normalizeLocale(locale);
        const logicalPath = toLogicalPath(path);

        if (logicalPath !== "/") {
            injectJsonLd("kn-jsonld-breadcrumb", buildBreadcrumb(logicalPath, lang));
        } else {
            removeJsonLd("kn-jsonld-breadcrumb");
        }

        const nextIds = new Set<string>();
        payloads.forEach((payload, index) => {
            if (payload === undefined || payload === null) return;
            const id = `kn-jsonld-extra-${index}`;
            nextIds.add(id);
            injectJsonLd(id, payload);
        });
        for (const id of Array.from(extraJsonLdIds)) {
            if (!nextIds.has(id)) removeJsonLd(id);
        }
        extraJsonLdIds.clear();
        for (const id of nextIds) extraJsonLdIds.add(id);
    } catch {
        /* 结构化数据失败不影响页面 */
    }
}
