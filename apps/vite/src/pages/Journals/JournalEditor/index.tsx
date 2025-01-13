import { CollaborationEditor } from "@repo/editor";
import { GlobalState } from "../../../store/GlobalState";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import deepEqual from "deep-equal";
import React, { useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import * as Y from "@repo/editor"

export const JournalEditor: React.FC = () => {
    const params = useParams()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [users, setUsers] = useState<any[]>()
    const lastAwarenessRef = useRef<any[]>([])
    const [synceStatus, setSyncStatus] = useState(false)
    const [status, setStatus] = useState<any>({
        status: 'connecting'
    })

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
            },
            onStatus: (status) => {
                setStatus(status)
            }
        })
    }, [params.pageId])

    return <div>
        {
            synceStatus && <CollaborationEditor
                provider={provider}
                id={params.pageId as string}
                user={userInfo}
                token={params.pageId as string}
            />
        }
    </div>
}