
import { Outlet } from "react-router-dom"
import { SiderMenu } from "./components/SiderMenu"
import { useEffect, useState } from "react"
import { SparklesText, cn } from "@kn/ui"
import { useApi } from "./hooks/use-api"
import { APIS } from "./api"
import { useDispatch } from "react-redux"
import { useNavigator } from "./hooks/use-navigator"
import { ErrorBoundary } from "react-error-boundary"
// import Logo from "@/assets/logo.png"
import { EventSourcePolyfill } from 'event-source-polyfill';
import { BUSINESS_TOPIC, GO_TO_MARKETPLACE, ON_MESSAGE, event } from "@kn/common"
import { toast } from "@kn/ui"
import { ErrorPage } from "./components/ErrorPage"
import React from "react"

export function Layout() {

    const dispatch = useDispatch()
    const navigator = useNavigator()

    useEffect(() => {
        event.emit("REFRESH_PLUSINS")
        event.on(GO_TO_MARKETPLACE, () => {
            navigator.go({
                to: '/plugin-hub'
            })
        })
    }, [])

    useEffect(() => {
        useApi(APIS.GET_USER_INFO).then((res) => {
            dispatch({
                type: 'UPDATE_USER',
                payload: res.data
            })
        }).catch(e => {
            navigator.go({
                to: '/login'
            })
        })
    }, [])

    useEffect(() => {
        const eventSource = new EventSourcePolyfill('http://www.simple-platform.cn:88/knowledge-message/sse/connect', {
            headers: {
                'Knowledge-Auth': localStorage.getItem("knowledge-token") as string,
                'Authorization': `Basic ${window.btoa(`${'wiki'}:${'wiki_secret'}`)}`
            },
            withCredentials: false
        });
        eventSource.addEventListener("open", () => {
            console.log('connected');
        })
        eventSource.addEventListener('message', (e) => {
            event.emit(ON_MESSAGE, JSON.parse(e.data))
        })
        return () => {
            eventSource.close()
        }
    }, [])

    useEffect(() => {
        event.on(ON_MESSAGE, (message: any) => {
            if (message.data) {
                if (message.data && message.data.topic === BUSINESS_TOPIC.PAGE_COOPERATION_INVITE) {
                    toast(message.data.title, {
                        position: 'top-right',
                        closeButton: true,
                        duration: Infinity,
                        description: message.data.message,
                        action: {
                            label: '接受',
                            onClick: () => { }
                        },
                        cancel: {
                            label: '拒绝',
                            onClick: () => { }
                        }
                    })
                }
            }
        })
        return () => {
            event.off(ON_MESSAGE)
        }
    }, [])


    return (
        <ErrorBoundary fallback={<ErrorPage />}>
            <div className={cn("grid min-h-screen w-full transition-all grid-cols-[70px_1fr]")}>
                <div className="border-r md:block">
                    <div className="flex h-full max-h-screen flex-col gap-3 items-center pt-4">
                        {/* <img src={Logo} className="h-9 w-9" /> */}
                        <SparklesText className=" text-[30px]" sparklesCount={5} text="KN" />
                        <div className="flex-1 px-2">
                            <SiderMenu />
                        </div>
                    </div>
                </div>
                <main className="h-screen w-full overflow-auto">
                    <Outlet />
                </main>
            </div>
        </ErrorBoundary>
    )
}
