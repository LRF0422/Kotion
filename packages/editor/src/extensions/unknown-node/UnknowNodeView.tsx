import { GO_TO_MARKETPLACE, event, useTranslation } from "@kn/common";
import { Puzzle, ShieldCheck, ShoppingBag } from "@kn/icon";
import { Button } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

const formatPluginName = (nodeType: string) =>
    nodeType
        .replace(/^plugin[-_]/i, "")
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

export const UnknownNodeView: React.FC<NodeViewProps> = (props) => {
    const { t } = useTranslation();
    const nodeType = String(props.node.attrs.nodeType || "Unknown");
    const pluginName = formatPluginName(nodeType);

    const openMarketplace = () => {
        event.emit(GO_TO_MARKETPLACE);
    };

    return (
        <NodeViewWrapper className="my-4 w-full" contentEditable={false}>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-background shadow-sm ring-1 ring-border/70">
                    <Puzzle className="size-5 text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                            {t("editor.missingPlugin.title", { plugin: pluginName })}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="size-3" />
                            {t("editor.missingPlugin.preserved")}
                        </span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {t("editor.missingPlugin.description")}
                    </p>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0 gap-2"
                    onMouseDown={event => event.preventDefault()}
                    onClick={event => {
                        event.stopPropagation();
                        openMarketplace();
                    }}
                >
                    <ShoppingBag className="size-4" />
                    {t("editor.missingPlugin.browse")}
                </Button>
            </div>
        </NodeViewWrapper>
    );
};
