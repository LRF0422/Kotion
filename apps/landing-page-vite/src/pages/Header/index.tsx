import { Button, ModeToggle } from "@kn/ui";
import React, { useState, useEffect } from "react";
import { LanguageToggle } from "../../locales/LanguageToggle";
import { Link, useNavigate, useTranslation } from "@kn/common";
import { Github, Menu, X, Download } from "@kn/icon";
import { DESKTOP_RELEASE_URL, GITHUB_URL, LIVE_DEMO_URL } from "../../constants/links";
import { openExternal } from "../../ops/analytics";
import { Logo } from "../../components/Logo";

interface NavItem {
    labelKey: string;
    href?: string;
    to?: string;
}

const NAV: NavItem[] = [
    { labelKey: "header.feature", href: "/#features" },
    { labelKey: "header.workflow", href: "/#workflows" },
    { labelKey: "header.plugins", to: "/plugins" },
    { labelKey: "header.template-market", to: "/templates" },
    { labelKey: "header.doc", to: "/doc" },
    { labelKey: "header.changelog", to: "/changelog" },
    { labelKey: "header.self-host", href: "/#self-host" },
];

export const Header: React.FC = () => {
    const { t } = useTranslation();
    const navigator = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 8);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const desktopLinkCls = "nav-link rounded px-3 py-2 text-sm font-medium";

    return (
        <nav
            className={"sticky top-0 z-50 border-b transition-colors duration-200 " + (scrolled ? "glass" : "")}
            style={{ borderColor: scrolled ? "var(--kn-line)" : "transparent" }}
        >
            <div className="container-padding">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo */}
                    <button
                        type="button"
                        className="group flex cursor-pointer items-center"
                        onClick={() => navigator("/")}
                        aria-label="Go to home"
                    >
                        <Logo />
                    </button>

                    {/* Desktop navigation */}
                    <div className="hidden items-center gap-0.5 lg:flex">
                        {NAV.map((n) =>
                            n.to ? (
                                <Link key={n.labelKey} to={n.to} className={desktopLinkCls}>
                                    {t(n.labelKey)}
                                </Link>
                            ) : (
                                <a key={n.labelKey} href={n.href} className={desktopLinkCls}>
                                    {t(n.labelKey)}
                                </a>
                            ),
                        )}
                    </div>

                    {/* Right side actions */}
                    <div className="flex items-center gap-2">
                        <div className="hidden items-center gap-2 lg:flex">
                            <button
                                type="button"
                                className="icon-sq"
                                onClick={() => openExternal(GITHUB_URL, { location: "header", target: "github", medium: "social" })}
                                aria-label="GitHub"
                            >
                                <Github className="h-4 w-4" />
                            </button>
                            <ModeToggle />
                            <LanguageToggle />
                            <span className="mx-1 h-5 w-px" style={{ background: "var(--kn-line)" }} />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-md font-medium"
                                onClick={() => openExternal(LIVE_DEMO_URL, { location: "header", target: "demo", medium: "demo" })}
                            >
                                {t("header.live-demo")}
                            </Button>
                            <Button
                                size="sm"
                                className="rounded-md font-medium"
                                onClick={() => openExternal(DESKTOP_RELEASE_URL, { location: "header", target: "desktop", medium: "download" })}
                            >
                                <Download className="mr-1.5 h-4 w-4" />
                                {t("header.download-desktop")}
                            </Button>
                        </div>

                        {/* Mobile controls */}
                        <div className="flex items-center gap-1.5 lg:hidden">
                            <ModeToggle />
                            <LanguageToggle />
                            <button
                                type="button"
                                className="icon-sq"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                aria-expanded={mobileMenuOpen}
                            >
                                <span className="sr-only">Open main menu</span>
                                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            <div
                className={
                    "overflow-hidden transition-all duration-300 lg:hidden " +
                    (mobileMenuOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0")
                }
            >
                <div
                    className="glass space-y-1 border-t px-5 py-4"
                    style={{ borderColor: "var(--kn-line)" }}
                >
                    {NAV.map((n) => {
                        const cls = "nav-link block rounded px-3 py-3 text-base font-medium";
                        return n.to ? (
                            <Link
                                key={n.labelKey}
                                to={n.to}
                                className={cls}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {t(n.labelKey)}
                            </Link>
                        ) : (
                            <a
                                key={n.labelKey}
                                href={n.href}
                                className={cls}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {t(n.labelKey)}
                            </a>
                        );
                    })}

                    <div
                        className="mt-4 flex flex-col gap-3 border-t pt-4"
                        style={{ borderColor: "var(--kn-line)" }}
                    >
                        <Button
                            variant="outline"
                            className="w-full rounded-md"
                            onClick={() => openExternal(LIVE_DEMO_URL, { location: "header-mobile", target: "demo", medium: "demo" })}
                        >
                            {t("header.live-demo")}
                        </Button>
                        <Button
                            className="w-full rounded-md"
                            onClick={() => openExternal(DESKTOP_RELEASE_URL, { location: "header-mobile", target: "desktop", medium: "download" })}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {t("header.download-desktop")}
                        </Button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
