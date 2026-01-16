import React from "react";
import { Github, Twitter, Facebook, Instagram, Linkedin } from "@kn/icon";

export const Footer: React.FC = () => {
    return <footer className="border-t border-border bg-muted/20 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
                <div className="lg:col-span-2">
                    <div className="flex items-center mb-4">
                        <span className="ml-2 text-xl font-semibold text-notion">Kotion</span>
                    </div>
                    <p className="text-notion-light mb-6 max-w-xs">All-in-one workspace for your notes, tasks, wikis, and databases.</p>
                    <div className="flex space-x-4">
                        <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200">
                            <Twitter className="h-5 w-5" />
                        </a>
                        <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200">
                            <Facebook className="h-5 w-5" />
                        </a>
                        <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200">
                            <Instagram className="h-5 w-5" />
                        </a>
                        <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200">
                            <Linkedin className="h-5 w-5" />
                        </a>
                        <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200">
                            <Github className="h-5 w-5" />
                        </a>
                    </div>
                </div>

                <div>
                    <h3 className="text-notion font-medium mb-4">Product</h3>
                    <ul className="space-y-3">
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Features</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Templates</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Pricing</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Integrations</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Enterprise</a></li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-notion font-medium mb-4">Resources</h3>
                    <ul className="space-y-3">
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Documentation</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Guides</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">API Reference</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Community</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Blog</a></li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-notion font-medium mb-4">Company</h3>
                    <ul className="space-y-3">
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">About</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Careers</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Contact</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Press</a></li>
                        <li><a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 block">Legal</a></li>
                    </ul>
                </div>
            </div>

            <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
                <p className="text-notion-light text-sm mb-4 md:mb-0">© 2025 Kotion. All rights reserved.</p>
                <div className="flex flex-wrap justify-center gap-6">
                    <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 text-sm">Terms of Service</a>
                    <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 text-sm">Privacy Policy</a>
                    <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 text-sm">Cookie Policy</a>
                    <a href="#" className="text-notion-light hover:text-primary transition-colors duration-200 text-sm">Status</a>
                </div>
            </div>
        </div>
    </footer>
}