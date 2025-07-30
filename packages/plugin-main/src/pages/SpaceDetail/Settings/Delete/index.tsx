import { Alert, AlertTitle, AlertDescription } from "@kn/ui"
import { Button } from "@kn/ui"
import React from "react"

export const Delete: React.FC = () => {
    return <div className="flex flex-col gap-2">
        <Alert variant="destructive">
            {/* <AlertCircle className="h-5 w-5" /> */}
            <AlertTitle>删除空间</AlertTitle>
            <AlertDescription>
                将此空间放入回收站会立即移除空间中的所有内容。只有 Confluence 管理员才能从回收站恢复空间。
                如果您希望可以选择自行还原空间，则可改为将其归档。
            </AlertDescription>
        </Alert>
        <Button className="w-[150px]" variant="destructive">将空间删除</Button>
    </div>
}