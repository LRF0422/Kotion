import { Button, ModeToggle } from "@kn/ui";
import React, { useState } from "react";
import { LanguageToggle } from "../../locales/LanguageToggle";
import { Link, useNavigate, useTranslation } from "@kn/common";


export const Header: React.FC = () => {

    const { t } = useTranslation()
    const navigator = useNavigate()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return <nav className="sticky bg-popover top-0 z-50 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
                <div className="flex items-center">
                    <div className="flex-shrink-0 flex items-center cursor-pointer" onClick={() => navigator("/")} role="button" aria-label="Go to home">
                        <span className="ml-2 text-xl font-semibold text-notion">Kotion</span>
                    </div>
                    <div className="hidden md:ml-6 md:flex md:space-x-8">
                        <a href="#features" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">{t("header.feature")}</a>
                        <a href="#templates" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">{t("header.template")}</a>
                        <a href="#testimonials" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">Testimonials</a>
                        <a href="#pricing" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">{t("header.price")}</a>
                        <Link to="/doc" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">{t("header.doc")}</Link>
                        <Link to="/templates" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">{t("header.template-market")}</Link>
                        <Link to="/plugins" className="text-notion-light hover:text-primary transition-colors duration-200 inline-flex items-center px-1 pt-1 text-sm font-medium">{t("header.plugins")}</Link>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ModeToggle />
                    <LanguageToggle />
                    <div className="hidden md:flex items-center gap-2">
                        <Button variant="ghost" size="sm">{t("header.login")}</Button>
                        <Button size="sm">{t("header.get-for-free")}</Button>
                    </div>
                    <div className="md:hidden flex items-center">
                        <button
                            type="button"
                            className="inline-flex items-center justify-center p-2 rounded-md text-notion-light hover:text-primary hover:bg-accent focus:outline-none"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-expanded="false"
                        >
                            <span className="sr-only">Open main menu</span>
                            <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* Mobile menu, show/hide based on menu state */}
        {mobileMenuOpen && (
            <div className="md:hidden" id="mobile-menu">
                <div className="pt-2 pb-3 space-y-1 px-2">
                    <a
                        href="#features"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        {t("header.feature")}
                    </a>
                    <a
                        href="#templates"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        {t("header.template")}
                    </a>
                    <a
                        href="#testimonials"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        Testimonials
                    </a>
                    <a
                        href="#pricing"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        {t("header.price")}
                    </a>
                    <Link
                        to="/doc"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        {t("header.doc")}
                    </Link>
                    <Link
                        to="/templates"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        {t("header.template-market")}
                    </Link>
                    <Link
                        to="/plugins"
                        className="block px-3 py-2 rounded-md text-base font-medium text-notion-light hover:text-primary hover:bg-accent transition-colors duration-200"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        {t("header.plugins")}
                    </Link>
                    <div className="pt-4 pb-3 border-t border-border flex flex-col gap-2">
                        <Button variant="ghost" className="w-full">{t("header.login")}</Button>
                        <Button className="w-full">{t("header.get-for-free")}</Button>
                    </div>
                </div>
            </div>
        )}
    </nav>
}