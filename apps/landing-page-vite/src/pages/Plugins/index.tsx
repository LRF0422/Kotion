import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, IconButton, Rate, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { useEffect } from "react";
import { ArrowRight, DownloadIcon, Heart, HeartIcon, FaPlug, Sparkles, FaDatabase, Search } from "@kn/icon";
import request from "../../utils/request"
import { usePath } from "../../utils/use-path";
import { useTranslation } from "@kn/common";


export const Plugins: React.FC = () => {

    const { t } = useTranslation()

    const filterItems = [
        { key: "all", label: t("plugins.filter-all"), icon: "🔌" },
        { key: "feature", label: t("plugins.filter-feature"), icon: "⚡" },
        { key: "app", label: t("plugins.filter-app"), icon: "📱" },
        { key: "connector", label: t("plugins.filter-connector"), icon: "🔗" }
    ]

    const [selectedKey, setSelectedKey] = React.useState<string>("all")
    const [plugins, setPlugins] = React.useState<any>([]);
    const [searchQuery, setSearchQuery] = React.useState<string>("")

    useEffect(() => {
        request({
            url: '/knowledge-wiki/plugin/public/plugins',
            method: 'GET'
        }).then(res => {
            setPlugins(res.data.records)
        })
    }, [])

    function formatNumber(num: number | undefined): string {
        if (num) {
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'k'
            }
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        }
        return "0"
    }

    function renderStars(rating: number) {
        return <Rate disabled variant="yellow" rating={rating} />;
    }

    function gotoInstall(requestPluginId: string) {
        window.open(`https://kotion.top:888?requestPluginId=${requestPluginId}`, "_blank")
    }

    // Plugin category colors
    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'Feature': 'from-blue-400 to-cyan-500',
            'App': 'from-purple-400 to-pink-500',
            'Connector': 'from-green-400 to-teal-500',
            'AI': 'from-orange-400 to-red-500',
        }
        return colors[category] || 'from-gray-400 to-gray-500'
    }

    const getCategoryBg = (category: string) => {
        const colors: Record<string, string> = {
            'Feature': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            'App': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
            'Connector': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
            'AI': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        }
        return colors[category] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-16 md:py-24">
                {/* Decorative Elements */}
                <div className="absolute top-10 right-10 w-32 h-32 bg-gradient-to-br from-indigo-200 to-purple-300 rounded-full opacity-30 blur-3xl"></div>
                <div className="absolute bottom-10 left-10 w-40 h-40 bg-gradient-to-br from-blue-200 to-cyan-300 rounded-full opacity-30 blur-3xl"></div>
                <div className="absolute top-1/2 left-1/4 w-4 h-4 bg-indigo-400 rounded-full opacity-60 float-animation"></div>
                <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-purple-400 rounded-full opacity-60 float-animation" style={{ animationDelay: '0.5s' }}></div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center max-w-3xl mx-auto">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-indigo-200 dark:border-indigo-800 mb-6 shadow-sm">
                            <FaPlug className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t("plugins.badge")}</span>
                        </div>

                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-notion mb-6 tracking-tight">
                            {t("plugins.title-1")}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600"> {t("plugins.title-2")}</span>
                        </h1>

                        <p className="text-lg md:text-xl text-notion-light mb-10 max-w-2xl mx-auto">
                            {t("plugins.desc")}
                        </p>

                        {/* Search Bar */}
                        <div className="relative max-w-xl mx-auto mb-8">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder={t("plugins.search-placeholder")}
                                className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-lg"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Stats */}
                        <div className="flex items-center justify-center gap-8 md:gap-16">
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-notion">50+</div>
                                <div className="text-sm text-notion-light">{t("plugins.stat-plugins")}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-notion">100k+</div>
                                <div className="text-sm text-notion-light">{t("plugins.stat-installs")}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-notion">4.8</div>
                                <div className="text-sm text-notion-light">{t("plugins.stat-rating")}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Filter & Sort Section */}
            <section className="py-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
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
                            <span className="text-sm text-notion-light">{t("plugins.sort-by")}</span>
                            <Select defaultValue="popular">
                                <SelectTrigger className="w-[140px] h-10 rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="popular">{t("plugins.sort-popular")}</SelectItem>
                                    <SelectItem value="recent">{t("plugins.sort-recent")}</SelectItem>
                                    <SelectItem value="rating">{t("plugins.sort-rating")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </section>

            {/* Plugins Grid */}
            <section className="py-12 bg-gray-50/50 dark:bg-gray-900/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-notion">{t("plugins.popular-title")}</h2>
                        <span className="text-sm text-notion-light">{plugins.length} {t("plugins.plugins-found")}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {plugins.map((plugin: any, index: number) => (
                            <div
                                className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 dark:hover:border-gray-700"
                                key={index}
                            >
                                {/* Plugin Header */}
                                <div className="flex items-start gap-4 mb-4">
                                    {/* Icon */}
                                    <div className="relative flex-shrink-0">
                                        <img
                                            src={usePath(plugin.icon)}
                                            alt={plugin.name}
                                            className="w-12 h-12 rounded-xl"
                                        />
                                        {index < 3 && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                                                <span className="text-[8px]">🔥</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-notion text-base truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            {plugin.name}
                                        </h3>
                                        <p className="text-xs text-notion-light">by {plugin.developer}</p>
                                    </div>
                                </div>

                                <p className="text-notion-light text-sm mb-4 line-clamp-2 min-h-[40px]">
                                    {plugin.description}
                                </p>

                                {/* Rating & Downloads */}
                                <div className="flex items-center justify-between mb-4 text-sm">
                                    <div className="flex items-center gap-1">
                                        {renderStars(plugin.rating)}
                                        <span className="text-xs text-notion-light ml-1">
                                            ({plugin.reviews || 0})
                                        </span>
                                    </div>
                                    <span className="text-xs text-notion-light flex items-center gap-1">
                                        <DownloadIcon className="w-3 h-3" />
                                        {formatNumber(plugin.downloads)}
                                    </span>
                                </div>

                                {/* Category Badge */}
                                <div className="mb-4">
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${getCategoryBg(plugin.category?.value || 'Feature')}`}>
                                        {plugin.category?.value || 'Feature'}
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="flex-1 rounded-xl h-9 text-sm">
                                                {t("plugins.view-details")}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="w-[900px] max-w-none rounded-2xl">
                                            <DialogHeader>
                                                <DialogTitle className="text-2xl">{plugin.name}</DialogTitle>
                                                <DialogDescription />
                                            </DialogHeader>
                                            <div className="p-6">
                                                <div className="grid grid-cols-12 gap-6">
                                                    <div className="col-span-7">
                                                        <div className="rounded-xl overflow-hidden shadow-lg">
                                                            <img
                                                                src={usePath(plugin.screenShot)}
                                                                alt="Plugin Preview"
                                                                className="w-full h-auto"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="col-span-5 space-y-6">
                                                        <div className="flex items-center gap-4">
                                                            <img
                                                                src={usePath(plugin.icon)}
                                                                alt="Plugin Icon"
                                                                className="w-16 h-16 rounded-xl shadow-lg"
                                                            />
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    {renderStars(plugin.rating)}
                                                                    <span className="text-notion-light">{plugin.rating}</span>
                                                                </div>
                                                                <div className="text-sm text-notion-light">
                                                                    {formatNumber(plugin.downloads)} downloads
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <h4 className="font-semibold text-notion mb-2">{t("plugins.description")}</h4>
                                                            <p className="text-notion-light text-sm">{plugin.description}</p>
                                                        </div>

                                                        <div>
                                                            <h4 className="font-semibold text-notion mb-2">{t("plugins.features")}</h4>
                                                            <ul className="space-y-2">
                                                                {plugin.features?.map((feature: string, i: number) => (
                                                                    <li key={i} className="flex items-center gap-2 text-sm text-notion-light">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                                                        {feature}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>

                                                        <div className="flex flex-wrap gap-2">
                                                            <Badge className={getCategoryBg(plugin.category?.value)}>
                                                                {plugin.category?.value}
                                                            </Badge>
                                                            <Badge variant="outline">
                                                                by {plugin.developer}
                                                            </Badge>
                                                        </div>

                                                        <div className="flex gap-2 pt-4">
                                                            <Button className="flex-1 rounded-xl" onClick={() => gotoInstall(plugin.id)}>
                                                                {t("plugins.add-to-kotion")}
                                                            </Button>
                                                            <Button variant="outline" className="rounded-xl">
                                                                <HeartIcon className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                    <Button
                                        className="rounded-xl h-9 px-3"
                                        onClick={() => gotoInstall(plugin.id)}
                                    >
                                        <DownloadIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative rounded-3xl overflow-hidden bg-gray-100 dark:bg-gray-800/50 p-12 text-center border border-gray-200 dark:border-gray-700">
                        {/* Decorative */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl"></div>
                        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl"></div>

                        <div className="relative z-10">
                            <h3 className="text-2xl md:text-3xl font-bold text-notion mb-4">
                                {t("plugins.cta-title")}
                            </h3>
                            <p className="text-notion-light text-base mb-8 max-w-2xl mx-auto">
                                {t("plugins.cta-desc")}
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center gap-4">
                                <Button size="lg" className="rounded-xl px-8">
                                    {t("plugins.request-plugin")}
                                </Button>
                                <Button size="lg" variant="outline" className="rounded-xl px-8">
                                    {t("plugins.share-plugin")}
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
                        <div className="relative">
                            <div className="bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-3xl p-8">
                                <div className="relative h-64 flex items-center justify-center">
                                    {/* Central element */}
                                    <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl flex items-center justify-center">
                                        <FaPlug className="w-12 h-12 text-white" />
                                    </div>
                                    {/* Orbiting elements */}
                                    <div className="absolute top-4 left-1/4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg float-animation">
                                        <span className="text-2xl">💰</span>
                                    </div>
                                    <div className="absolute bottom-4 right-1/4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg float-animation" style={{ animationDelay: '0.5s' }}>
                                        <span className="text-2xl">⭐</span>
                                    </div>
                                    <div className="absolute top-1/2 right-4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-lg float-animation" style={{ animationDelay: '1s' }}>
                                        <span className="text-2xl">🚀</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div>
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-6">
                                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("plugins.creator-badge")}</span>
                            </div>
                            <h3 className="text-3xl md:text-4xl font-bold text-notion mb-4">
                                {t("plugins.creator-title")}
                            </h3>
                            <p className="text-lg text-notion-light mb-8">
                                {t("plugins.creator-desc")}
                            </p>
                            <div className="space-y-4 mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <span className="text-green-600">✓</span>
                                    </div>
                                    <span className="text-notion">{t("plugins.creator-benefit-1")}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <span className="text-green-600">✓</span>
                                    </div>
                                    <span className="text-notion">{t("plugins.creator-benefit-2")}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <span className="text-green-600">✓</span>
                                    </div>
                                    <span className="text-notion">{t("plugins.creator-benefit-3")}</span>
                                </div>
                            </div>
                            <Button size="lg" className="rounded-xl px-8">
                                {t("plugins.get-started")}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
