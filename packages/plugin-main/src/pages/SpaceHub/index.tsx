import { useTranslation } from "@kn/common";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Select, SelectTrigger, SelectValue } from "@kn/ui";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { CardList } from "../components/CardList";
import { SearchIcon, UserCircle } from "@kn/icon";
import { Space } from "../../model/Space";
import { useApi, useNavigator } from "@kn/core";
import { APIS } from "../../api";
import { CreateSpaceDlg } from "../components/SpaceForm";



export const SpaceHub: React.FC<PropsWithChildren> = (props) => {

    const { t } = useTranslation()
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const navigator = useNavigator()



    useEffect(() => {
            useApi(APIS.QUERY_SPACE, { template: false, pageSize: 100 }).then(res => {
                setRecentSpaces(res.data.records)
            })
    }, [])

    return <Dialog>
        <DialogTrigger>{props.children}</DialogTrigger>
        <DialogContent className="max-w-none w-[70%]">
            <DialogHeader>
                <DialogTitle>{t('space-hub.all-space', 'All Spaces')}</DialogTitle>
                <DialogDescription />
            </DialogHeader>
            <Label>Favorites</Label>
            <CardList
                data={recentSpaces}
                    className="h-[200px]"
                    emptyProps={{
                        button: <CreateSpaceDlg trigger={<Button>{t("home.create-space")}</Button>} />
                    }}
                    config={{
                        // desc: 'description',
                        cover: 'cover',
                        // name: 'name'
                    }}
                    // icon={(data) => data?.icon?.icon || data.name}
                    onClick={(data: any) => {
                        navigator.go({
                            to: `/space-detail/${data.id}`
                        })
                    }}
                    footer={(data: any) => <div className="text-sm mt-1">
                        <div className="flex flex-row items-center gap-1">
                            {data.icon.icon} {data.name}
                        </div>
                        <a className="flex flex-row items-center italic gap-1 underline  text-gray-500">
                            <UserCircle className="h-3 w-3" />Last update by Leong
                        </a>
                    </div>}
            />
            <div className="flex items-center gap-2">
                <div>All Spaces</div>
                <Input className="h-7" icon={<SearchIcon className="h-4 w-4" />} />
                <Select>
                    <SelectTrigger className="h-7 w-[200px]">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                </Select>
            </div>
            <CardList
                data={[]}
            />
        </DialogContent>
    </Dialog>
}