import { ExtensionWrapper } from "@kn/common";
import { EditorMenu } from "../../editor/EditorMenu";
import { PageContext } from "../../editor/context";
import { useEditorExtension } from "../../editor/use-extension";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { AnyExtension, NodeViewProps } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { EditorContent, NodeViewWrapper, useEditor } from "@tiptap/react";
import { useSafeState } from "ahooks";
import React, { useCallback, useContext, useEffect, useMemo } from "react";
import { Doc } from 'yjs'
import { StyledEditor } from "../../styles/editor";


export const SyncBlockView: React.FC<NodeViewProps> = (props) => {

    const { editor, node } = props
    const [extensions, extensionWrappers] = useEditorExtension()
    const [syncStatus, setSyncStatus] = useSafeState(false)
    const pageInfo = useContext(PageContext)
    const blockId = node.attrs.blockId

    const formatId = useCallback(() => {
        return "space:" + pageInfo?.spaceId + "|page:" + pageInfo?.id + "|block:" + blockId
    }, [pageInfo?.id, blockId])

    const provider = useMemo(() => {
        const key = formatId()
        console.log('key', key);

        const doc = new Doc()
        return new TiptapCollabProvider({
            baseUrl: 'ws://www.simple-platform.cn:1234',
            name: key,
            token: key,
            document: doc,
            onSynced: () => {
                console.log('subDocument synced', doc.isSynced);

                setSyncStatus(true)
            },
        })
    }, [node.attrs.id, editor.isEditable])

    const _editor = useEditor({
        editable: editor.isEditable,
        content: {},
        extensions: [
            ...extensions as AnyExtension[],
            // Document.extend({
            //     content: 'block*'
            // }),
            Collaboration.configure({
                document: provider.document,
                field: 'default'
            })
        ] as AnyExtension[],
        editorProps: {
            attributes: {
                class: "magic-editor",
                spellcheck: "false",
                suppressContentEditableWarning: "false",
            }
        }
    }, [editor.isEditable])

    useEffect(() => {

        return () => {
            if (provider) {
                provider.disconnect()
                provider.destroy()
            }
        }
    }, [])

    return <NodeViewWrapper className="outline rounded-sm leading-normal">
        {
            _editor && syncStatus && <>
                <StyledEditor className=" min-h-10">
                    <EditorContent editor={_editor} />
                </StyledEditor>
                <EditorMenu editor={_editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} toolbar={false} /></>
        }

    </NodeViewWrapper>
}