import React from "react";
import { Link, useTranslation } from "@kn/common";
import { Github, MessageCircle, Heart } from "@kn/icon";
import {
    GITHUB_URL,
    GITHUB_ISSUES_URL,
    GITHUB_DISCUSSIONS_URL,
    GITHUB_CONTRIBUTE_URL,
    GITHUB_LICENSE_URL,
    LIVE_DEMO_URL,
    DESKTOP_RELEASE_URL,
    ZHIHU_URL,
    DOCS_INSTALL,
    DOCS_PLUGIN_DEV,
} from "../../constants/links";
import { buildTrackedUrl, track } from "../../ops/analytics";
import { SubscribeForm } from "../../components/SubscribeForm";
import { Logo } from "../../components/Logo";

interface FooterLink {
    labelKey: string;
    to?: string;
    href?: string;
}

interface FooterColumn {
    titleKey: string;
    links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
    {
        titleKey: "footer.col-product",
        links: [
            { labelKey: "footer.link-web", href: LIVE_DEMO_URL },
            { labelKey: "footer.link-desktop", href: DESKTOP_RELEASE_URL },
            { labelKey: "footer.link-selfhost", to: DOCS_INSTALL },
            { labelKey: "footer.link-roadmap", href: GITHUB_URL + "/projects" },
        ],
    },
    {
        titleKey: "footer.col-resources",
        links: [
            { labelKey: "footer.link-docs", to: "/doc" },
            { labelKey: "footer.link-quickstart", to: DOCS_INSTALL },
            { labelKey: "footer.link-plugin-dev", to: DOCS_PLUGIN_DEV },
            { labelKey: "footer.link-templates", to: "/templates" },
        ],
    },
    {
        titleKey: "footer.col-community",
        links: [
            { labelKey: "footer.link-github", href: GITHUB_URL },
            { labelKey: "footer.link-issues", href: GITHUB_ISSUES_URL },
            { labelKey: "footer.link-discussions", href: GITHUB_DISCUSSIONS_URL },
            { labelKey: "footer.link-contribute", href: GITHUB_CONTRIBUTE_URL },
        ],
    },
    {
        titleKey: "footer.col-legal",
        links: [
            { labelKey: "footer.link-license", href: GITHUB_LICENSE_URL },
            { labelKey: "footer.link-privacy", href: GITHUB_URL + "/blob/main/PRIVACY.md" },
            { labelKey: "footer.link-terms", href: GITHUB_URL + "/blob/main/TERMS.md" },
        ],
    },
];

export const Footer: React.FC = () => {
    const { t } = useTranslation();
    return (
        <footer className="border-t" style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}>
            <div className="container-padding py-16">
                <div className="grid grid-cols-2 gap-10 md:grid-cols-6 lg:gap-12">
                    {/* Brand column */}
                    <div className="col-span-2">
                        <Logo />
                        <p className="mb-6 mt-4 max-w-xs text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                            {t("footer.strapline")}
                        </p>
                        <div className="flex items-center gap-2.5">
                            <a
                                href={buildTrackedUrl(GITHUB_URL, { utm_source: "kotion-landing", utm_medium: "social", utm_campaign: "footer", utm_content: "github" })}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="GitHub"
                                onClick={() => track("cta_click", { location: "footer-social", target: "github" })}
                                className="icon-sq"
                            >
                                <Github className="h-4 w-4" />
                            </a>
                            <a
                                href={ZHIHU_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Zhihu"
                                onClick={() => track("cta_click", { location: "footer-social", target: "zhihu" })}
                                className="icon-sq"
                            >
                                <MessageCircle className="h-4 w-4" />
                            </a>
                        </div>
                        <SubscribeForm className="mt-6" location="footer" />
                    </div>

                    {/* Column links */}
                    {COLUMNS.map((col) => (
                        <div key={col.titleKey}>
                            <h3
                                className="kicker mb-4"
                                style={{ color: "var(--kn-ink)" }}
                            >
                                {t(col.titleKey)}
                            </h3>
                            <ul className="space-y-3">
                                {col.links.map((l) => (
                                    <li key={l.labelKey}>
                                        {l.to ? (
                                            <Link to={l.to} className="footer-link text-sm">
                                                {t(l.labelKey)}
                                            </Link>
                                        ) : (
                                            <a
                                                href={l.href?.startsWith("http")
                                                    ? buildTrackedUrl(l.href, {
                                                        utm_source: "kotion-landing",
                                                        utm_medium: "footer",
                                                        utm_campaign: "site",
                                                        utm_content: l.labelKey,
                                                    })
                                                    : l.href}
                                                target={l.href?.startsWith("http") ? "_blank" : undefined}
                                                rel={l.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                                                onClick={() => track("cta_click", { location: "footer", target: l.labelKey, href: l.href })}
                                                className="footer-link text-sm"
                                            >
                                                {t(l.labelKey)}
                                            </a>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom bar */}
                <div className="mt-14 flex flex-col gap-4 border-t pt-8 md:flex-row md:items-center md:justify-between" style={{ borderColor: "var(--kn-line)" }}>
                    <p className="font-mono text-[11px] tracking-wide" style={{ color: "var(--kn-ink-mute)" }}>
                        © {new Date().getFullYear()} KOTION · {t("footer.copyright")}
                    </p>
                    <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                        {t("footer.made-with")}
                        <Heart className="h-3.5 w-3.5" style={{ color: "var(--kn-accent)" }} />
                        · {t("footer.mit-line")}
                    </p>
                </div>
            </div>
        </footer>
    );
};
