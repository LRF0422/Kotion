import { ArchiveIcon, ArrowUpRight, BoxIcon, DownloadIcon, FilePlus2, PlusIcon, SearchIcon } from "@kn/icon";
import { Avatar, Button, Card, CardDescription, CardFooter, CardHeader, CardTitle, EmptyState, IconButton, Input, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, cn } from "@kn/ui";
import React, { useState } from "react";
import { PluginUploader } from "../PluginUploader";

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
        },
        {
            name: "Plugin 6",
            category: "Wiki"
        },
        {
            name: "Plugin 6",
            category: "Wiki"
        },
        {
            name: "Plugin 6",
            category: "Wiki"
        },
        {
            name: "Plugin 6",
            category: "Wiki"
        },
        {
            name: "Plugin 6",
            category: "Wiki"
        },
        {
            name: "Plugin 6",
            category: "Wiki"
        }
    ])

    return <div className="w-full">
        <div className=" flex justify-between items-start w-full px-2 py-3 border-b shadow-sm">
            <div>
                <Button size="sm" variant="secondary"><ArchiveIcon className="h-4 w-4 mr-1" />Installed Plugins</Button>
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
                <Button size="sm" variant="secondary"><FilePlus2 className="h-4 w-4 mr-1" />Request a plugin</Button>
                <PluginUploader>
                    <Button size="sm"><PlusIcon className="h-4 w-4 mr-1" />Publish plugins</Button>
                </PluginUploader>
            </div>
        </div>
        <div className="bg-muted/40 w-full rounded-sm px-10  space-y-3 py-2">
            <div className="flex gap-2 items-center h-[30px] text-sm">
                <span>Result</span>
                <Separator orientation="vertical" />
                <Select>
                    <SelectTrigger className="w-[180px] h-8">
                        <div className=" mr-2">Sort by</div> <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <ScrollArea className="w-full h-[calc(100vh-160px)] rounded-sm">
                {
                    plugins.length === 0 ? (
                        <EmptyState
                            className="h-[calc(100vh-160px)] hover:bg-background w-full max-w-none border-none flex flex-col justify-center"
                            title="No plugins found"
                            icons={[BoxIcon]}
                            description="Try searching for something else"
                        />
                    ) : <div className=" grid grid-cols-3 gap-2 w-full h-full">
                        {
                            plugins.map((plugin, index) => (
                                <div key={index}>
                                    <Card className="relative hover:bg-muted/30 ">
                                        <div className=" w-[80px] text-center absolute right-0 top-0 text-xs p-1  rounded-bl-md rounded-tr-md bg-secondary">
                                            {plugin.category}
                                        </div>
                                        <CardHeader>
                                            <CardTitle className=" text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className=" border rounded-sm w-[60px] h-[60px]">
                                                        {/* <HomeIcon /> */}
                                                    </Avatar>
                                                    <div>
                                                        anspire_search
                                                        <div className="text-xs text-gray-400">
                                                            anspire
                                                            /
                                                            anspire_search
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardTitle>
                                            <CardDescription>
                                                The next generation of real-time intelligent search engine for AI provides multi-channel and full-network content in a user-friendly format for your applications.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardFooter className="pb-3 space-x-1">
                                            <IconButton className="px-2 border" icon={<div className="flex items-center gap-1 text-sm">
                                                <DownloadIcon className="w-4 h-4" />
                                                Install
                                            </div>} />
                                            <IconButton className="px-2 border" icon={<div className="flex items-center gap-1 text-sm">
                                                <ArrowUpRight className="w-4 h-4" />
                                                Details
                                            </div>} />
                                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                                <DownloadIcon className="h-3 w-3" />1000,00
                                            </div>
                                        </CardFooter>
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