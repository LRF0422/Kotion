import { Alert, AlertDescription, AlertTitle } from "@kn/ui";
import { Button } from "@kn/ui";
import React from "react";


export const Archive: React.FC = () => {
    return <div className="flex flex-col gap-2">
        <Alert className="">
            {/* <AlertCircle className="h-5 w-5" /> */}
            <AlertTitle>归档</AlertTitle>
            <AlertDescription>
                将空间归档可以使其在基本网站导航中隐藏起来，这样可以消除混乱情况，因而更容易找到最新和最相关的内容。以后如果需要，您随时可以找到已归档的空间，并且随时可以对其进行恢复。
            </AlertDescription>
        </Alert>
        <Button className="w-[150px]">将空间归档</Button>
    </div>
}