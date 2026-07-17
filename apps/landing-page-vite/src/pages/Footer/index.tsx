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
            { labelKey: "footer.link-roadmap", href: `${GITHUB_URL}/projects` },
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
            { labelKey: "footer.link-privacy", href: `${GITHUB_URL}/blob/main/PRIVACY.md` },
            { labelKey: "footer.link-terms", href: `${GITHUB_URL}/blob/main/TERMS.md` },
        ],
    },
];

export const Footer: React.FC = () => {
    const { t } = useTranslation();
    return (
        <footer className="border-t" style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}>
            <div className="container-padding py-16">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12">
                    {/* Brand column */}
                    <div className="col-span-2">
                        <div className="flex items-center mb-5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                                <span className="text-white font-bold text-sm">K</span>
                            </div>
                            <span className="ml-2 text-xl font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                                Kotion
                            </span>
                        </div>
                        <p className="text-sm max-w-xs mb-6" style={{ color: "var(--kn-ink-soft)" }}>
                            {t("footer.strapline")}
                        </p>
                        <div className="flex items-center gap-3">
                            <a
                                href={GITHUB_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="GitHub"
                                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all card-lift"
                                style={{ color: "var(--kn-ink-soft)" }}
                            >
                                <Github className="h-4 w-4" />
                            </a>
                            <a
                                href={ZHIHU_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Zhihu"
                                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all card-lift"
                                style={{ color: "var(--kn-ink-soft)" }}
                            >
                                <MessageCircle className="h-4 w-4" />
                            </a>
                        </div>
                    </div>

                    {/* Column links */}
                    {COLUMNS.map((col) => (
                        <div key={col.titleKey}>
                            <h3
                                className="text-xs font-semibold mb-4 uppercase tracking-wider"
                                style={{ color: "var(--kn-ink)" }}
                            >
                                {t(col.titleKey)}
                            </h3>
                            <ul className="space-y-3">
                                {col.links.map((l) => (
                                    <li key={l.labelKey}>
                                        {l.to ? (
                                            <Link
                                                to={l.to}
                                                className="text-sm hover:opacity-80 transition-opacity"
                                                style={{ color: "var(--kn-ink-soft)" }}
                                            >
                                                {t(l.labelKey)}
                                            </Link>
                                        ) : (
                                            <a
                                                href={l.href}
                                                target={l.href?.startsWith("http") ? "_blank" : undefined}
                                                rel={l.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                                                className="text-sm hover:opacity-80 transition-opacity"
                                                style={{ color: "var(--kn-ink-soft)" }}
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
                <div className="mt-12 pt-8 border-t" style={{ borderColor: "var(--kn-line)" }}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <p className="text-sm" style={{ color: "var(--kn-ink-soft)" }}>
                            © {new Date().getFullYear()} Kotion · {t("footer.copyright")}
                        </p>
                        <p className="text-sm inline-flex items-center gap-1.5" style={{ color: "var(--kn-ink-soft)" }}>
                            {t("footer.made-with")}
                            <Heart className="h-3.5 w-3.5" style={{ color: "var(--scene-ai-500)" }} />
                            · {t("footer.mit-line")}
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
};
