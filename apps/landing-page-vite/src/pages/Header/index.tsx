import { Button, ModeToggle } from "@kn/ui";
import React from "react";
import { LanguageToggle } from "../../locales/LanguageToggle";
import { Link, useNavigate, useTranslation } from "@kn/common";


export const Header: React.FC = () => {

    const { t } = useTranslation()
    const navigator = useNavigate()

    return <nav className="sticky bg-popover top-0 z-50 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
                <div className="flex items-center">
                    <div className="flex-shrink-0 flex items-center" onClick={() => navigator("/")}>
                        {/* <img className="h-8 w-auto" src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/db52835a91294c1995afd744e9c2df91~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738781&x-signature=%2FxikC6RAqb%2FUZ8aGUsDWvEvIUxc%3D" alt="Notion Logo" /> */}
                        <span className="ml-2 text-xl font-semibold text-notion">Kotion</span>
                    </div>
                    <div className="hidden md:ml-6 md:flex md:space-x-8 ">
                        <a href="#features" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">{t("header.feature")}</a>
                        <a href="#templates" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">{t("header.template")}</a>
                        <a href="#testimonials" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Testimonials</a>
                        <a href="#pricing" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">{t("header.price")}</a>
                        <Link to="/templates" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Templates</Link>
                        <a href="#" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">{t("header.plugins")}</a>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <ModeToggle />
                    <LanguageToggle />
                    <div className="ml-3 flex items-center gap-2 md:ml-6">
                        <Button size="sm">Log in</Button>
                        <Button size="sm" variant="outline">Sign up</Button>
                    </div>
                </div>
            </div>
        </div>

        <div className="md:hidden" id="mobile-menu">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                <a href="#features" className="block px-3 py-2 rounded-md text-base font-medium">Features</a>
                <a href="#templates" className="block px-3 py-2 rounded-md text-base font-medium">Templates</a>
                <a href="#testimonials" className="block px-3 py-2 rounded-md text-base font-medium">Testimonials</a>
                <a href="#pricing" className="block px-3 py-2 rounded-md text-base font-medium">Pricing</a>
            </div>
        </div>
    </nav>
}