import { useTranslation } from "@kn/common";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { CardList } from "../components/CardList";
import { SearchIcon } from "@kn/icon";
import { Space } from "../../model/Space";
import { useApi, useNavigator } from "@kn/core";
import { APIS } from "../../api";



export const SpaceHub: React.FC<PropsWithChildren> = (props) => {

    const { t } = useTranslation()
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const navigator = useNavigator()



    useEffect(() => {
        useApi(APIS.QUERY_SPACE, { template: false, pageSize: 5 }).then(res => {
            setRecentSpaces(res.data.records)
        })
    }, [])

    return <Dialog>
        <DialogTrigger>{props.children}</DialogTrigger>
        <DialogContent className="max-w-none w-[70%] overflow-auto">
            <DialogHeader>
                <DialogTitle>{t('space-hub.all-space', 'All Spaces')}</DialogTitle>
                <DialogDescription />
            </DialogHeader>
            <Label>Favorites</Label>
            <CardList
                className="h-[200px]"
                containerClassName="grid-cols-6"
                config={{
                    // desc: 'description',
                    cover: 'cover',
                    // name: 'name'
                }}
                data={recentSpaces}
                footer={(data) => <div className="text-sm italic text-gray-500">
                    {data.name}
                </div>}
                // icon={(space) => space.icon.icon}
                onClick={(space) => {
                    navigator.go({
                        to: `/space-detail/${space.id}`
                    })
                }}

            />
            <div className="flex items-center gap-2">
                <Input className="h-9" icon={<SearchIcon className="h-4 w-4" />} placeholder="Search" />
                <Select>
                    <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="APP">App</SelectItem>
                        <SelectItem value="FEATURE">Feature</SelectItem>
                        <SelectItem value="CONNECTOR">Connector</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-1 border rounded-sm p-1">
                {recentSpaces.map((space, index) => (<div
                    className="flex items-center cursor-pointer gap-2 bg-muted/55 hover:bg-muted p-1 rounded-sm transition-all" key={index}
                    onClick={() => {
                        navigator.go({
                            to: `/space-detail/${space.id}`
                        })
                    }}
                >
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="text-[30px]">{space.icon.icon}</div>
                            <div>{space.name}</div>
                        </div>
                    </div>
                </div>))}
            </div>
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious size="sm" href="#" />
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationLink size="sm" href="#">1</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationLink size="sm" href="#" isActive>
                            2
                        </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationLink size="sm" href="#">3</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationEllipsis />
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationNext size="sm" href="#" />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </DialogContent>
    </Dialog>
}