import React from "react";
import { Outlet } from "@kn/common";
import { Header } from "../Header";
import { ScrollArea } from "@kn/ui";


export const Layout: React.FC = () => {
    return <div>
        <header>
            <Header />
        </header>
        <ScrollArea className="h-[calc(100vh-65px)]">
            <main>
                <Outlet />
            </main>
            <footer className="border-t border-gray-200 dark:border-gray-700 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
                        <div className="col-span-2">
                            <div className="flex items-center mb-4">
                                <img className="h-8 w-auto" src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/db52835a91294c1995afd744e9c2df91~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738781&x-signature=%2FxikC6RAqb%2FUZ8aGUsDWvEvIUxc%3D" alt="Notion Logo" />
                                <span className="ml-2 text-xl font-semibold text-notion">Notion</span>
                            </div>
                            <p className="text-notion-light mb-4">All-in-one workspace for your notes, tasks, wikis, and databases.</p>
                            <div className="flex space-x-4">
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-twitter" aria-hidden="true"></i>
                                </a>
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-facebook" aria-hidden="true"></i>
                                </a>
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-instagram" aria-hidden="true"></i>
                                </a>
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-linkedin" aria-hidden="true"></i>
                                </a>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-notion font-medium mb-4">Product</h3>
                            <ul className="space-y-2">
                                <li><a href="#" className="text-notion-light hover:text-notion">Features</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Templates</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Pricing</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Integrations</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Enterprise</a></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-notion font-medium mb-4">Resources</h3>
                            <ul className="space-y-2">
                                <li><a href="#" className="text-notion-light hover:text-notion">Documentation</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Guides</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">API Reference</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Community</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Blog</a></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-notion font-medium mb-4">Company</h3>
                            <ul className="space-y-2">
                                <li><a href="#" className="text-notion-light hover:text-notion">About</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Careers</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Contact</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Press</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Legal</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
                        <p className="text-notion-light text-sm mb-4 md:mb-0">© 2025 Kotion. All rights reserved.</p>
                        <div className="flex space-x-6">
                            <a href="#" className="text-notion-light hover:text-notion text-sm">Terms of Service</a>
                            <a href="#" className="text-notion-light hover:text-notion text-sm">Privacy Policy</a>
                            <a href="#" className="text-notion-light hover:text-notion text-sm">Cookie Policy</a>
                        </div>
                    </div>
                </div>
            </footer>
        </ScrollArea>
    </div>
}