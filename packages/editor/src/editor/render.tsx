import React, {
  ReactNode,
  forwardRef,
  useImperativeHandle
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EditorKit } from "./kit";
import { EditorProvider } from "./provider";
import { AnyExtension, Content, Editor } from "@tiptap/core";
import { ExtensionWrapper } from "@repo/common";
import TableOfContents, { getHierarchicalIndexes } from "@tiptap-pro/extension-table-of-contents";
import { useEditorExtension } from "./use-extension";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { ThemeProvider } from "styled-components";
import light from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { cn } from "@repo/ui";
import { useSafeState } from "ahooks";
import { ToC } from "./ToC";
import { PageContext, PageContextProps } from "./context";

export interface EditorRenderProps extends EditorProvider, EditorKit {
  content?: Content;
  extensionConfig?: ExtensionWrapper[];
  isEditable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  id: string;
  offsetTop?: number,
  isColl?: boolean
  provider?: TiptapCollabProvider,
  className?: string,
  toolbar?: boolean,
  user?: any
  toc?: boolean
  pageInfo?: PageContextProps
  withTitle?: boolean
}

const MemorizedToC = React.memo(ToC)

export const EditorRender = forwardRef<
  Editor | null,
  React.PropsWithChildren<EditorRenderProps>
>((props, ref) => {
  const {
    content,
    extensions,
    isEditable,
    toc = true,
    pageInfo,
    withTitle = true
  } = props;

  const [exts, wrappers] = useEditorExtension(undefined, withTitle)


  const editor = useEditor(
    {
      content: content,
      editable: isEditable,
      extensions: [
        ...(extensions as AnyExtension[] || []),
        ...(exts as AnyExtension[] || []),
        TableOfContents.configure({
          getIndex: getHierarchicalIndexes,
          onUpdate: (data) => {
            setTableOfContents(data)
          }
        }),
      ],
      editorProps: {
        attributes: {
          class: "magic-editor",
          spellcheck: "false",
          suppressContentEditableWarning: "true",
        }
      }
    },
    []
  );

  const [tableOfContents, setTableOfContents] = useSafeState<any[]>()

  useImperativeHandle(ref, () => editor as Editor);
  return (editor && tableOfContents &&
    <PageContext.Provider value={pageInfo}>
      <ThemeProvider theme={light}>
        <div className={cn("w-[calc(100vw-350px)]", props.className)} id="editor-container">
          <div className="flex flex-row relative w-full">
            <StyledEditor className="overflow-auto grow">
              <EditorContent editor={editor} />
            </StyledEditor>
            {toc && <div className={cn("flex-none h-[calc(100vh-60px)] w-[300px] border-l sticky right-0 top-0")}>
              <MemorizedToC editor={editor as Editor} items={tableOfContents} />
            </div>}
          </div>
        </div>
      </ThemeProvider>
    </PageContext.Provider>
  );
});

EditorRender.displayName = "EditorRender";
