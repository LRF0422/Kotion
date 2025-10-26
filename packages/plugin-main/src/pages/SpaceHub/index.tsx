import { useTranslation } from "@kn/common";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle, Label, Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { CardList } from "../components/CardList";
import { EyeIcon, SearchIcon, StarIcon, ViewIcon } from "@kn/icon";
import { Space } from "../../model/Space";
import { useApi, useDebounce, useNavigator } from "@kn/core";
import { APIS } from "../../api";



export const SpaceHub: React.FC<PropsWithChildren> = (props) => {

    const { t } = useTranslation()
    const [favorites, setFavorites] = useState<Space[]>([])
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const [catrgory, setCatrgory] = useState<string>('All')
    const [searchValue, setSearchValue] = useState<string>()
    const navigator = useNavigator()

    const value = useDebounce(searchValue, {
        wait: 500
    })



    useEffect(() => {
        useApi(APIS.QUERY_SPACE, { template: false, pageSize: 5, searchValue: value }).then(res => {
            setRecentSpaces(res.data.records)
        })
    }, [value])

    useEffect(() => {
        useApi(APIS.QUERY_SPACE, { template: false, favorite: true, pageSize: 5 }).then(res => {
            setFavorites(res.data.records)
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
                className="h-[250px]"
                containerClassName="grid-cols-6"
                config={{
                    // desc: 'description',
                    cover: 'cover',
                    // name: 'name'
                }}
                data={favorites}
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
                <Input className="h-9" icon={<SearchIcon className="h-4 w-4" />} placeholder="Search" onChange={(e) => setSearchValue(e.target.value)}/>
                <Select value={ catrgory } onValueChange={(value) => setCatrgory(value)}>
                    <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All</SelectItem>
                        <SelectItem value="APP">App</SelectItem>
                        <SelectItem value="FEATURE">Feature</SelectItem>
                        <SelectItem value="CONNECTOR">Connector</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-1 p-1">
                {recentSpaces.map((space, index) => (<Item variant="outline" key={index} size="sm" >
                        <ItemMedia variant="image" className="text-[30px]"> 
                            { space.icon.icon }
                        </ItemMedia>
                        <ItemContent>
                            <ItemTitle>{space.name}</ItemTitle>
                            <ItemDescription>{space.description}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                        <Button size="icon" className="w-7 h-7">
                            <StarIcon className="h-4 w-4" />
                        </Button>
                        <Button size="icon" className="w-7 h-7" onClick={() => {
                            navigator.go({
                                to: `/space-detail/${space.id}`
                            })
                        }}>
                            <EyeIcon className="h-4 w-4" />
                        </Button>
                    </ItemActions>
                  </Item>
                ))}
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