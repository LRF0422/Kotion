import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { useEffect, useState } from "react";
import { ArrowRight, DownloadIcon, FileText, Sparkles, Search, Heart } from "@kn/icon";
import request from "../../utils/request"
import { useTranslation } from "@kn/common";


export const Templates: React.FC = () => {

    const { t } = useTranslation()

    const filterItems = [
        { key: "all", label: t("templates.filter-all"), icon: "📚" },
        { key: "productivity", label: t("templates.filter-productivity"), icon: "⚡" },
        { key: "work", label: t("templates.filter-work"), icon: "💼" },
        { key: "personal", label: t("templates.filter-personal"), icon: "🏠" },
        { key: "study", label: t("templates.filter-study"), icon: "📖" },
        { key: "health", label: t("templates.filter-health"), icon: "❤️" },
        { key: "finance", label: t("templates.filter-finance"), icon: "💰" },
    ]

    const [templates, setTemplates] = useState<any[]>([])
    const [selectedKey, setSelectedKey] = React.useState<string>("all")
    const [searchQuery, setSearchQuery] = useState("")

    useEffect(() => {
        request({
            url: '/knowledge-wiki/space/public/templates',
            method: 'GET'
        }).then(res => {
            setTemplates(res.data.records)
        })
    }, [])

    // Template preview backgrounds (CSS-generated)
    const getTemplatePreview = (index: number) => {
        const previews = [
            // Kanban style
            <div className="w-full h-full bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/20 p-4 flex gap-2">
                <div className="flex-1 space-y-2">
                    <div className="h-2 w-12 bg-orange-300 dark:bg-orange-700 rounded"></div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-full mb-1"></div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded w-3/4"></div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                    </div>
                </div>
                <div className="flex-1 space-y-2">
                    <div className="h-2 w-12 bg-blue-300 dark:bg-blue-700 rounded"></div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                        <div className="h-2 bg-blue-200 dark:bg-blue-700 rounded w-full"></div>
                    </div>
                </div>
                <div className="flex-1 space-y-2">
                    <div className="h-2 w-12 bg-green-300 dark:bg-green-700 rounded"></div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm opacity-60">
                        <div className="h-2 bg-green-200 dark:bg-green-700 rounded w-full"></div>
                    </div>
                </div>
            </div>,
            // Document style
            <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 flex items-center justify-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-lg w-3/4">
                    <div className="h-3 bg-gradient-to-r from-blue-200 to-indigo-200 dark:from-blue-700 dark:to-indigo-700 rounded w-2/3 mb-2"></div>
                    <div className="space-y-1.5">
                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-5/6"></div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-4/5"></div>
                    </div>
                </div>
            </div>,
            // Calendar style
            <div className="w-full h-full bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-lg">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {[...Array(7)].map((_, i) => (
                            <div key={i} className="h-2 bg-gray-200 dark:bg-gray-600 rounded"></div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {[...Array(14)].map((_, i) => (
                            <div key={i} className={`h-4 rounded ${i === 5 ? 'bg-purple-400' : i === 9 ? 'bg-pink-400' : 'bg-gray-100 dark:bg-gray-700'}`}></div>
                        ))}
                    </div>
                </div>
            </div>,
            // Notes style
            <div className="w-full h-full bg-gradient-to-br from-green-50 to-teal-100 dark:from-green-900/20 dark:to-teal-900/20 p-4 flex items-center justify-center">
                <div className="relative">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-lg w-32 transform -rotate-3">
                        <div className="h-2 bg-green-200 dark:bg-green-700 rounded w-3/4 mb-2"></div>
                        <div className="space-y-1">
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded w-5/6"></div>
                        </div>
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-300 rounded shadow-md flex items-center justify-center text-xs">💡</div>
                </div>
            </div>,
            // Dashboard style
            <div className="w-full h-full bg-gradient-to-br from-cyan-50 to-blue-100 dark:from-cyan-900/20 dark:to-blue-900/20 p-4">
                <div className="grid grid-cols-2 gap-2 h-full">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                        <div className="text-lg font-bold text-blue-600">24</div>
                        <div className="h-1 bg-gray-200 dark:bg-gray-600 rounded w-8"></div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                        <div className="text-lg font-bold text-green-600">89%</div>
                        <div className="h-1 bg-gray-200 dark:bg-gray-600 rounded w-8"></div>
                    </div>
                    <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                        <div className="flex gap-1 items-end h-8">
                            <div className="flex-1 bg-blue-300 dark:bg-blue-600 rounded-t h-4"></div>
                            <div className="flex-1 bg-blue-400 dark:bg-blue-500 rounded-t h-6"></div>
                            <div className="flex-1 bg-blue-500 dark:bg-blue-400 rounded-t h-8"></div>
                            <div className="flex-1 bg-blue-400 dark:bg-blue-500 rounded-t h-5"></div>
                        </div>
                    </div>
                </div>
            </div>,
            // Goals style
            <div className="w-full h-full bg-gradient-to-br from-rose-50 to-orange-100 dark:from-rose-900/20 dark:to-orange-900/20 p-4 flex items-center justify-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-lg w-3/4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🎯</span>
                        <div className="h-2 bg-rose-200 dark:bg-rose-700 rounded flex-1"></div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border-2 border-green-500 bg-green-500"></div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded flex-1"></div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600"></div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded flex-1"></div>
                        </div>
                    </div>
                </div>
            </div>,
        ]
        return previews[index % previews.length]
    }

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'Work': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            'Personal': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
            'Productivity': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
            'Study': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
            'Health': 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
            'Finance': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
        }
        return colors[category] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-16 md:py-24">
                {/* Decorative Elements */}
                <div className="absolute top-10 left-10 w-32 h-32 bg-gradient-to-br from-purple-200 to-pink-300 rounded-full opacity-30 blur-3xl"></div>
                <div className="absolute bottom-10 right-10 w-40 h-40 bg-gradient-to-br from-orange-200 to-rose-300 rounded-full opacity-30 blur-3xl"></div>
                <div className="absolute top-1/2 right-1/4 w-4 h-4 bg-purple-400 rounded-full opacity-60 float-animation"></div>
                <div className="absolute top-1/3 left-1/4 w-3 h-3 bg-pink-400 rounded-full opacity-60 float-animation" style={{ animationDelay: '0.5s' }}></div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center max-w-3xl mx-auto">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-purple-200 dark:border-purple-800 mb-6 shadow-sm">
                            <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("templates.badge")}</span>
                        </div>

                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-notion mb-6 tracking-tight">
                            {t("templates.title-1")}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600"> {t("templates.title-2")}</span>
                        </h1>

                        <p className="text-lg md:text-xl text-notion-light mb-10 max-w-2xl mx-auto">
                            {t("templates.desc")}
                        </p>

                        {/* Search Bar */}
                        <div className="relative max-w-xl mx-auto mb-8">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder={t("templates.search-placeholder")}
                                className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all shadow-lg"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Stats */}
                        <div className="flex items-center justify-center gap-8 md:gap-16">
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-notion">200+</div>
                                <div className="text-sm text-notion-light">{t("templates.stat-templates")}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-notion">50k+</div>
                                <div className="text-sm text-notion-light">{t("templates.stat-uses")}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-notion">7</div>
                                <div className="text-sm text-notion-light">{t("templates.stat-categories")}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Filter & Sort Section */}
            <section className="py-8 border-b border-gray-100 dark:border-gray-800 sticky top-16 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        {/* Filter Pills */}
                        <div className="flex flex-wrap gap-2">
                            {filterItems.map((item, index) => (
                                <Button
                                    variant={selectedKey === item.key ? "default" : "outline"}
                                    className={`px-4 py-2 rounded-full text-sm transition-all ${selectedKey === item.key
                                            ? 'shadow-md'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                    key={index}
                                    onClick={() => setSelectedKey(item.key)}
                                >
                                    <span className="mr-2">{item.icon}</span>
                                    {item.label}
                                </Button>
                            ))}
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-notion-light">{t("templates.sort-by")}</span>
                            <Select defaultValue="popular">
                                <SelectTrigger className="w-[140px] h-10 rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="popular">{t("templates.sort-popular")}</SelectItem>
                                    <SelectItem value="recent">{t("templates.sort-recent")}</SelectItem>
                                    <SelectItem value="trending">{t("templates.sort-trending")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </section>

            {/* Templates Grid */}
            <section className="py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-notion">{t("templates.popular-title")}</h2>
                        <span className="text-sm text-notion-light">{templates.length} {t("templates.templates-found")}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {templates.map((template: any, index: number) => (
                            <div
                                className="group bento-card p-0 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                                key={index}
                            >
                                {/* Template Preview */}
                                <div className="h-40 overflow-hidden relative">
                                    {getTemplatePreview(index)}
                                    {/* Hover Overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <Button className="rounded-xl shadow-lg">
                                            {t("templates.preview")}
                                        </Button>
                                    </div>
                                    {/* Favorite Button */}
                                    <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 dark:bg-gray-800/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white dark:hover:bg-gray-800 shadow-md">
                                        <Heart className="w-4 h-4 text-gray-500 hover:text-red-500 transition-colors" />
                                    </button>
                                    {/* Featured Badge */}
                                    {index < 2 && (
                                        <div className="absolute top-3 left-3 px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold rounded-full shadow-lg">
                                            ⭐ Featured
                                        </div>
                                    )}
                                </div>

                                {/* Template Info */}
                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Badge className={`${getCategoryColor('Work')} text-xs px-2 py-0.5`}>
                                            Work
                                        </Badge>
                                        <span className="text-xs text-notion-light flex items-center gap-1">
                                            <DownloadIcon className="w-3 h-3" /> 2.4k
                                        </span>
                                    </div>

                                    <h4 className="font-semibold text-lg text-notion mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-1">
                                        {template.name}
                                    </h4>

                                    <p className="text-notion-light text-sm mb-4 line-clamp-2 min-h-[40px]">
                                        {template.description}
                                    </p>

                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-pink-500">
                                                <img
                                                    src={`https://i.pravatar.cc/100?img=${(index % 70) + 1}`}
                                                    alt="Creator"
                                                    className="h-full w-full object-cover"
                                                />
                                            </div>
                                            <span className="text-xs text-notion-light">Alex Morgan</span>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20">
                                            {t("templates.use-template")}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 p-12 text-center">
                        {/* Decorative */}
                        <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-10"></div>
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl"></div>
                        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/20 rounded-full blur-3xl"></div>

                        <div className="relative z-10">
                            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                                {t("templates.cta-title")}
                            </h3>
                            <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
                                {t("templates.cta-desc")}
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center gap-4">
                                <Button size="lg" className="bg-white text-purple-600 hover:bg-gray-100 rounded-xl px-8">
                                    {t("templates.request-template")}
                                </Button>
                                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 rounded-xl px-8">
                                    {t("templates.share-template")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Become Creator Section */}
            <section className="py-16 bg-muted/30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        {/* Illustration */}
                        <div className="relative order-2 lg:order-1">
                            <div className="bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-3xl p-8">
                                <div className="relative h-64 flex items-center justify-center">
                                    {/* Central element */}
                                    <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-xl flex items-center justify-center">
                                        <FileText className="w-12 h-12 text-white" />
                                    </div>
                                    {/* Orbiting elements */}
                                    <div className="absolute top-4 right-1/4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg float-animation">
                                        <span className="text-2xl">💰</span>
                                    </div>
                                    <div className="absolute bottom-4 left-1/4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg float-animation" style={{ animationDelay: '0.5s' }}>
                                        <span className="text-2xl">⭐</span>
                                    </div>
                                    <div className="absolute top-1/2 left-4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg float-animation" style={{ animationDelay: '1s' }}>
                                        <span className="text-2xl">🎨</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="order-1 lg:order-2">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-100 dark:bg-pink-900/30 mb-6">
                                <Sparkles className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                                <span className="text-sm font-medium text-pink-600 dark:text-pink-400">{t("templates.creator-badge")}</span>
                            </div>
                            <h3 className="text-3xl md:text-4xl font-bold text-notion mb-4">
                                {t("templates.creator-title")}
                            </h3>
                            <p className="text-lg text-notion-light mb-8">
                                {t("templates.creator-desc")}
                            </p>
                            <div className="space-y-4 mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <span className="text-green-600">✓</span>
                                    </div>
                                    <span className="text-notion">{t("templates.creator-benefit-1")}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <span className="text-green-600">✓</span>
                                    </div>
                                    <span className="text-notion">{t("templates.creator-benefit-2")}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <span className="text-green-600">✓</span>
                                    </div>
                                    <span className="text-notion">{t("templates.creator-benefit-3")}</span>
                                </div>
                            </div>
                            <Button size="lg" className="rounded-xl px-8">
                                {t("templates.get-started")}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
