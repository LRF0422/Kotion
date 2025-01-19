import { Button } from "@repo/ui";
import { useNavigator } from "../hooks/use-navigator";
import React from "react";

export const ErrorPage: React.FC = () => {

    const navigator = useNavigator()

    return <div className=" w-screen h-screen flex justify-center items-center">
        <div className="flex flex-col gap-2 items-center">
            <div>
                出错了！
            </div>
            <Button size="sm" onClick={() => {
                navigator.go({
                    to: '/home'
                })
            }}>返回首页</Button>
        </div>
    </div>
}