import { Button, Rate, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React from "react";
import Creator from "../../assets/creator.png"
import { PlusIcon } from "@kn/icon";


export const Plugins: React.FC = () => {

    const filterItems = [
        "All Plugins",
        "Feature",
        "App",
        "Connector"
    ]

    const [selectedKey, setSelectedKey] = React.useState<string>("All Plugins")

    const plugins = [
        {
            id: 1,
            name: "Notion Calendar",
            description: "Integrate a powerful, interactive calendar into your Notion workspace. Sync events, set reminders, and plan your schedule with ease.",
            category: "productivity",
            author: "Notion Labs",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/32293b56e4c34861953ce3e3a1601c47~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014811&x-signature=%2FrbKxmLSDtgNrWVERlRltx8Noko%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/1d930ae388f24c038708b2ee771b0f42~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014850&x-signature=fR2Sp4jXa6FHhr61W7kWENA1A4c%3D",
            rating: 4.8,
            reviews: 1245,
            downloads: 25678,
            features: [
                "Monthly, weekly, and daily views",
                "Event sync with Google Calendar and Outlook",
                "Reminder notifications",
                "Customizable event categories"
            ]
        },
        {
            id: 2,
            name: "TaskMaster",
            description: "Supercharge your productivity with advanced task management features. Create subtasks, set priorities, and track progress with visual indicators.",
            category: "productivity",
            author: "Productivity Pros",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/5929f117d689417ba63076dac8239efa~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014818&x-signature=nDfSg%2BhsWUvSmImZTzieKenaBB0%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/a238b2a9ca2e4f0f90716d1029ffe192~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014859&x-signature=tccfQ72bOIcHWAqQAMiO92Ot7GQ%3D",
            rating: 4.6,
            reviews: 987,
            downloads: 18945,
            features: [
                "Subtask creation and management",
                "Priority levels and labels",
                "Progress tracking with charts",
                "Recurring task templates"
            ]
        },
        {
            id: 3,
            name: "Data Visualizer",
            description: "Transform your Notion databases into stunning visualizations. Create charts, graphs, and dashboards to better understand your data.",
            category: "analytics",
            author: "Data Wizards",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/f51b9971539646528d09240aacd36c1c~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014824&x-signature=BQwdw1b86KkycwRBk1PYzxAJHN4%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/f51b9971539646528d09240aacd36c1c~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014824&x-signature=BQwdw1b86KkycwRBk1PYzxAJHN4%3D",
            rating: 4.7,
            reviews: 756,
            downloads: 14321,
            features: [
                "Multiple chart types (bar, line, pie, etc.)",
                "Interactive dashboards",
                "Data filtering and sorting",
                "Export to PNG/PDF"
            ]
        },
        {
            id: 4,
            name: "Notes Plus",
            description: "Enhance your note-taking experience with advanced formatting tools, AI-powered summarization, and seamless organization.",
            category: "productivity",
            author: "Note Taking Co.",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/748987d5012343b6b52d480465ba439a~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014843&x-signature=0gq%2BSRo5OVlTZIn1dcIM00nGhYw%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/748987d5012343b6b52d480465ba439a~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014843&x-signature=0gq%2BSRo5OVlTZIn1dcIM00nGhYw%3D",
            rating: 4.5,
            reviews: 634,
            downloads: 12876,
            features: [
                "Advanced text formatting",
                "AI-powered summarization",
                "Smart tagging system",
                "Note linking and backlinks"
            ]
        },
        {
            id: 5,
            name: "Code Blocks Pro",
            description: "Enhance Notion's code blocks with syntax highlighting, line numbers, and integration with GitHub and other code repositories.",
            category: "development",
            author: "Dev Tools Inc.",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/f51b9971539646528d09240aacd36c1c~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014824&x-signature=BQwdw1b86KkycwRBk1PYzxAJHN4%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/f51b9971539646528d09240aacd36c1c~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014824&x-signature=BQwdw1b86KkycwRBk1PYzxAJHN4%3D",
            rating: 4.9,
            reviews: 423,
            downloads: 8765,
            features: [
                "Syntax highlighting for 50+ languages",
                "Line numbers and code folding",
                "GitHub integration",
                "Code execution for select languages"
            ]
        },
        {
            id: 6,
            name: "Mind Map Generator",
            description: "Create visual mind maps from your Notion pages to brainstorm ideas, organize thoughts, and see connections between concepts.",
            category: "design",
            author: "Creative Tools",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/748987d5012343b6b52d480465ba439a~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014843&x-signature=0gq%2BSRo5OVlTZIn1dcIM00nGhYw%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/748987d5012343b6b52d480465ba439a~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014843&x-signature=0gq%2BSRo5OVlTZIn1dcIM00nGhYw%3D",
            rating: 4.4,
            reviews: 387,
            downloads: 7654,
            features: [
                "Interactive mind maps",
                "Auto-generate from Notion pages",
                "Customizable styles and colors",
                "Export to PNG/SVG"
            ]
        },
        {
            id: 7,
            name: "Flashcard Creator",
            description: "Turn your notes into interactive flashcards for effective learning and review. Use spaced repetition algorithms to optimize memory retention.",
            category: "education",
            author: "Learn Smart",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/5929f117d689417ba63076dac8239efa~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014818&x-signature=nDfSg%2BhsWUvSmImZTzieKenaBB0%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/a238b2a9ca2e4f0f90716d1029ffe192~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014859&x-signature=tccfQ72bOIcHWAqQAMiO92Ot7GQ%3D",
            rating: 4.7,
            reviews: 512,
            downloads: 9876,
            features: [
                "Auto-generate flashcards from notes",
                "Spaced repetition algorithm",
                "Progress tracking",
                "Share flashcard sets"
            ]
        },
        {
            id: 8,
            name: "Budget Tracker",
            description: "Manage your personal finances with this comprehensive budget tracking plugin. Track expenses, set budgets, and visualize your spending habits.",
            category: "analytics",
            author: "Finance Tools",
            icon: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/32293b56e4c34861953ce3e3a1601c47~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014811&x-signature=%2FrbKxmLSDtgNrWVERlRltx8Noko%3D",
            screenshot: "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/1d930ae388f24c038708b2ee771b0f42~tplv-a9rns2rl98-image.image?rcl=2025101414194753E7A36856A775561C65&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1763014850&x-signature=fR2Sp4jXa6FHhr61W7kWENA1A4c%3D",
            rating: 4.6,
            reviews: 478,
            downloads: 8765,
            features: [
                "Expense tracking and categorization",
                "Budget setting and monitoring",
                "Financial reports and charts",
                "Bill reminders"
            ]
        }
    ];

    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function renderStars(rating) {
        return <Rate disabled variant="yellow" rating={rating} />;
    }

    return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="text-3xl md:text-4xl font-bold mb-4">Discover Kotion Plugins</div>
        <div className="text-gray-600 text-lg max-w-3xl mb-8 text-balance">Find and use the best plugins created by the community to boost your productivity and organize your life.</div>
        <div className="flex flex-wrap gap-2 mb-8">
            {
                filterItems.map((item, index) => (
                    <Button
                        variant={selectedKey === item ? "default" : "secondary"}
                        className="px-4 py-2 rounded-md text-sm transition-colors"
                        key={index}
                        onClick={() => setSelectedKey(item)}>
                        {item}
                    </Button>
                ))
            }
        </div>
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold">Popular Plugins</h3>
            <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500 text-nowrap">Sort by :</div>
                <Select defaultValue="recent">
                    <SelectTrigger className="w-[100px] h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="recent">Recent</SelectItem>
                        <SelectItem value="popular">Popular</SelectItem>
                        <SelectItem value="trending">Trending</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
            {
                plugins.map((plugin, index) => (
                    <div className="p-6 shadow-sm border transition-shadow rounded-sm " key={index}>
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center">
                                <img src={plugin.icon} alt={plugin.name} className="w-10 h-10 mr-3 rounded-md" />
                                <div>
                                    <h3 className="font-semibold text-neutral-800">{plugin.name}</h3>
                                    <p className="text-xs text-neutral-500">By {plugin.author}</p>
                                </div>
                            </div>
                            <button className="text-neutral-400 hover:text-neutral-600 transition-all-200">
                                <i className="fa fa-heart-o"></i>
                            </button>
                        </div>

                        <p className="text-neutral-600 text-sm mb-4 line-clamp-2">${plugin.description}</p>

                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center">
                                <div className="flex items-center text-yellow-400 mr-1">
                                    {renderStars(plugin.rating)}
                                </div>
                                <span className="text-xs text-neutral-500">{plugin.rating.toFixed(1)} ({plugin.reviews})</span>
                            </div>
                            <span className="text-xs text-neutral-500">{formatNumber(plugin.downloads)} downloads</span>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full text-xs">{plugin.category}</span>
                        </div>

                        <div className="flex space-x-2">
                            <button className="view-plugin flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-all-200 text-sm">
                                View Details
                            </button>
                            <button className="px-3 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-all-200">
                                <PlusIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))
            }
        </div>
        <section className=" bg-muted/50 rounded-xl p-8 text-center mb-16 mt-10">
            <h3 className="text-2xl font-bold mb-4">Can't find what you're looking for?</h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">Request a specific template or create and share your own to help the community.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button>
                    Request a Plugin
                </Button>
                <Button variant="outline">
                    Share Your Plugin
                </Button>
            </div>
        </section>
        <section className=" bg-muted/50 rounded-xl p-8 flex items-center justify-center mb-16 gap-2">
            <img src={Creator} width={244} />
            <div>
                <h3 className="text-2xl font-bold mb-4">Become a creator</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">Submit your plugin to the Kotion plugin gallery, get featured, and even get paid – all in just a few clicks.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Button variant="outline">
                        Get started
                    </Button>
                </div>
            </div>
        </section>
    </div>
}