import { Button, ModeToggle } from "@kn/ui";
import React, { useState, useEffect } from "react";
import { LanguageToggle } from "../../locales/LanguageToggle";
import { Link, useNavigate, useTranslation } from "@kn/common";
import { Github, Menu, X, Download } from "@kn/icon";
import { DESKTOP_RELEASE_URL, GITHUB_URL, LIVE_DEMO_URL } from "../../constants/links";


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
    { labelKey: "header.self-host", href: "/#self-host" },
];

export const Header: React.FC = () => {
    const { t } = useTranslation();
    const navigator = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const linkCls =
        "px-3 py-2 text-sm font-medium rounded-lg transition-colors hover:opacity-80";

    return (
        <nav
            className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "glass border-b" : ""}`}
            style={{ borderColor: scrolled ? "var(--kn-line)" : "transparent" }}
        >
            <div className="container-padding">
                <div className="flex justify-between h-16 items-center">
                    {/* Logo */}
                    <div className="flex items-center">
                        <button
                            type="button"
                            className="flex items-center cursor-pointer group"
                            onClick={() => navigator("/")}
                            aria-label="Go to home"
                        >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                                <span className="text-white font-bold text-sm">K</span>
                            </div>
                            <span className="ml-2 text-xl font-semibold tracking-tight" style={{ color: "var(--kn-ink)" }}>
                                Kotion
                            </span>
                        </button>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="hidden lg:flex items-center gap-0.5" style={{ color: "var(--kn-ink-soft)" }}>
                        {NAV.map((n) =>
                            n.to ? (
                                <Link key={n.labelKey} to={n.to} className={linkCls}>
                                    {t(n.labelKey)}
                                </Link>
                            ) : (
                                <a key={n.labelKey} href={n.href} className={linkCls}>
                                    {t(n.labelKey)}
                                </a>
                            ),
                        )}
                    </div>

                    {/* Right side actions */}
                    <div className="flex items-center gap-2">
                        <div className="hidden lg:flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(GITHUB_URL, "_blank")}
                                aria-label="GitHub"
                            >
                                <Github className="h-4 w-4" />
                            </Button>
                            <ModeToggle />
                            <LanguageToggle />
                            <div className="w-px h-6 mx-1" style={{ background: "var(--kn-line)" }} />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="font-medium"
                                onClick={() => window.open(LIVE_DEMO_URL, "_blank")}
                            >
                                {t("header.live-demo")}
                            </Button>
                            <Button
                                size="sm"
                                className="font-medium rounded-lg"
                                onClick={() => window.open(DESKTOP_RELEASE_URL, "_blank")}
                            >
                                <Download className="mr-1.5 h-4 w-4" />
                                {t("header.download-desktop")}
                            </Button>
                        </div>

                        {/* Mobile menu items */}
                        <div className="lg:hidden flex items-center gap-2">
                            <ModeToggle />
                            <LanguageToggle />
                            <button
                                type="button"
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: "var(--kn-ink-soft)" }}
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                aria-expanded={mobileMenuOpen}
                            >
                                <span className="sr-only">Open main menu</span>
                                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            <div
                className={`lg:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0"}`}
            >
                <div
                    className="glass border-t px-4 py-4 space-y-1"
                    style={{ borderColor: "var(--kn-line)" }}
                >
                    {NAV.map((n) => {
                        const cls =
                            "block px-4 py-3 rounded-lg text-base font-medium transition-colors hover:opacity-80";
                        return n.to ? (
                            <Link
                                key={n.labelKey}
                                to={n.to}
                                className={cls}
                                style={{ color: "var(--kn-ink)" }}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {t(n.labelKey)}
                            </Link>
                        ) : (
                            <a
                                key={n.labelKey}
                                href={n.href}
                                className={cls}
                                style={{ color: "var(--kn-ink)" }}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {t(n.labelKey)}
                            </a>
                        );
                    })}

                    <div
                        className="pt-4 mt-4 border-t flex flex-col gap-3"
                        style={{ borderColor: "var(--kn-line)" }}
                    >
                        <Button
                            variant="outline"
                            className="w-full rounded-lg"
                            onClick={() => window.open(LIVE_DEMO_URL, "_blank")}
                        >
                            {t("header.live-demo")}
                        </Button>
                        <Button
                            className="w-full rounded-lg"
                            onClick={() => window.open(DESKTOP_RELEASE_URL, "_blank")}
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
