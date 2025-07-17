import { APIS } from "../../api";
import { CardList } from "../../pages/components/CardList";
import { Button } from "@kn/ui";
import { Input } from "@kn/ui";
import { MultiSelect } from "@kn/ui";
import { useApi } from "@kn/core";
import { Space } from "../../model/Space";
import { useSafeState } from "@kn/core";
import { Edit2, Eye, Plus, Star, UserCircle } from "@kn/icon";
import React, { useEffect } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@kn/ui";
import { useNavigator } from "@kn/core";

export const Spaces: React.FC = () => {

    const [recentPage, setRecentPage] = useSafeState<Space[]>([])
    const navigator = useNavigator()

    useEffect(() => {
        useApi(APIS.QUERY_SPACE, {}).then(res => {
            setRecentPage(res.data.records)
        })
    }, [])

    return <div className="flex justify-center">
        <div className="w-[800px] flex flex-col gap-2">
            <div className="text-[30px] font-serif font-medium flex justify-between items-center mt-[40px] mb-[40px]">
                <div> 空间</div>
                <CreateSpaceDlg trigger={
                    <Button size="sm"> <Plus className="h-4 w-4" /> 新建空间</Button>
                } />
            </div>
            <div className="flex flex-col gap-2">
                <div>最近编辑的空间</div>
                <CardList
                    data={recentPage}
                    className="h-[200px]"
                    emptyProps={{
                        button: <CreateSpaceDlg trigger={<Button>Create a space</Button>} />
                    }}
                    config={{
                        // desc: 'description',
                        cover: 'cover',
                        // name: 'name'
                    }}
                    // icon={(data) => data?.icon?.icon || data.name}
                    onClick={(data) => {
                        navigator.go({
                            to: `/space-detail/${data.id}`
                        })
                    }}
                    footer={(data) => <div className="text-sm mt-1">
                        <div className="flex flex-row items-center gap-1">
                            {data.icon.icon} {data.name}
                        </div>
                        <a className="flex flex-row items-center italic gap-1 underline  text-gray-500">
                            <UserCircle className="h-3 w-3" />Last update by Leong
                        </a>
                    </div>}
                />
            </div>
            <div className="flex flex-col gap-2">
                <div>所有空间</div>
                <div className="flex flex-row gap-1">
                    <Input className="h-8 w-[200px]" placeholder="搜索..." />
                    <MultiSelect
                        className="w-[200px]"
                        defaultValue={[]}
                        options={[]}
                        onValueChange={() => { }}
                    />
                </div>
                <div className=" flex flex-col gap-2">
                    {
                        recentPage.map((space, index) => (
                            <div key={index} className="p-1 border-secondary border rounded-md hover:bg-muted transition-all cursor-pointer duration-300 flex flex-row items-center justify-between">
                                <div className="flex flex-row items-center gap-3">
                                    <div className="text-[30px]">{space.icon.icon}</div>
                                    <div>{space.name}</div>
                                </div>
                                <div className="flex flex-row gap-1">
                                    <Button size="sm" variant="ghost"><Edit2 className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost"><Star className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        ))
                    }
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious href="#" />
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationLink href="#">1</PaginationLink>
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationLink href="#" isActive>
                                    2
                                </PaginationLink>
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationLink href="#">3</PaginationLink>
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationEllipsis />
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext href="#" />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            </div>
        </div>
    </div>
}