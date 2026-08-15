import { CollaborationEditor } from "@kn/editor";
import { GlobalState, getAccessToken } from "@kn/common";
import { TiptapCollabProvider } from "@kn/editor";
import { deepEqual } from "@kn/common";
import React, { useMemo, useRef, useState } from "react";
import { useSelector } from "@kn/common";
import { useParams } from "@kn/common";
import * as Y from "@kn/editor"

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
            baseUrl: (import.meta as any).env?.VITE_COLLABORATION_WS_URL || 'ws://www.simple-platform.cn:1234',
            name: params.pageId as string,
            // Auth token is the user's access token — never the pageId.
            token: getAccessToken() || '',
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