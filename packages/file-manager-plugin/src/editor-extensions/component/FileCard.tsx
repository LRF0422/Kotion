import { FolderIcon } from "@repo/icon";
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Checkbox } from "@repo/ui";
import React from "react";


export interface FileCardProps {
    isSelect: boolean
    name: string
    suffix: string
    isFolder: boolean
}


export const FileCard: React.FC = () => {
    return <Card className="bg-[red]">
        <CardHeader className="p-0">
            <CardTitle className="p-0 m-0">
                <Checkbox className="ml-1" />
            </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
            <FolderIcon className="h-20 w-20" strokeWidth={0.6} />
        </CardContent>
        <CardFooter className="p-1 m-0 border-t">
            123
        </CardFooter>
    </Card>
}