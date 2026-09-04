import { useNavigator, useTranslation } from "@kn/common";
import { Puzzle, ShieldCheck, ShoppingBag } from "@kn/icon";
import { Button, cn } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

export const formatPluginName = (nodeType: string) =>
    nodeType
        .replace(/^plugin[-_]/i, "")
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

export const UnknownNodeView: React.FC<NodeViewProps> = (props) => {
    const { t } = useTranslation();
    const navigator = useNavigator();
    const nodeType = String(props.node.attrs.nodeType || "Unknown");
    const pluginName = formatPluginName(nodeType);

    return (
        <NodeViewWrapper
            className="not-prose my-3 w-full [&.ProseMirror-selectednode]:outline-none"
            contentEditable={false}
        >
            <div
                className={cn(
                    "flex w-full max-w-none flex-col gap-3 rounded-lg border border-border/60 bg-card p-3",
                    "transition-[border-color,background-color,box-shadow] duration-150 md:flex-row md:items-center",
                    props.selected && "border-ring/40 bg-accent/20 ring-1 ring-ring/10"
                )}
            >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                        <Puzzle className="size-4 text-muted-foreground" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-5 text-foreground">
                            {t("editor.missingPlugin.title", { plugin: pluginName })}
                        </h3>
                        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                            {t("editor.missingPlugin.description")}
                        </p>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheck className="size-3.5" />
                            {t("editor.missingPlugin.preserved")}
                        </span>
                    </div>
                </div>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-12 h-11 shrink-0 self-start gap-1.5 px-2 text-muted-foreground hover:text-foreground md:ml-0 md:self-center"
                    onMouseDown={event => event.preventDefault()}
                    onClick={event => {
                        event.stopPropagation();
                        navigator.go({ to: "/plugin-hub" });
                    }}
                >
                    <ShoppingBag className="size-4" />
                    {t("editor.missingPlugin.browse")}
                </Button>
            </div>
        </NodeViewWrapper>
    );
};
