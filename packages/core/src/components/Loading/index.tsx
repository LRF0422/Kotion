import { Loader2 } from "@kn/icon";
import { useToggle } from "ahooks";
import React, { createContext, useContext, useState } from "react"



export interface LoadingState {
    loading: boolean;
    text?: string;
    toggleLoading: (text?: string) => void;
}

const initalState: LoadingState = {
    loading: false,
    text: "加载中...",
    toggleLoading: () => null
}


export const LoadingContext = createContext<LoadingState>(initalState);

export const toggleLoading = () => {
    const { } = useContext(LoadingContext);
}
export const LoadingProvider = ({ children }: { children: React.ReactNode }) => {

    const [loading, { toggle }] = useToggle(true)
    const [text, setText] = useState<string | undefined>("加载中...")

    const toggleLoading = (text?: string) => {
        setText(text)
        toggle()
        if (!loading) {
            setTimeout(() => {
                setText("加载中...")
            }, 500)
        }
    }

    return <LoadingContext.Provider value={{
        loading,
        text: "加载中...",
        toggleLoading: toggleLoading
    }}>
        <div className=" absolute w-full h-full z-50 flex items-center justify-center bg-white dark:bg-black opacity-75">
            <Loader2 className=" animate-spin" />
        </div>
        {children}
    </LoadingContext.Provider>
}