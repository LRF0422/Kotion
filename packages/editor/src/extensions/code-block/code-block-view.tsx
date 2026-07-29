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
        {/* not-prose: keep Tailwind Typography from forcing its dark `pre` background/colors */}
        <div className="not-prose group rounded-xl border border-border dark:border-border/80 p-1.5 my-4 bg-background">
          <div className="relative rounded-lg bg-muted dark:bg-muted/50 overflow-hidden">
            <div
              className={`absolute right-2 top-2 z-10 flex gap-0.5 items-center rounded-md border border-border/60 bg-background/95 shadow-sm transition-opacity duration-150 ${copied ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
              contentEditable={false}
            >
              <Select
                className="h-7 w-auto gap-1 px-2 text-xs text-muted-foreground border-none bg-transparent shadow-none hover:text-foreground focus:ring-0 focus:ring-offset-0"
                editor={editor}
                value={defaultLanguage || "auto"}
                options={languages}
                onChange={(value) => updateAttributes({ language: value })}
                disabled={!isEditable}></Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
                      className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
            <pre ref={$container} className="m-0 overflow-x-auto px-4 py-3.5 bg-transparent text-foreground text-sm leading-relaxed">
              <NodeViewContent />
            </pre>
          </div>
        </div>
      </TooltipProvider>
    </NodeViewWrapper>
  );
};
