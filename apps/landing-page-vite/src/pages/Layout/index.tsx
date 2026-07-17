import React from "react";
import { Outlet } from "@kn/common";
import { Header } from "../Header";
import { ScrollArea } from "@kn/ui";
import { Footer } from "../Footer";


export const Layout: React.FC = () => {
    return (
        <div
            className="min-h-screen"
            style={{ background: "var(--kn-paper)", color: "var(--kn-ink)" }}
        >
            <div className="absolute" id="ref"></div>
            <header>
                <Header />
            </header>
            <ScrollArea className="h-[calc(100dvh-65px)]">
                <main>
                    <Outlet />
                </main>
                <Footer />
            </ScrollArea>
        </div>
    );
};
