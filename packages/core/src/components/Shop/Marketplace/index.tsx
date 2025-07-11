import { HomeIcon, SearchIcon } from "@repo/icon";
import { Avatar, Button, Card, CardDescription, CardHeader, CardTitle, EmptyState, Input, ScrollArea, Select, Separator, cn } from "@repo/ui";
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
    const [plugins, setPlugins] = useState<any[]>([
        {
            name: "Plugin 1",
            category: "Knowledge"
        },
        {
            name: "Plugin 2",
            category: "Project"
        },
        {
            name: "Plugin 3",
            category: "Tools"
        },
        {
            name: "Plugin 4",
            category: "Music"
        },
        {
            name: "Plugin 5",
            category: "Wiki"
        }
    ])

    return <div className="w-full">
        <div>
            <div className=" flex justify-between items-start w-full px-2 py-3">
                <div>
                    <Button size="sm" variant="secondary">Installed Plugins</Button>
                </div>
                <div className="space-y-2">
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
                {
                    plugins.length === 0 ? (
                        <EmptyState
                            className="h-full w-full max-w-none"
                            title="No plugins found"
                            description="Try searching for something else"
                        />
                    ) : <div className=" grid grid-cols-3 gap-2 w-full h-full">
                        {
                            plugins.map((plugin, index) => (
                                <div key={index}>
                                    <Card className="h-[130px] relative hover:bg-muted/40 cursor-pointer">
                                        <div className=" w-[80px] text-center absolute right-0 top-0 text-xs text-gray-300 p-1 rounded-sm bg-muted">
                                            {plugin.category}
                                        </div>
                                        <CardHeader>
                                            <CardTitle className=" text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className=" border rounded-sm">
                                                        {/* <HomeIcon /> */}
                                                    </Avatar>
                                                    <div>
                                                        {plugin.name}
                                                        <div className="text-xs text-secondary">
                                                            {plugin.name}
                                                        </div>
                                                    </div>
                                                </div>
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
                }
            </ScrollArea>
        </div>
    </div>
}