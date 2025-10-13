import React from "react";
import { Outlet } from "@kn/common";
import { Header } from "../Header";
import { ScrollArea } from "@kn/ui";


export const Layout: React.FC = () => {
    return <div>
        <header>
            <Header />
        </header>
        <main>
            <ScrollArea className="h-[calc(100vh-65px)]">
                <Outlet />
            </ScrollArea>
        </main>
    </div>
}