import React from "react";
import { Outlet } from "@kn/common";
import { Header } from "../Header";
import { ScrollArea } from "@kn/ui";
import { Footer } from "../Footer";


export const Layout: React.FC = () => {
    return <div>
        <header>
            <Header />
        </header>
        <ScrollArea className="h-[calc(100vh-65px)]">
            <main>
                <Outlet />
            </main>
            <Footer />
        </ScrollArea>
    </div>
}