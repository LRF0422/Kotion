import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams, useTranslation } from "@kn/common";
import type { OpsSeoPayload } from "../../ops/config";
import { applySeo, applyStructuredData, injectJsonLd, removeJsonLd } from "../../ops/seo";
import { LeadForm } from "../../components/LeadForm";
import type { LeadField } from "../../components/LeadForm";
import { Reveal } from "../../components/Reveal";

/** 公开 CMS 端点：按 slug + locale 读取已发布的投放页。 */
const PAGE_ENDPOINT = "/api/knowledge-system/ops/page";
/** 首屏拉取超时：后端不可达时快速降级为空态，避免白屏。 */
const FETCH_TIMEOUT = 3000;

interface CampaignBlock {
    type?: string;
    payload?: Record<string, unknown>;
}

interface CampaignPageData {
    slug?: string;
    title?: string;
    locale?: string;
    blocks?: CampaignBlock[];
    seo?: OpsSeoPayload;
}

type FetchState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: CampaignPageData };

const LEAD_FIELDS: readonly LeadField[] = ["email", "name", "company", "role", "message"];

// ---------- payload 安全取值（后端内容不可信，全部做类型收窄） ----------

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const str = (value: unknown): string => (typeof value === "string" ? value : "");

const records = (value: unknown): Array<Record<string, unknown>> => asArray(value).filter(isRecord);

const strings = (value: unknown): string[] =>
    asArray(value).filter((item): item is string => typeof item === "string");

const parseLeadFields = (value: unknown): LeadField[] => {
    const allowed: readonly string[] = LEAD_FIELDS;
    const fields = strings(value).filter((item): item is LeadField => allowed.includes(item));
    return fields.length > 0 ? fields : ["email"];
};

// ---------- 展示用归一化结构 ----------

interface BulletItem {
    title: string;
    desc: string;
    icon: string;
}

interface FaqItem {
    q: string;
    a: string;
}

interface TestimonialItem {
    quote: string;
    author: string;
    role: string;
}

interface LogoItem {
    name: string;
    image: string;
}

const toBullets = (value: unknown): BulletItem[] =>
    asArray(value)
        .map((item): BulletItem => {
            if (typeof item === "string") return { title: item, desc: "", icon: "" };
            if (isRecord(item)) return { title: str(item.title), desc: str(item.desc), icon: str(item.icon) };
            return { title: "", desc: "", icon: "" };
        })
        .filter((item) => item.title !== "" || item.desc !== "");

const toFaqs = (value: unknown): FaqItem[] =>
    records(value)
        .map((item) => ({ q: str(item.q), a: str(item.a) }))
        .filter((item) => item.q !== "");

const toTestimonials = (value: unknown): TestimonialItem[] =>
    records(value)
        .map((item) => ({ quote: str(item.quote), author: str(item.author), role: str(item.role) }))
        .filter((item) => item.quote !== "");

const toLogos = (value: unknown): LogoItem[] =>
    asArray(value)
        .map((item): LogoItem => {
            if (typeof item === "string") return { name: item, image: "" };
            if (isRecord(item)) return { name: str(item.name), image: str(item.image) };
            return { name: "", image: "" };
        })
        .filter((item) => item.name !== "" || item.image !== "");

// ---------- 小组件 ----------

const CtaLink: React.FC<{ href: string; label: string; className?: string }> = ({ href, label, className }) => {
    const cls = `inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium btn-primary ${className ?? ""}`;
    if (/^https?:\/\//i.test(href)) {
        return (
            <a href={href} target="_blank" rel="noreferrer" className={cls}>
                {label}
            </a>
        );
    }
    if (href.startsWith("/")) {
        return (
            <Link to={href} className={cls}>
                {label}
            </Link>
        );
    }
    return (
        <a href={href} className={cls}>
            {label}
        </a>
    );
};

const CtaSlot: React.FC<{ label: string; href: string; className?: string }> = ({ label, href, className }) =>
    label !== "" && href !== "" ? <CtaLink href={href} label={label} className={className} /> : null;

// ---------- 区块渲染 ----------

const HeroBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const subtitle = str(payload.subtitle);
    const eyebrow = str(payload.eyebrow);
    const image = str(payload.image);
    return (
        <section className="section-padding hero-paper">
            <div className="container-padding text-center">
                {eyebrow !== "" && (
                    <span className="chip inline-flex" style={{ background: "var(--kn-paper-2)", color: "var(--kn-ink-soft)" }}>
                        {eyebrow}
                    </span>
                )}
                {title !== "" && (
                    <h1
                        className="mt-6 font-serif text-4xl md:text-6xl font-semibold tracking-tight"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {title}
                    </h1>
                )}
                {subtitle !== "" && (
                    <p className="mt-4 text-lg max-w-2xl mx-auto" style={{ color: "var(--kn-ink-soft)" }}>
                        {subtitle}
                    </p>
                )}
                <CtaSlot label={str(payload.ctaLabel)} href={str(payload.ctaHref)} className="mt-8" />
                {image !== "" && (
                    <img
                        src={image}
                        alt={title}
                        loading="lazy"
                        className="mt-10 w-full max-w-4xl mx-auto rounded-2xl border"
                        style={{ borderColor: "var(--kn-line)" }}
                    />
                )}
            </div>
        </section>
    );
};

const BulletsBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const items = toBullets(payload.items);
    if (items.length === 0) return null;
    return (
        <section className="section-padding">
            <div className="container-padding">
                {title !== "" && (
                    <h2
                        className="font-serif text-2xl md:text-3xl font-semibold tracking-tight mb-8"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {title}
                    </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {items.map((item, i) => (
                        <Reveal key={`${item.title}-${i}`} delay={i * 30}>
                            <div className="flex items-start gap-3">
                                <span
                                    className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: "var(--scene-ai-500)" }}
                                />
                                <div>
                                    <div className="font-medium" style={{ color: "var(--kn-ink)" }}>
                                        {item.title}
                                    </div>
                                    {item.desc !== "" && (
                                        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                            {item.desc}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

const FeaturesBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const items = toBullets(payload.items);
    if (items.length === 0) return null;
    return (
        <section className="section-padding section-alt">
            <div className="container-padding">
                {title !== "" && (
                    <h2
                        className="font-serif text-2xl md:text-3xl font-semibold tracking-tight mb-8"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {title}
                    </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {items.map((item, i) => (
                        <Reveal key={`${item.title}-${i}`} delay={i * 30} className="h-full">
                            <div className="bento-card h-full">
                                {item.icon !== "" && <div className="text-2xl mb-3">{item.icon}</div>}
                                <h3 className="font-semibold" style={{ color: "var(--kn-ink)" }}>
                                    {item.title}
                                </h3>
                                {item.desc !== "" && (
                                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                        {item.desc}
                                    </p>
                                )}
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

const CtaBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const body = str(payload.body);
    const label = str(payload.ctaLabel);
    const href = str(payload.ctaHref);
    if (title === "" && body === "" && label === "") return null;
    return (
        <section className="section-padding">
            <div className="container-padding">
                <Reveal>
                    <div
                        className="max-w-3xl mx-auto text-center rounded-2xl p-10 md:p-14 border"
                        style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}
                    >
                        {title !== "" && (
                            <h2
                                className="font-serif text-3xl md:text-4xl font-semibold tracking-tight"
                                style={{ color: "var(--kn-ink)" }}
                            >
                                {title}
                            </h2>
                        )}
                        {body !== "" && (
                            <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                {body}
                            </p>
                        )}
                        <CtaSlot label={label} href={href} className="mt-6" />
                    </div>
                </Reveal>
            </div>
        </section>
    );
};

const FaqBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const items = toFaqs(payload.items);
    if (items.length === 0) return null;
    return (
        <section className="section-padding">
            <div className="container-padding">
                {title !== "" && (
                    <h2
                        className="font-serif text-2xl md:text-3xl font-semibold tracking-tight mb-8"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {title}
                    </h2>
                )}
                <div className="max-w-3xl mx-auto space-y-3">
                    {items.map((item, i) => (
                        <Reveal key={`${item.q}-${i}`} delay={i * 30}>
                            <details
                                className="rounded-xl border px-5 py-4"
                                style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}
                            >
                                <summary
                                    className="font-medium cursor-pointer list-none flex items-center justify-between gap-4"
                                    style={{ color: "var(--kn-ink)" }}
                                >
                                    {item.q}
                                </summary>
                                {item.a !== "" && (
                                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                                        {item.a}
                                    </p>
                                )}
                            </details>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

const TestimonialBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const items = toTestimonials(payload.items);
    if (items.length === 0) return null;
    return (
        <section className="section-padding section-alt">
            <div className="container-padding">
                {title !== "" && (
                    <h2
                        className="font-serif text-2xl md:text-3xl font-semibold tracking-tight mb-8"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {title}
                    </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {items.map((item, i) => (
                        <Reveal key={`${item.author}-${i}`} delay={i * 30} className="h-full">
                            <figure className="bento-card h-full flex flex-col">
                                <blockquote className="text-base leading-relaxed flex-1" style={{ color: "var(--kn-ink)" }}>
                                    “{item.quote}”
                                </blockquote>
                                <figcaption className="mt-4 text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                                    <span className="font-medium" style={{ color: "var(--kn-ink)" }}>
                                        {item.author}
                                    </span>
                                    {item.role !== "" && <span> · {item.role}</span>}
                                </figcaption>
                            </figure>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

const LogosBlock: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
    const title = str(payload.title);
    const items = toLogos(payload.items);
    if (items.length === 0) return null;
    return (
        <section className="section-padding">
            <div className="container-padding">
                {title !== "" && (
                    <p className="text-center text-sm mb-6" style={{ color: "var(--kn-ink-soft)" }}>
                        {title}
                    </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
                    {items.map((item, i) =>
                        item.image !== "" ? (
                            <img
                                key={`${item.name}-${i}`}
                                src={item.image}
                                alt={item.name}
                                loading="lazy"
                                className="h-8 w-auto opacity-60"
                            />
                        ) : (
                            <span
                                key={`${item.name}-${i}`}
                                className="font-serif text-lg font-semibold opacity-60"
                                style={{ color: "var(--kn-ink-soft)" }}
                            >
                                {item.name}
                            </span>
                        )
                    )}
                </div>
            </div>
        </section>
    );
};

// ---------- 页面 ----------

export const Campaign: React.FC = () => {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const { slug } = useParams<{ slug: string }>();
    const slugValue = slug ?? "";
    const locale = /^\/en(\/|$)/.test(pathname) ? "en" : "zh";
    const [state, setState] = useState<FetchState>({ status: "loading" });

    useEffect(() => {
        if (slugValue === "") {
            setState({ status: "error" });
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        let cancelled = false;
        setState({ status: "loading" });

        const url = `${PAGE_ENDPOINT}/${encodeURIComponent(slugValue)}?locale=${encodeURIComponent(locale)}`;
        fetch(url, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<CampaignPageData>;
            })
            .then((data) => {
                if (cancelled) return;
                // 未知 slug 时后端返回空体，解析结果不会是合法对象
                if (!data || !Array.isArray(data.blocks)) throw new Error("invalid payload");
                setState({ status: "ready", data });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            })
            .finally(() => {
                window.clearTimeout(timer);
            });

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [slugValue, locale]);

    // 基础 meta：即便内容拉取失败也保证 canonical / title 唯一
    useEffect(() => {
        applySeo(`/c/${slugValue}`, locale);
    }, [slugValue, locale]);

    // 页面自带 SEO payload 时合并结构化数据；卸载时清掉本页专属 id，避免污染其它路由
    useEffect(() => {
        if (state.status !== "ready") return;
        const seo = state.data.seo;
        // 注意：applyStructuredData 会把 payloads 逐条原样写进 JSON-LD，
        // 而 seo 是 OpsSeoPayload（title/description/...）并不是合法的结构化数据，
        // 因此这里只让它注入内置的 BreadcrumbList，真正的 JSON-LD 走下面的 jsonLd 字段。
        applyStructuredData(`/c/${slugValue}`, locale);
        if (seo && typeof seo.jsonLd === "string" && seo.jsonLd.trim() !== "") {
            try {
                injectJsonLd("campaign", JSON.parse(seo.jsonLd));
            } catch {
                /* 非法 JSON-LD 不影响页面渲染 */
            }
        }
        return () => {
            removeJsonLd("campaign");
        };
    }, [state, slugValue, locale]);

    if (state.status === "loading") {
        return (
            <section className="section-padding">
                <div className="container-padding flex items-center justify-center min-h-[50vh]">
                    <div
                        className="w-8 h-8 rounded-full border-2 animate-spin"
                        style={{ borderColor: "var(--kn-line)", borderTopColor: "transparent" }}
                        role="status"
                        aria-label="Loading"
                    />
                </div>
            </section>
        );
    }

    if (state.status === "error") {
        return (
            <section className="section-padding">
                <div className="container-padding text-center">
                    <div
                        className="mx-auto font-serif text-5xl md:text-6xl font-semibold"
                        style={{ color: "var(--kn-ink-soft)", opacity: 0.4 }}
                    >
                        ?
                    </div>
                    <h1
                        className="mt-6 font-serif text-2xl md:text-3xl font-semibold tracking-tight"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {t("ops.campaign-not-found")}
                    </h1>
                    <Link
                        to="/"
                        className="mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium btn-primary"
                    >
                        {t("ops.notfound-cta")}
                    </Link>
                </div>
            </section>
        );
    }

    const blocks = Array.isArray(state.data.blocks) ? state.data.blocks : [];

    return (
        <div>
            {blocks.map((block, index) => {
                const type = typeof block?.type === "string" ? block.type : "";
                const payload = isRecord(block?.payload) ? block.payload : {};
                const key = `${type}-${index}`;
                switch (type) {
                    case "hero":
                        return <HeroBlock key={key} payload={payload} />;
                    case "bullets":
                        return <BulletsBlock key={key} payload={payload} />;
                    case "features":
                        return <FeaturesBlock key={key} payload={payload} />;
                    case "cta":
                        return <CtaBlock key={key} payload={payload} />;
                    case "form":
                        return (
                            <section className="section-padding" key={key}>
                                <div className="container-padding">
                                    <div className="max-w-xl mx-auto">
                                        <LeadForm
                                            formId={`campaign-${slugValue}`}
                                            location="campaign"
                                            fields={parseLeadFields(payload.fields)}
                                        />
                                    </div>
                                </div>
                            </section>
                        );
                    case "faq":
                        return <FaqBlock key={key} payload={payload} />;
                    case "testimonial":
                        return <TestimonialBlock key={key} payload={payload} />;
                    case "logos":
                        return <LogosBlock key={key} payload={payload} />;
                    default:
                        // 未知区块安静跳过，保证新增 block 类型不会让整页崩溃
                        return null;
                }
            })}
        </div>
    );
};
