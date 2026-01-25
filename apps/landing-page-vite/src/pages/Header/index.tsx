import { Button, ModeToggle } from "@kn/ui";
import React, { useState, useEffect } from "react";
import { LanguageToggle } from "../../locales/LanguageToggle";
import { Link, useNavigate, useTranslation } from "@kn/common";
import { Github, Menu, X } from "@kn/icon";


export const Header: React.FC = () => {

    const { t } = useTranslation()
    const navigator = useNavigate()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'glass shadow-sm border-b border-gray-200/50 dark:border-gray-800/50' : 'bg-transparent'}`}>
        <div className="container-padding">
            <div className="flex justify-between h-16 items-center">
                {/* Logo */}
                <div className="flex items-center">
                    <div
                        className="flex items-center cursor-pointer group"
                        onClick={() => navigator("/")}
                        role="button"
                        aria-label="Go to home"
                    >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">K</span>
                        </div>
                        <span className="ml-2 text-xl font-bold text-notion group-hover:text-primary transition-colors">Kotion</span>
                    </div>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center space-x-1">
                    <a href="#features" className="px-4 py-2 text-sm font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200">
                        {t("header.feature")}
                    </a>
                    <a href="#templates" className="px-4 py-2 text-sm font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200">
                        {t("header.template")}
                    </a>
                    <a href="#pricing" className="px-4 py-2 text-sm font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200">
                        {t("header.price")}
                    </a>
                    <Link to="/doc" className="px-4 py-2 text-sm font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200">
                        {t("header.doc")}
                    </Link>
                    <Link to="/templates" className="px-4 py-2 text-sm font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200">
                        {t("header.template-market")}
                    </Link>
                    <Link to="/plugins" className="px-4 py-2 text-sm font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200">
                        {t("header.plugins")}
                    </Link>
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open("https://github.com/LRF0422/knowledge-repo.git", "_blank")}
                        >
                            <Github className="h-4 w-4" />
                        </Button>
                        <ModeToggle />
                        <LanguageToggle />
                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
                        <Button variant="ghost" size="sm" className="font-medium">
                            {t("header.login")}
                        </Button>
                        <Button size="sm" className="font-medium rounded-xl">
                            {t("header.get-for-free")}
                        </Button>
                    </div>

                    {/* Mobile menu items */}
                    <div className="md:hidden flex items-center gap-2">
                        <ModeToggle />
                        <LanguageToggle />
                        <button
                            type="button"
                            className="p-2 rounded-lg text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-expanded={mobileMenuOpen}
                        >
                            <span className="sr-only">Open main menu</span>
                            {mobileMenuOpen ? (
                                <X className="h-6 w-6" />
                            ) : (
                                <Menu className="h-6 w-6" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* Mobile menu */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="glass border-t border-gray-200/50 dark:border-gray-800/50 px-4 py-4 space-y-1">
                <a
                    href="#features"
                    className="block px-4 py-3 rounded-xl text-base font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    {t("header.feature")}
                </a>
                <a
                    href="#templates"
                    className="block px-4 py-3 rounded-xl text-base font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    {t("header.template")}
                </a>
                <a
                    href="#pricing"
                    className="block px-4 py-3 rounded-xl text-base font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    {t("header.price")}
                </a>
                <Link
                    to="/doc"
                    className="block px-4 py-3 rounded-xl text-base font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    {t("header.doc")}
                </Link>
                <Link
                    to="/templates"
                    className="block px-4 py-3 rounded-xl text-base font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    {t("header.template-market")}
                </Link>
                <Link
                    to="/plugins"
                    className="block px-4 py-3 rounded-xl text-base font-medium text-notion-light hover:text-notion hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    {t("header.plugins")}
                </Link>

                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-3">
                    <Button variant="outline" className="w-full rounded-xl">{t("header.login")}</Button>
                    <Button className="w-full rounded-xl">{t("header.get-for-free")}</Button>
                </div>
            </div>
        </div>
    </nav>
}