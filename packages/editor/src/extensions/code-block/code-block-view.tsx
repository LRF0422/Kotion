import React, { useRef, useMemo, useState } from "react";
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from "@tiptap/react";

import { Select } from "../../components";
import { copy } from "../../utilities";
import { Copy, Trash2, Check } from "@kn/icon";
import { Button, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@kn/ui";

export const CodeBlockView: React.FC<NodeViewProps> = ({
  editor,
  node: { attrs },
  updateAttributes,
  extension,
  deleteNode
}) => {
  const isEditable = editor.isEditable;
  const { language: defaultLanguage } = attrs;
  const $container = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

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

  const handleCopy = () => {
    copy($container?.current?.innerText as string);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <NodeViewWrapper style={{ position: "relative" }}>
      <TooltipProvider>
        <div className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 overflow-hidden my-4">
          <div className="flex flex-row justify-between items-center px-4 py-2 border-b border-border bg-muted/50 dark:bg-muted/20">
            <Select
              className="w-[140px] h-8 text-sm"
              editor={editor}
              value={defaultLanguage || "auto"}
              options={languages}
              onChange={(value) => updateAttributes({ language: value })}
              disabled={!isEditable}></Select>
            <div className="flex gap-2 items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? "Copied!" : "Copy code"}
                </TooltipContent>
              </Tooltip>
              {isEditable && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteNode()}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Delete code block
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <div className="p-4">
            <pre ref={$container} className="m-0 overflow-x-auto">
              <NodeViewContent />
            </pre>
          </div>
        </div>
      </TooltipProvider>
    </NodeViewWrapper>
  );
};
