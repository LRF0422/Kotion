import React from "react";
import { Github, Twitter, Linkedin } from "@kn/icon";

export const Footer: React.FC = () => {
    return <footer className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="container-padding py-16">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 lg:gap-12">
                {/* Brand Column */}
                <div className="col-span-2">
                    <div className="flex items-center mb-6">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">K</span>
                        </div>
                        <span className="ml-2 text-xl font-bold text-notion">Kotion</span>
                    </div>
                    <p className="text-notion-light text-sm mb-6 max-w-xs">
                        The all-in-one workspace for your notes, tasks, wikis, and databases.
                    </p>
                    <div className="flex items-center gap-4">
                        <a
                            href="https://twitter.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-notion-light hover:text-notion hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                        >
                            <Twitter className="h-4 w-4" />
                        </a>
                        <a
                            href="https://github.com/LRF0422/knowledge-repo.git"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-notion-light hover:text-notion hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                        >
                            <Github className="h-4 w-4" />
                        </a>
                        <a
                            href="https://linkedin.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-notion-light hover:text-notion hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                        >
                            <Linkedin className="h-4 w-4" />
                        </a>
                    </div>
                </div>

                {/* Product Column */}
                <div>
                    <h3 className="text-sm font-semibold text-notion mb-4 uppercase tracking-wider">Product</h3>
                    <ul className="space-y-3">
                        <li><a href="#features" className="text-sm text-notion-light hover:text-notion transition-colors">Features</a></li>
                        <li><a href="/templates" className="text-sm text-notion-light hover:text-notion transition-colors">Templates</a></li>
                        <li><a href="#pricing" className="text-sm text-notion-light hover:text-notion transition-colors">Pricing</a></li>
                        <li><a href="/plugins" className="text-sm text-notion-light hover:text-notion transition-colors">Plugins</a></li>
                    </ul>
                </div>

                {/* Resources Column */}
                <div>
                    <h3 className="text-sm font-semibold text-notion mb-4 uppercase tracking-wider">Resources</h3>
                    <ul className="space-y-3">
                        <li><a href="/doc" className="text-sm text-notion-light hover:text-notion transition-colors">Documentation</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Guides</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">API Reference</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Community</a></li>
                    </ul>
                </div>

                {/* Company Column */}
                <div>
                    <h3 className="text-sm font-semibold text-notion mb-4 uppercase tracking-wider">Company</h3>
                    <ul className="space-y-3">
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">About</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Blog</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Careers</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Contact</a></li>
                    </ul>
                </div>

                {/* Legal Column */}
                <div>
                    <h3 className="text-sm font-semibold text-notion mb-4 uppercase tracking-wider">Legal</h3>
                    <ul className="space-y-3">
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Privacy</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Terms</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Cookie Policy</a></li>
                        <li><a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">Status</a></li>
                    </ul>
                </div>
            </div>

            {/* Bottom Section */}
            <div className="border-t border-gray-100 dark:border-gray-800 mt-12 pt-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-notion-light">
                        © {new Date().getFullYear()} Kotion. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">
                            Privacy Policy
                        </a>
                        <a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">
                            Terms of Service
                        </a>
                        <a href="#" className="text-sm text-notion-light hover:text-notion transition-colors">
                            Cookies
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </footer>
}