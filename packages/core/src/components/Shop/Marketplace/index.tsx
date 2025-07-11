import { SearchIcon } from "@repo/icon";
import { Button, Card, CardDescription, CardHeader, CardTitle, Input, ScrollArea, Select, Separator, cn } from "@repo/ui";
import React, { useEffect, useState } from "react";

export const Marketplace: React.FC = () => {

    const [categories, setCategories] = React.useState<string[]>([
        "All",
        "Knowledge",
        "Project",
        "Tools",
        "Music",
        "Wiki"
    ])

    const [selectCategory, setSelectCategory] = useState<string>("All")
    const [plugins, setPlugins] = useState<any[]>([])

    useEffect(() => {
        for (let i = 0; i < 20; i++) {
            setPlugins(plugins => [...plugins, {
                name: "Plugin " + i,
                description: "This is a plugin",
                author: "Author " + i,
                category: categories[Math.floor(Math.random() * categories.length)],
                stars: Math.floor(Math.random() * 100),
                downloads: Math.floor(Math.random() * 100000),
                version: "1.0.0",
            }])
        }
    }, [])

    return <div className="w-full">
        <div>
            <div className=" flex justify-between items-start w-full p-2">
                <div>
                    <Button size="sm" variant="secondary">Installed Plugins</Button>
                </div>
                <div className="space-y-2">
                    <div className=" text-center prose prose:text-white ">
                        <h1>Empower your AI Editor</h1>
                        <p>Discover
                            Models
                            ,
                            Tools
                            ,
                            Agent Strategies
                            ,
                            Extensions
                            and
                            Bundles
                            in
                            Dify Marketplace</p>
                    </div>
                    <Input placeholder="Search plugins" className="h-9 w-[500px] bg-muted" icon={<SearchIcon className="h-4 w-4" />} />
                    <div className="flex gap-2 items-center justify-between w-full text-[16px]">
                        {
                            categories.map((it, index) => <div
                                onClick={() => setSelectCategory(it)}
                                className={cn("rounded-sm px-3 py-1 hover:bg-muted cursor-pointer", selectCategory === it ? "bg-muted outline" : "")}
                                key={index}>
                                {it}
                            </div>)
                        }
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <Button size="sm" variant="secondary">Request a plugin</Button>
                    <Button size="sm">Publish plugins</Button>
                </div>
            </div>
        </div>
        <div className="bg-muted/40 w-full rounded-sm px-10  space-y-2 py-2">
            <div className="flex gap-2 items-center h-[30px]">
                <span>Result</span>
                <Separator orientation="vertical" />
                <Select></Select>
            </div>
            <ScrollArea className="w-full h-[calc(100vh-160px)] rounded-sm">
                <div className=" grid grid-cols-3 gap-2 w-full">
                    {
                        plugins.map((plugin, index) => (
                            <div key={index}>
                                <Card className="h-[120px] relative">
                                    <div className=" w-[80px] text-center absolute right-0 top-0 text-xs text-gray-300 p-1 rounded-sm bg-muted">
                                        {plugin.category}
                                    </div>
                                    <CardHeader>
                                        <CardTitle>
                                            2123
                                        </CardTitle>
                                        <CardDescription>
                                            {plugin.name}
                                        </CardDescription>
                                    </CardHeader>
                                </Card>
                            </div>
                        ))
                    }
                </div>
            </ScrollArea>
        </div>
    </div>
}