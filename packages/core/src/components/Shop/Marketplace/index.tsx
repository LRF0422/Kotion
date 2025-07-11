import { SearchIcon } from "@repo/icon";
import { Button, Card, CardDescription, CardHeader, CardTitle, Input, ScrollArea, Select, Separator, cn } from "@repo/ui";
import React, { useState } from "react";

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

    return <div className="w-full">
        <div>
            <div className=" flex justify-between items-start w-full p-2">
                <div>
                    <Button size="sm" variant="secondary">Installed Plugins</Button>
                </div>
                <div className="space-y-2">
                    <Input placeholder="Search plugins" className="h-9 w-[500px] bg-muted" icon={<SearchIcon className="h-4 w-4" />} />
                    <div className="flex gap-2 items-center justify-between w-full text-[20px]">
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
            <ScrollArea className="w-full h-[calc(100vh-100px)] rounded-sm">
                <div className="flex gap-2 items-center">
                    <Card className=" h-[100px] w-[300px]">
                        <CardHeader>
                            <CardTitle>
                                2123
                            </CardTitle>
                            <CardDescription>
                                2123
                            </CardDescription>
                        </CardHeader>
                    </Card>
                    <Card className=" h-[100px] w-[300px]">
                        <CardHeader>
                            <CardTitle>
                                2123
                            </CardTitle>
                            <CardDescription>
                                2123
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </ScrollArea>
        </div>
    </div>
}