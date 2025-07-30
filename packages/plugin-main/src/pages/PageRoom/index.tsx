import { APIS } from "../../api";
import { Badge } from "@kn/ui";
import { Button } from "@kn/ui";
import { Separator } from "@kn/ui";
import { CollaborationEditor } from "@kn/editor";
import { useApi } from "@kn/core";
import { useNavigator } from "@kn/core";
import { GlobalState } from "@kn/core";
import { TiptapCollabProvider } from "@kn/editor";
import { Editor } from "@kn/editor";
import { useToggle } from "@kn/core";
import { deepEqual } from "@kn/core";
import { LoaderCircle, LogOut, MessageSquareText } from "@kn/icon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "@kn/core";
import { useParams } from "@kn/core";
import * as Y from "@kn/editor"

export const PageRoom: React.FC = () => {
    const [page, setPage] = useState<any>()
    const params = useParams()
    const { userInfo, rightCollpase } = useSelector((state: GlobalState) => state)
    const [loading, { toggle }] = useToggle(false)
    const [synceStatus, setSyncStatus] = useState(false)
    const lastAwarenessRef = useRef<any[]>([])
    const dispatch = useDispatch()
    const [status, setStatus] = useState<any>({
        status: 'connecting'
    })
    const [users, setUsers] = useState<any[]>()
    const editor = useRef<Editor>(null)
    const navigator = useNavigator()

    useEffect(() => {
        useApi(APIS.GET_PAGE_CONTENT, { id: params.pageId }).then((res) => {
            setPage(res.data)
        })
        return () => {
            setPage(null)
        }
    }, [params.pageId])

    const handleCollpase = () => {
        dispatch({
            type: 'UPDATE_RIGHT_COLLPASE',
            payload: !rightCollpase
        })
    }

    const handleExit = () => {
        navigator.go({
            to: '/'
        })
    }

    const provider = useMemo(() => {
        const doc = new Y.Doc()
        return new TiptapCollabProvider({
            baseUrl: 'ws://www.simple-platform.cn:1234',
            name: params.pageId as string,
            token: params.pageId as string,
            document: doc,
            onAwarenessUpdate: ({ states }) => {
                const users = states.map((state) => ({ clientId: state.clientId, user: state.user }));
                if (deepEqual(userInfo, lastAwarenessRef.current)) {
                    return;
                }
                setUsers(users)
                lastAwarenessRef.current = users;
            },
            onSynced: () => {
                setSyncStatus(true)
            }
        })
    }, [params.pageId])

    return page && <div className="w-full h-full">
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b-[1px] border-solid border-zinc-100 bg-white">
            <div className="flex flex-row items-center gap-2 px-1 text-sm">
                {"😘"}
                <span>{page.title}</span>
            </div>
            <div className="flex flex-row items-center gap-1 px-1">
                <Badge>
                    <div className="flex flex-row items-center gap-1">
                        {status?.status} {loading && <LoaderCircle className="h-3 w-3 animate-spin" />}
                    </div>
                </Badge>
                <Separator orientation="vertical" />
                <Button variant="ghost" size="icon" onClick={handleCollpase}>
                    <MessageSquareText className="h-5 w-5" />
                </Button>
                <Separator orientation="vertical" />
                <Button variant="ghost" size="icon" onClick={handleExit} >
                    <LogOut className="h-4 w-4" />
                </Button>
            </div>
        </header>
        <main className=" w-full flex flex-row justify-center">
            {
                synceStatus && <CollaborationEditor
                    ref={editor}
                    provider={provider}
                    className="h-[calc(100vh-80px)]"
                    id={params.pageId as string}
                    user={userInfo}
                    token={params.pageId as string}
                    content={JSON.parse(page.content)}
                    onStatus={(s) => {
                        setStatus(s)
                    }}
                    onAwarenessUpdate={(u) => {
                        console.log('users', u);
                        setUsers(u)
                    }}
                />
            }
        </main>
    </div>
}