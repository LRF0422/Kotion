import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { useEffect, useState } from "react";
import Creator from "../../assets/creator.png"
import { ArrowRight, DownloadIcon } from "@kn/icon";
import request from "../../utils/request"


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

    const [templates, setTemplates] = useState([])
    const [selectedKey, setSelectedKey] = React.useState<string>("All Templates")

    useEffect(() => {
        request({
            url: '/knowledge-wiki/space/public/templates',
            method: 'GET'
        }).then(res => {
            setTemplates(res.data.records)
        })
    }, [])

    return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="text-3xl md:text-4xl font-bold mb-4">Discover Kotion Templates</div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {
                templates.map((template, index) => (
                    <div className="border hover:shadow-md rounded-lg overflow-hidden transition-shadow cursor-pointer" key={index} data-id="1">
                        <div className="h-48 bg-notion-lightgray overflow-hidden">
                            <img
                                src={`https://images.unsplash.com/photo-${1454165804606 + index}?w=600&h=400&fit=crop`}
                                alt="Template Preview"
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            />
                        </div>
                        <div className="p-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <Badge className="px-2 py-1 text-xs rounded-md">Work</Badge>
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <DownloadIcon className="w-4 h-4" /> 2.4k
                                </span>
                            </div>
                            <h4 className="font-medium text-lg mb-2">{template.name}</h4>
                            <p className="text-gray-600 text-sm mb-4 line-clamp-2">{template.description}</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <div className="h-6 w-6 rounded-full overflow-hidden">
                                        <img
                                            src={`https://i.pravatar.cc/100?img=${(index % 70) + 1}`}
                                            alt="Creator Avatar"
                                            className="h-full w-full object-cover"
                                        />
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
        <section className=" bg-muted/50 rounded-xl p-8 text-center mb-16 mt-10">
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
        <section className=" rounded-xl p-8 flex items-center justify-center mb-16 gap-2">
            <img src={Creator} width={244} />
            <div>
                <h3 className="text-2xl font-bold mb-4">Become a creator</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">Submit your template to the Notion template gallery, get featured, and even get paid – all in just a few clicks.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Button variant="outline" className="flex items-center gap-1">
                        Get started <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </section>
    </div>
}