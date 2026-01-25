import React from "react";
import { Button, Rate } from "@kn/ui"
import { ArrowRight, FaCheck, FaDatabase, FaLink, FaPlug, FaTasks, FaTimes, FaUsers, FileText, Github, Sparkles, Zap, Shield, Globe } from "@kn/icon";
import { Link, useTranslation } from "@kn/common";

export const Home: React.FC = () => {

    const { t } = useTranslation()

    return <>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-warm">
            <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
            <div className="container-padding py-20 md:py-32">
                <div className="max-w-4xl mx-auto text-center fade-in-up">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 mb-8">
                        <Sparkles className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-medium text-notion">{t("home.hero-badge")}</span>
                    </div>

                    {/* Main heading */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-notion mb-6 tracking-tight">
                        {t("home.hero-title-1")}
                        <br />
                        <span className="gradient-text">{t("home.hero-title-2")}</span>
                    </h1>

                    <p className="text-lg md:text-xl text-notion-light mb-10 max-w-2xl mx-auto">
                        {t("home.desc")}
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 stagger-children">
                        <Button
                            size="lg"
                            className="w-full sm:w-auto px-8 py-6 text-base rounded-xl"
                            onClick={() => window.open('https://kotion.top:888', '_blank')}
                        >
                            {t("home.get-started")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            className="w-full sm:w-auto px-8 py-6 text-base rounded-xl"
                            onClick={() => window.open("https://github.com/LRF0422/knowledge-repo.git", "_blank")}
                        >
                            <Github className="mr-2 h-4 w-4" />
                            {t("home.star-github")}
                        </Button>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 mt-16 pt-8 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-center">
                            <div className="text-3xl md:text-4xl font-bold text-notion">10K+</div>
                            <div className="text-sm text-notion-light">{t("home.stat-users")}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-3xl md:text-4xl font-bold text-notion">50+</div>
                            <div className="text-sm text-notion-light">{t("home.stat-plugins")}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-3xl md:text-4xl font-bold text-notion">99.9%</div>
                            <div className="text-sm text-notion-light">{t("home.stat-uptime")}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hero Image */}
            <div className="container-padding pb-20">
                <div className="max-w-6xl mx-auto">
                    <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
                        {/* Floating Decorations */}
                        <div className="absolute top-6 right-6 w-16 h-16 bg-gradient-to-br from-yellow-200 to-orange-300 rounded-2xl rotate-12 opacity-60 float-animation"></div>
                        <div className="absolute top-20 left-8 w-10 h-10 bg-gradient-to-br from-blue-200 to-indigo-300 rounded-xl -rotate-12 opacity-50 float-animation" style={{ animationDelay: '0.5s' }}></div>
                        <div className="absolute bottom-16 right-20 w-8 h-8 bg-gradient-to-br from-green-200 to-teal-300 rounded-lg rotate-6 opacity-50 float-animation" style={{ animationDelay: '1s' }}></div>
                        <div className="absolute bottom-32 left-16 w-6 h-6 bg-gradient-to-br from-pink-200 to-purple-300 rounded-md -rotate-6 opacity-60 float-animation" style={{ animationDelay: '1.5s' }}></div>

                        <div className="p-8 md:p-12 flex items-center justify-center min-h-[500px]">
                            <div className="grid grid-cols-12 gap-4 w-full max-w-4xl">
                                {/* Left Sidebar */}
                                <div className="col-span-3 space-y-3">
                                    {/* Workspace Selector */}
                                    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg border border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">K</div>
                                            <div className="flex-1">
                                                <div className="text-xs font-medium text-gray-800 dark:text-gray-200">Kotion Space</div>
                                                <div className="text-[10px] text-gray-400">Pro Plan</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs">
                                                <span>📄</span> Quick Notes
                                            </div>
                                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs">
                                                <span>📁</span> Projects
                                            </div>
                                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs">
                                                <span>📅</span> Calendar
                                            </div>
                                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs">
                                                <span>⚙️</span> Settings
                                            </div>
                                        </div>
                                    </div>
                                    {/* Team Members */}
                                    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg border border-gray-100 dark:border-gray-700">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Team</div>
                                        <div className="flex -space-x-2">
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-[10px] font-bold">A</div>
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-[10px] font-bold">B</div>
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-[10px] font-bold">C</div>
                                            <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 border-2 border-white dark:border-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 text-[10px]">+2</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Main Content Area */}
                                <div className="col-span-9 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-xl border border-gray-100 dark:border-gray-700">
                                    {/* Window Controls & Title */}
                                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer"></div>
                                            <div className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500 cursor-pointer"></div>
                                            <div className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 cursor-pointer"></div>
                                        </div>
                                        <div className="flex-1 flex items-center gap-2">
                                            <span className="text-lg">📝</span>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Q4 Product Roadmap</span>
                                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] rounded-full">Published</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                            </button>
                                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Document Content */}
                                    <div className="space-y-4">
                                        {/* Title */}
                                        <div className="h-8 bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-lg w-3/4"></div>

                                        {/* Paragraph */}
                                        <div className="space-y-2">
                                            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full"></div>
                                            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-11/12"></div>
                                            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-4/5"></div>
                                        </div>

                                        {/* Task List */}
                                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-2">
                                            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Task Progress</div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded border-2 border-green-500 bg-green-500 flex items-center justify-center">
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                <span className="text-xs text-gray-600 dark:text-gray-400 line-through">Design system update</span>
                                                <span className="ml-auto px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] rounded">Done</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
                                                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                                                </div>
                                                <span className="text-xs text-gray-800 dark:text-gray-200">API integration</span>
                                                <span className="ml-auto px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] rounded">In Progress</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600"></div>
                                                <span className="text-xs text-gray-600 dark:text-gray-400">Performance testing</span>
                                                <span className="ml-auto px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] rounded">Pending</span>
                                            </div>
                                        </div>

                                        {/* Stats Cards */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                                                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">24</div>
                                                <div className="text-[10px] text-blue-500">Tasks</div>
                                            </div>
                                            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                                                <div className="text-xl font-bold text-green-600 dark:text-green-400">18</div>
                                                <div className="text-[10px] text-green-500">Completed</div>
                                            </div>
                                            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                                                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">5</div>
                                                <div className="text-[10px] text-purple-500">Members</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Trusted By Section */}
        <section className="py-16 border-b border-gray-100 dark:border-gray-800">
            <div className="container-padding">
                <p className="text-center text-sm text-notion-light mb-8">{t("home.trusted-by")}</p>
                <div className="logo-cloud">
                    <div className="flex items-center gap-2 text-2xl font-semibold text-gray-400">
                        <span>Stripe</span>
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-semibold text-gray-400">
                        <span>Figma</span>
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-semibold text-gray-400">
                        <span>Vercel</span>
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-semibold text-gray-400">
                        <span>Linear</span>
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-semibold text-gray-400">
                        <span>Slack</span>
                    </div>
                </div>
            </div>
        </section>

        {/* Features Bento Grid */}
        <section id="features" className="section-padding">
            <div className="container-padding">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold text-notion mb-4">
                        {t("home.features-title")}
                    </h2>
                    <p className="text-lg text-notion-light max-w-2xl mx-auto">
                        {t("home.features-desc")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
                    {/* Large feature card */}
                    <div className="bento-card lg:col-span-2 group">
                        <div className="feature-icon bg-blue-100 dark:bg-blue-900/30">
                            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-2xl font-semibold text-notion mb-3">{t("home.feature-write-title")}</h3>
                        <p className="text-notion-light mb-6">
                            {t("home.feature-write-desc")}
                        </p>
                        <div className="aspect-video rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center p-4 relative overflow-hidden">
                            {/* Rich Editor Preview */}
                            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 transform hover:scale-[1.02] transition-transform">
                                {/* Editor Toolbar */}
                                <div className="flex items-center gap-1 mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 text-xs font-bold">B</button>
                                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 text-xs italic">I</button>
                                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 text-xs underline">U</button>
                                    <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                                    </button>
                                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg>
                                    </button>
                                    <button className="p-1.5 bg-indigo-100 dark:bg-indigo-900/50 rounded text-indigo-600 dark:text-indigo-400">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </button>
                                </div>
                                {/* Document Content */}
                                <div className="space-y-2">
                                    <div className="h-5 bg-gradient-to-r from-blue-200 to-indigo-200 dark:from-blue-700 dark:to-indigo-700 rounded w-2/3"></div>
                                    <div className="h-2.5 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                                    <div className="h-2.5 bg-gray-200 dark:bg-gray-600 rounded w-11/12"></div>
                                    <div className="h-2.5 bg-gray-200 dark:bg-gray-600 rounded w-4/5"></div>
                                    {/* Code Block */}
                                    <div className="bg-gray-900 rounded-lg p-2 mt-2">
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[8px] text-gray-500">javascript</span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="h-2 bg-purple-400/30 rounded w-1/2"></div>
                                            <div className="h-2 bg-green-400/30 rounded w-3/4"></div>
                                            <div className="h-2 bg-blue-400/30 rounded w-2/3"></div>
                                        </div>
                                    </div>
                                    {/* Checklist */}
                                    <div className="flex items-center gap-2 pt-2">
                                        <div className="w-4 h-4 rounded border-2 border-green-500 bg-green-500 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded flex-1"></div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600"></div>
                                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded flex-1"></div>
                                    </div>
                                </div>
                            </div>
                            {/* Decorative Elements */}
                            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-20 blur-2xl"></div>
                            <div className="absolute -left-4 -top-4 w-20 h-20 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-15 blur-xl"></div>
                        </div>
                    </div>

                    {/* Tall feature card */}
                    <div className="bento-card lg:row-span-2 group">
                        <div className="feature-icon bg-green-100 dark:bg-green-900/30">
                            <FaTasks className="w-6 h-6 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-3">{t("home.feature-tasks-title")}</h3>
                        <p className="text-notion-light mb-4">
                            {t("home.feature-tasks-desc")}
                        </p>
                        <div className="flex-1 rounded-xl bg-gradient-to-b from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 p-4 min-h-[200px]">
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                                    <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center">
                                        <FaCheck className="w-3 h-3 text-green-500" />
                                    </div>
                                    <span className="text-sm text-notion line-through">Design mockups</span>
                                </div>
                                <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                                    <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center">
                                        <FaCheck className="w-3 h-3 text-green-500" />
                                    </div>
                                    <span className="text-sm text-notion line-through">Review feedback</span>
                                </div>
                                <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                                    <div className="w-5 h-5 rounded border-2 border-gray-300"></div>
                                    <span className="text-sm text-notion">Ship feature</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Database card */}
                    <div className="bento-card group">
                        <div className="feature-icon bg-purple-100 dark:bg-purple-900/30">
                            <FaDatabase className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.feature-database-title")}</h3>
                        <p className="text-notion-light">
                            {t("home.feature-database-desc")}
                        </p>
                    </div>

                    {/* Collaborate card */}
                    <div className="bento-card group">
                        <div className="feature-icon bg-yellow-100 dark:bg-yellow-900/30">
                            <FaUsers className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.feature-collab-title")}</h3>
                        <p className="text-notion-light">
                            {t("home.feature-collab-desc")}
                        </p>
                    </div>

                    {/* Connect card */}
                    <div className="bento-card group">
                        <div className="feature-icon bg-red-100 dark:bg-red-900/30">
                            <FaLink className="w-6 h-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.feature-link-title")}</h3>
                        <p className="text-notion-light">
                            {t("home.feature-link-desc")}
                        </p>
                    </div>

                    {/* Plugins card */}
                    <div className="bento-card group">
                        <div className="feature-icon bg-indigo-100 dark:bg-indigo-900/30">
                            <FaPlug className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.feature-plugin-title")}</h3>
                        <p className="text-notion-light">
                            {t("home.feature-plugin-desc")}
                        </p>
                    </div>

                    {/* AI Card */}
                    <div className="bento-card group">
                        <div className="feature-icon bg-gradient-to-br from-orange-100 to-pink-100 dark:from-orange-900/30 dark:to-pink-900/30">
                            <Sparkles className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.feature-ai-title")}</h3>
                        <p className="text-notion-light">
                            {t("home.feature-ai-desc")}
                        </p>
                    </div>
                </div>
            </div>
        </section>

        {/* Plugin Store Section */}
        <section id="plugins" className="section-padding">
            <div className="container-padding">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100 dark:bg-indigo-900/30 mb-6">
                        <FaPlug className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t("home.plugin-store-badge")}</span>
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-notion mb-4">{t("home.plugin-store-title")}</h2>
                    <p className="text-lg text-notion-light max-w-2xl mx-auto">
                        {t("home.plugin-store-desc")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* AI Plugin */}
                    <div className="group bento-card hover:border-orange-200 dark:hover:border-orange-800 transition-all">
                        <div className="relative mb-4 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/20 p-4 h-32 overflow-hidden">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="relative">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Sparkles className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 animate-pulse"></div>
                                </div>
                            </div>
                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-orange-500 text-white text-[10px] font-medium rounded-full">HOT</div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-notion">{t("home.plugin-ai-name")}</h3>
                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] rounded-full">Official</span>
                        </div>
                        <p className="text-notion-light text-sm mb-3">{t("home.plugin-ai-desc")}</p>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <Rate rating={5} disabled variant="yellow" />
                                <span className="text-xs text-notion-light">(2.3k)</span>
                            </div>
                            <span className="text-xs text-notion-light">10k+ installs</span>
                        </div>
                    </div>

                    {/* Mermaid Plugin */}
                    <div className="group bento-card hover:border-blue-200 dark:hover:border-blue-800 transition-all">
                        <div className="relative mb-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 p-4 h-32 overflow-hidden">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 group-hover:scale-105 transition-transform">
                                    <svg className="w-12 h-12" viewBox="0 0 48 48">
                                        <rect x="4" y="4" width="16" height="10" rx="2" className="fill-blue-200 dark:fill-blue-700" />
                                        <rect x="28" y="4" width="16" height="10" rx="2" className="fill-blue-200 dark:fill-blue-700" />
                                        <rect x="16" y="34" width="16" height="10" rx="2" className="fill-blue-300 dark:fill-blue-600" />
                                        <line x1="12" y1="14" x2="12" y2="24" className="stroke-blue-400" strokeWidth="2" />
                                        <line x1="36" y1="14" x2="36" y2="24" className="stroke-blue-400" strokeWidth="2" />
                                        <line x1="12" y1="24" x2="36" y2="24" className="stroke-blue-400" strokeWidth="2" />
                                        <line x1="24" y1="24" x2="24" y2="34" className="stroke-blue-400" strokeWidth="2" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-notion">{t("home.plugin-mermaid-name")}</h3>
                        </div>
                        <p className="text-notion-light text-sm mb-3">{t("home.plugin-mermaid-desc")}</p>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <Rate rating={4} disabled variant="yellow" />
                                <span className="text-xs text-notion-light">(856)</span>
                            </div>
                            <span className="text-xs text-notion-light">5k+ installs</span>
                        </div>
                    </div>

                    {/* Database Plugin */}
                    <div className="group bento-card hover:border-purple-200 dark:hover:border-purple-800 transition-all">
                        <div className="relative mb-4 rounded-xl bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/20 dark:to-violet-900/20 p-4 h-32 overflow-hidden">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="relative group-hover:scale-105 transition-transform">
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-400 to-violet-500 shadow-lg flex items-center justify-center">
                                        <FaDatabase className="w-7 h-7 text-white" />
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 bg-white dark:bg-gray-800 rounded-lg px-2 py-1 shadow-md">
                                        <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">SQL</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-notion">{t("home.plugin-database-name")}</h3>
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[10px] rounded-full">Pro</span>
                        </div>
                        <p className="text-notion-light text-sm mb-3">{t("home.plugin-database-desc")}</p>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <Rate rating={5} disabled variant="yellow" />
                                <span className="text-xs text-notion-light">(1.2k)</span>
                            </div>
                            <span className="text-xs text-notion-light">8k+ installs</span>
                        </div>
                    </div>

                    {/* Draw Plugin */}
                    <div className="group bento-card hover:border-green-200 dark:hover:border-green-800 transition-all">
                        <div className="relative mb-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 p-4 h-32 overflow-hidden">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 group-hover:scale-105 transition-transform">
                                    <div className="w-16 h-12 relative">
                                        <div className="absolute top-1 left-1 w-4 h-4 rounded-full border-2 border-green-400"></div>
                                        <div className="absolute top-2 right-2 w-6 h-6 rounded bg-green-200 dark:bg-green-700"></div>
                                        <div className="absolute bottom-1 left-4 w-8 h-3 rounded-full bg-green-300 dark:bg-green-600"></div>
                                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 48">
                                            <path d="M8,40 Q32,10 56,40" fill="none" className="stroke-green-500" strokeWidth="2" strokeDasharray="4 2" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-500 text-white text-[10px] font-medium rounded-full">NEW</div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-notion">{t("home.plugin-draw-name")}</h3>
                        </div>
                        <p className="text-notion-light text-sm mb-3">{t("home.plugin-draw-desc")}</p>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <Rate rating={4} disabled variant="yellow" />
                                <span className="text-xs text-notion-light">(432)</span>
                            </div>
                            <span className="text-xs text-notion-light">3k+ installs</span>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-12">
                    <Link to="/plugins">
                        <Button variant="outline" size="lg" className="rounded-xl">
                            {t("home.explore-plugins")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>
        </section>

        {/* Templates Section */}
        <section id="templates" className="section-padding bg-muted/30">
            <div className="container-padding">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-6">
                        <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("home.template-store-badge")}</span>
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-notion mb-4">{t("home.templates-title")}</h2>
                    <p className="text-lg text-notion-light max-w-2xl mx-auto">
                        {t("home.templates-desc")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="group cursor-pointer">
                        <div className="relative overflow-hidden rounded-2xl mb-4 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/20 p-5 h-64">
                            {/* Kanban Board Illustration */}
                            <div className="flex items-center justify-center h-full">
                                <div className="flex gap-2 w-full max-w-[280px]">
                                    {/* Column 1 - Todo */}
                                    <div className="flex-1 space-y-2">
                                        <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2">Todo</div>
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm border border-orange-100 dark:border-orange-900/30 group-hover:shadow-md transition-shadow">
                                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-full mb-1.5"></div>
                                            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded w-3/4"></div>
                                            <div className="flex items-center gap-1 mt-2">
                                                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-pink-400 to-rose-500"></div>
                                                <span className="text-[8px] text-gray-400">High</span>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm border border-orange-100 dark:border-orange-900/30">
                                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-full mb-1.5"></div>
                                            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded w-1/2"></div>
                                        </div>
                                    </div>
                                    {/* Column 2 - In Progress */}
                                    <div className="flex-1 space-y-2">
                                        <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">Doing</div>
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm border border-blue-100 dark:border-blue-900/30">
                                            <div className="h-2 bg-blue-200 dark:bg-blue-700 rounded w-full mb-1.5"></div>
                                            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded w-2/3"></div>
                                            <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
                                                <div className="w-2/3 h-1 bg-blue-500 rounded-full"></div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Column 3 - Done */}
                                    <div className="flex-1 space-y-2">
                                        <div className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">Done</div>
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm border border-green-100 dark:border-green-900/30 opacity-60">
                                            <div className="h-2 bg-green-200 dark:bg-green-700 rounded w-full mb-1.5 line-through"></div>
                                            <div className="flex items-center gap-1 mt-1">
                                                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm border border-green-100 dark:border-green-900/30 opacity-60">
                                            <div className="h-2 bg-green-200 dark:bg-green-700 rounded w-full"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-orange-300 rounded-full opacity-30 blur-xl"></div>
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2 group-hover:text-primary transition-colors">{t("home.template-project-title")}</h3>
                        <p className="text-notion-light text-sm">{t("home.template-project-desc")}</p>
                    </div>

                    <div className="group cursor-pointer">
                        <div className="relative overflow-hidden rounded-2xl mb-4 bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 p-5 h-64">
                            {/* Team Wiki Illustration */}
                            <div className="flex items-center justify-center h-full">
                                <div className="w-full max-w-[240px] space-y-3">
                                    {/* Team Avatars */}
                                    <div className="flex justify-center -space-x-3 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-3 border-white dark:border-gray-800 shadow-lg flex items-center justify-center text-white text-sm font-bold group-hover:scale-110 transition-transform z-30">👩</div>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 border-3 border-white dark:border-gray-800 shadow-lg flex items-center justify-center text-white text-sm font-bold group-hover:scale-110 transition-transform delay-75 z-20">👨</div>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-3 border-white dark:border-gray-800 shadow-lg flex items-center justify-center text-white text-sm font-bold group-hover:scale-110 transition-transform delay-100 z-10">🧑</div>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-pink-600 border-3 border-white dark:border-gray-800 shadow-lg flex items-center justify-center text-white text-sm font-bold group-hover:scale-110 transition-transform delay-150">👩‍💻</div>
                                    </div>
                                    {/* Wiki Document */}
                                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 group-hover:shadow-xl transition-shadow">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-lg">📚</span>
                                            <div className="h-3 bg-gradient-to-r from-blue-200 to-cyan-200 dark:from-blue-700 dark:to-cyan-700 rounded flex-1"></div>
                                        </div>
                                        <div className="space-y-1.5 pl-6">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs">📄</span>
                                                <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded flex-1"></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs">📄</span>
                                                <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-4/5"></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs">📁</span>
                                                <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-3/4"></div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Live Indicator */}
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                        <span className="text-[10px] text-green-600 dark:text-green-400">3 members editing</span>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -top-4 -left-4 w-16 h-16 bg-cyan-300 rounded-full opacity-30 blur-xl"></div>
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2 group-hover:text-primary transition-colors">{t("home.template-wiki-title")}</h3>
                        <p className="text-notion-light text-sm">{t("home.template-wiki-desc")}</p>
                    </div>

                    <div className="group cursor-pointer">
                        <div className="relative overflow-hidden rounded-2xl mb-4 bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 p-5 h-64">
                            {/* Personal Notes Illustration */}
                            <div className="flex items-center justify-center h-full">
                                <div className="relative">
                                    {/* Main Note Card */}
                                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 w-48 transform group-hover:scale-105 transition-transform">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-xl">✨</span>
                                            <div className="h-3 bg-gradient-to-r from-purple-200 to-pink-200 dark:from-purple-700 dark:to-pink-700 rounded flex-1"></div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-5/6"></div>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-3/4"></div>
                                        </div>
                                        {/* Tags */}
                                        <div className="flex gap-1 mt-3">
                                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[8px] rounded-full">#ideas</span>
                                            <span className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-[8px] rounded-full">#daily</span>
                                        </div>
                                    </div>
                                    {/* Floating Elements */}
                                    <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-br from-yellow-300 to-amber-400 rounded-xl shadow-lg flex items-center justify-center transform -rotate-12 group-hover:rotate-0 transition-transform">
                                        <span className="text-lg">💡</span>
                                    </div>
                                    <div className="absolute -bottom-3 -right-3 w-8 h-8 bg-gradient-to-br from-pink-300 to-rose-400 rounded-lg shadow-lg flex items-center justify-center transform rotate-12 group-hover:rotate-0 transition-transform">
                                        <span className="text-sm">🎯</span>
                                    </div>
                                    <div className="absolute top-1/2 -right-6 w-6 h-6 bg-gradient-to-br from-purple-300 to-indigo-400 rounded-md shadow-lg flex items-center justify-center">
                                        <span className="text-xs">📌</span>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-pink-300 rounded-full opacity-30 blur-xl"></div>
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2 group-hover:text-primary transition-colors">{t("home.template-notes-title")}</h3>
                        <p className="text-notion-light text-sm">{t("home.template-notes-desc")}</p>
                    </div>
                </div>

                <div className="text-center mt-12">
                    <Link to="/templates">
                        <Button variant="outline" size="lg" className="rounded-xl">
                            {t("home.browse-templates")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>
        </section>

        {/* Why Choose Section */}
        <section className="section-padding">
            <div className="container-padding">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <h2 className="text-3xl md:text-4xl font-bold text-notion mb-6">
                            {t("home.why-title")}
                        </h2>
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Zap className="w-6 h-6 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-notion mb-1">{t("home.why-fast-title")}</h3>
                                    <p className="text-notion-light">{t("home.why-fast-desc")}</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-notion mb-1">{t("home.why-secure-title")}</h3>
                                    <p className="text-notion-light">{t("home.why-secure-desc")}</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                    <Globe className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-notion mb-1">{t("home.why-anywhere-title")}</h3>
                                    <p className="text-notion-light">{t("home.why-anywhere-desc")}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-green-50 to-teal-100 dark:from-green-900/20 dark:to-teal-900/20 p-6">
                            {/* Rich Collaboration Illustration */}
                            <div className="flex items-center justify-center min-h-[350px]">
                                <div className="relative w-full max-w-lg">
                                    {/* Central Workspace */}
                                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 mx-auto w-72">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center">
                                                <span className="text-xs">🚀</span>
                                            </div>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Team Workspace</span>
                                            <div className="ml-auto flex -space-x-1">
                                                <div className="w-5 h-5 rounded-full bg-blue-400 border border-white"></div>
                                                <div className="w-5 h-5 rounded-full bg-green-400 border border-white"></div>
                                                <div className="w-5 h-5 rounded-full bg-purple-400 border border-white"></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="h-4 bg-gradient-to-r from-green-100 to-teal-100 dark:from-green-800/30 dark:to-teal-800/30 rounded w-3/4"></div>
                                            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded w-full"></div>
                                            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded w-5/6"></div>
                                            <div className="grid grid-cols-2 gap-2 mt-3">
                                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-center">
                                                    <div className="text-lg font-bold text-blue-600">12</div>
                                                    <div className="text-[8px] text-blue-500">Active</div>
                                                </div>
                                                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                                                    <div className="text-lg font-bold text-green-600">89%</div>
                                                    <div className="text-[8px] text-green-500">Complete</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Orbiting Elements */}
                                    <div className="absolute -top-4 left-1/4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 transform -translate-x-1/2 float-animation">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">📝</span>
                                            <div className="space-y-1">
                                                <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-16"></div>
                                                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded w-12"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="absolute top-8 -right-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 float-animation" style={{ animationDelay: '0.5s' }}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">📊</span>
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-6 bg-blue-400 rounded-full"></div>
                                                <div className="w-1.5 h-8 bg-green-400 rounded-full"></div>
                                                <div className="w-1.5 h-4 bg-purple-400 rounded-full"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="absolute -bottom-2 left-0 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 float-animation" style={{ animationDelay: '1s' }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-sm">👥</div>
                                            <div className="space-y-1">
                                                <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300">Team sync</div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                                    <span className="text-[8px] text-green-600">Live</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="absolute -bottom-4 right-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 float-animation" style={{ animationDelay: '1.5s' }}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">⚡</span>
                                            <div className="text-[10px] text-gray-600 dark:text-gray-400">
                                                <div className="font-medium text-gray-800 dark:text-gray-200">AI Powered</div>
                                                <div>Smart suggestions</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Connection Lines */}
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 350">
                                        <defs>
                                            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                                                <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.1" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M100,60 Q150,100 200,120" stroke="url(#lineGrad)" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                                        <path d="M340,100 Q300,130 280,150" stroke="url(#lineGrad)" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                                        <path d="M80,280 Q130,250 150,220" stroke="url(#lineGrad)" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                                        <path d="M320,290 Q280,260 260,230" stroke="url(#lineGrad)" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="absolute -bottom-6 -left-6 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-xl border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="flex -space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-500"></div>
                                    <div className="w-8 h-8 rounded-full bg-green-500"></div>
                                    <div className="w-8 h-8 rounded-full bg-purple-500"></div>
                                </div>
                                <span className="text-sm font-medium text-notion">3 {t("home.collaborating-now")}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="section-padding bg-muted/30">
            <div className="container-padding">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold text-notion mb-4">{t("home.testimonials-title")}</h2>
                    <p className="text-lg text-notion-light max-w-2xl mx-auto">{t("home.testimonials-desc")}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bento-card">
                        <div className="flex items-center mb-4">
                            <Rate rating={5} disabled variant="yellow" />
                        </div>
                        <p className="text-notion mb-6">"{t("home.testimonial-1")}"</p>
                        <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 mr-3"></div>
                            <div>
                                <h4 className="text-notion font-medium">Sarah Johnson</h4>
                                <p className="text-notion-light text-sm">Product Manager</p>
                            </div>
                        </div>
                    </div>

                    <div className="bento-card">
                        <div className="flex items-center mb-4">
                            <Rate rating={5} disabled variant="yellow" />
                        </div>
                        <p className="text-notion mb-6">"{t("home.testimonial-2")}"</p>
                        <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 mr-3"></div>
                            <div>
                                <h4 className="text-notion font-medium">Michael Chen</h4>
                                <p className="text-notion-light text-sm">Engineering Lead</p>
                            </div>
                        </div>
                    </div>

                    <div className="bento-card">
                        <div className="flex items-center mb-4">
                            <Rate rating={5} disabled variant="yellow" />
                        </div>
                        <p className="text-notion mb-6">"{t("home.testimonial-3")}"</p>
                        <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 mr-3"></div>
                            <div>
                                <h4 className="text-notion font-medium">Emma Wilson</h4>
                                <p className="text-notion-light text-sm">CEO, StartupXYZ</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="section-padding">
            <div className="container-padding">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold text-notion mb-4">{t("home.pricing-title")}</h2>
                    <p className="text-lg text-notion-light max-w-2xl mx-auto">{t("home.pricing-desc")}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {/* Free Plan */}
                    <div className="bento-card">
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.plan-free")}</h3>
                        <p className="text-notion-light mb-6">{t("home.plan-free-desc")}</p>
                        <div className="mb-6">
                            <span className="text-4xl font-bold text-notion">$0</span>
                            <span className="text-notion-light">{t("home.per-month")}</span>
                        </div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-unlimited-pages")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-guests-5")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-basic-templates")}</span>
                            </li>
                            <li className="flex items-center gap-2 opacity-50">
                                <FaTimes className="w-4 h-4 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-team-collab")}</span>
                            </li>
                        </ul>
                        <Button variant="outline" className="w-full rounded-xl">{t("home.get-started-free")}</Button>
                    </div>

                    {/* Pro Plan */}
                    <div className="bento-card relative border-primary/50 shadow-xl scale-105">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                            {t("home.most-popular")}
                        </div>
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.plan-pro")}</h3>
                        <p className="text-notion-light mb-6">{t("home.plan-pro-desc")}</p>
                        <div className="mb-6">
                            <span className="text-4xl font-bold text-notion">$10</span>
                            <span className="text-notion-light">{t("home.per-month")}</span>
                        </div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-everything-free")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-unlimited-guests")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-advanced-db")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-priority-support")}</span>
                            </li>
                        </ul>
                        <Button className="w-full rounded-xl">{t("home.upgrade-pro")}</Button>
                    </div>

                    {/* Team Plan */}
                    <div className="bento-card">
                        <h3 className="text-xl font-semibold text-notion mb-2">{t("home.plan-team")}</h3>
                        <p className="text-notion-light mb-6">{t("home.plan-team-desc")}</p>
                        <div className="mb-6">
                            <span className="text-4xl font-bold text-notion">$18</span>
                            <span className="text-notion-light">{t("home.per-user-month")}</span>
                        </div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-everything-pro")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-team-collab")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-admin-controls")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-notion-light">{t("home.feature-analytics")}</span>
                            </li>
                        </ul>
                        <Button variant="outline" className="w-full rounded-xl">{t("home.contact-sales")}</Button>
                    </div>
                </div>
            </div>
        </section>

        {/* Final CTA */}
        <section className="section-padding bg-gradient-warm">
            <div className="container-padding text-center">
                <h2 className="text-3xl md:text-5xl font-bold text-notion mb-6">
                    {t("home.cta-title")}
                </h2>
                <p className="text-lg text-notion-light max-w-2xl mx-auto mb-10">
                    {t("home.cta-desc")}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button
                        size="lg"
                        className="w-full sm:w-auto px-8 py-6 text-base rounded-xl"
                        onClick={() => window.open('https://kotion.top:888', '_blank')}
                    >
                        {t("home.start-free")}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto px-8 py-6 text-base rounded-xl"
                    >
                        {t("home.request-demo")}
                    </Button>
                </div>
            </div>
        </section>
    </>
};