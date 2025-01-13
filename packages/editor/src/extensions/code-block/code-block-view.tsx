import React, { useRef, useMemo } from "react";
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from "@tiptap/react";

import { Button, Select } from "../../components";
import { copy } from "../../utilities";
import { Copy } from "@repo/icon";

export const CodeBlockView_: React.FC<NodeViewProps> = ({
  editor,
  node: { attrs },
  updateAttributes,
  extension
}) => {
  const isEditable = editor.isEditable;
  const { language: defaultLanguage } = attrs;
  const $container = useRef<HTMLPreElement>(null);

  const languages = useMemo(
    () => [
      {
        label: "auto",
        value: "auto"
      },
      ...(extension?.options?.lowlight?.listLanguages?.() || []).map((lang: string) => ({
        label: lang,
        value: lang
      }))
    ],
    [extension]
  );

  return (
    <NodeViewWrapper style={{ position: "relative" }}>
      <div className="border rounded-sm p-2 flex flex-col gap-2">
        <div className="flex flex-row justify-between items-center">
          <Select
            className="w-[120px]"
            editor={editor}
            value={defaultLanguage || "auto"}
            options={languages}
            onChange={(value) => updateAttributes({ language: value })}
            disabled={!isEditable}></Select>
          <Button
            size="small"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => copy($container?.current?.innerText as string)}
          />
        </div>
        <div>
          <pre ref={$container} className="prose-pre:bg-slate-600">
            <NodeViewContent as="code" className="prose-code:text-black" />
          </pre>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const CodeBlockView = React.memo(CodeBlockView_)
