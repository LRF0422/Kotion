import { Input, Label, ScrollArea } from "@kn/ui";
import React, { useEffect, useState } from "react";
import type { LogicFlowEdgeData, LogicFlowNodeData } from "../model/types";

export type SelectedElement = LogicFlowNodeData | LogicFlowEdgeData;

function textValue(element: SelectedElement): string {
  if (typeof element.text === "string") return element.text;
  return element.text?.value ?? "";
}

function stringProperty(
  element: SelectedElement,
  key: string,
  fallback: string,
): string {
  const value = element.properties?.[key];
  return typeof value === "string" ? value : fallback;
}

export function PropertiesPanel({
  element,
  readOnly,
  onTextChange,
  onPropertiesChange,
}: {
  element: SelectedElement | null;
  readOnly: boolean;
  onTextChange: (value: string) => void;
  onPropertiesChange: (properties: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");
  const [draftElementId, setDraftElementId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState(false);
  useEffect(() => {
    const nextId = element?.id ?? null;
    if (nextId !== draftElementId) {
      setDraftElementId(nextId);
      setText(element ? textValue(element) : "");
      setEditingText(false);
    } else if (!editingText) {
      setText(element ? textValue(element) : "");
    }
  }, [draftElementId, editingText, element]);
  if (!element) {
    return (
      <div className="flex h-full items-center justify-center p-5 text-center text-xs text-muted-foreground">
        选择节点或连线后编辑属性
      </div>
    );
  }
  const fill = stringProperty(element, "fill", "#ffffff");
  const stroke = stringProperty(element, "stroke", "#64748b");
  const textColor = stringProperty(element, "textColor", "#0f172a");
  const update = (key: string, value: string) => {
    const current = element.properties ?? {};
    const style =
      current.style &&
      typeof current.style === "object" &&
      !Array.isArray(current.style)
        ? current.style
        : {};
    const textStyle =
      current.textStyle &&
      typeof current.textStyle === "object" &&
      !Array.isArray(current.textStyle)
        ? current.textStyle
        : {};
    onPropertiesChange({
      ...current,
      [key]: value,
      ...(key === "fill" || key === "stroke"
        ? { style: { ...style, [key]: value } }
        : {}),
      ...(key === "textColor"
        ? { textStyle: { ...textStyle, color: value } }
        : {}),
    });
  };
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">类型</Label>
          <Input value={element.type} disabled className="h-11 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">文字</Label>
          <Input
            value={text}
            disabled={readOnly}
            className="h-11 text-xs"
            onFocus={() => setEditingText(true)}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
              onTextChange(text);
              setEditingText(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 text-xs">
            <span className="text-muted-foreground">填充</span>
            <input
              type="color"
              value={fill}
              disabled={readOnly}
              className="h-11 w-full rounded border bg-background p-1"
              onChange={(event) => update("fill", event.target.value)}
            />
          </label>
          <label className="space-y-1.5 text-xs">
            <span className="text-muted-foreground">边框</span>
            <input
              type="color"
              value={stroke}
              disabled={readOnly}
              className="h-11 w-full rounded border bg-background p-1"
              onChange={(event) => update("stroke", event.target.value)}
            />
          </label>
        </div>
        <label className="space-y-1.5 text-xs">
          <span className="text-muted-foreground">文字颜色</span>
          <input
            type="color"
            value={textColor}
            disabled={readOnly}
            className="h-11 w-full rounded border bg-background p-1"
            onChange={(event) => update("textColor", event.target.value)}
          />
        </label>
      </div>
    </ScrollArea>
  );
}
