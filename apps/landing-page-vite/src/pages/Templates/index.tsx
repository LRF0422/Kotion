import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { useState } from "react";


export const Templates: React.FC = () => {

    const filterItems = [
        "All Templates",
        "Productivity",
        "Work",
        "Personal",
        "Study",
        "Health",
        "Finance",
        "More"
    ]

    const [templates, setTemplates] = useState<any>([{}, {}, {}, {}, {}, {}])

    const [selectedKey, setSelectedKey] = React.useState<string>("All Templates")

    return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="text-3xl md:text-4xl font-bold mb-4">Discover Notion Templates</div>
        <div className="text-gray-600 text-lg max-w-3xl mb-8 text-balance">Find and use the best templates created by the community to boost your productivity and organize your life.</div>

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
            <h3 className="text-xl font-semibold">Popular Templates</h3>
            <div className="flex items-center gap-1">
                <div className="text-sm text-gray-500">Sort by:</div>
                <Select defaultValue="recent">
                    <SelectTrigger>
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
                templates.map((template, index) => (
                    <div className="border hover:shadow-md rounded-lg overflow-hidden transition-shadow cursor-pointer" key={index} data-id="1">
                        <div className="h-48 bg-notion-lightgray overflow-hidden">
                            <img src="https://picsum.photos/id/26/600/400" alt="Project Management Template" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                        </div>
                        <div className="p-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="px-2 py-1 bg-notion-tag text-xs rounded-md">Work</span>
                                <span className="text-xs text-gray-500"><i className="fa fa-download mr-1"></i> 2.4k</span>
                            </div>
                            <h4 className="font-medium text-lg mb-2">Project Management</h4>
                            <p className="text-gray-600 text-sm mb-4 line-clamp-2">Organize your projects, tasks, and team members with this comprehensive management template.</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <div className="h-6 w-6 rounded-full overflow-hidden">
                                        <img src="https://picsum.photos/id/64/100/100" alt="Creator" className="h-full w-full object-cover" />
                                    </div>
                                    <span className="text-xs text-gray-500">Alex Morgan</span>
                                </div>
                                <Button variant="link">Use Template</Button>
                            </div>
                        </div>
                    </div>
                ))
            }
        </div>
        <section className=" bg-muted rounded-xl p-8 text-center mb-16 mt-10">
            <h3 className="text-2xl font-bold mb-4">Can't find what you're looking for?</h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">Request a specific template or create and share your own to help the community.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button>
                    Request a Template
                </Button>
                <Button variant="outline">
                    Share Your Template
                </Button>
            </div>
        </section>
    </div>
}